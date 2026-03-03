/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mocks
const mockExecute = vi.fn();
const mockQuery = vi.fn();

// Mock Supabase methods
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockSelect = vi.fn();
// mockEq and mockSingle are unused in this file, removed to fix lint errors

// Mock SqliteClient
vi.mock('../api/clients/SqliteClient', () => {
  return {
    SqliteClient: vi.fn().mockImplementation(() => ({
      execute: mockExecute,
      query: mockQuery,
    })),
  };
});

// Mock Supabase Client Chain
// For Pull, we do: await this.supabase.client!.from(table).select('*');
// So we need to ensure .select returns a promise with { data, error }

const mockFrom = vi.fn().mockReturnValue({
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
  delete: mockDelete,
});

vi.mock('../api/clients/SupabaseClient', () => {
  return {
    SupabaseClient: vi.fn().mockImplementation(() => ({
      client: {
        from: mockFrom,
      },
      query: vi.fn(),
    })),
  };
});

vi.mock('../api/clients/supabaseConfig', () => ({
  isSupabaseConfigured: vi.fn().mockReturnValue(true),
  getConfigError: vi.fn(),
}));

// Mock Navigator
const originalNavigator = global.navigator;

describe('SyncService Pull', () => {
  let SyncService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Standard mock returns
    mockExecute.mockResolvedValue({ changes: 1 });
    mockQuery.mockResolvedValue([]); // Default: no pending changes, no local records found

    mockSelect.mockResolvedValue({ data: [], error: null });

    // Mock navigator.onLine
    Object.defineProperty(global, 'navigator', {
      value: { onLine: true },
      writable: true,
    });

    // Dynamic import
    const mod = await import('../services/syncService');
    SyncService = mod.SyncService;
  });

  afterEach(() => {
    if (SyncService) SyncService.stopSync();
    Object.defineProperty(global, 'navigator', { value: originalNavigator });
  });

  it('pullChanges inserts remote records if not found locally', async () => {
    // Mock remote data
    const remoteData = [{ uuid: 'remote-uuid-1', name: 'New Player', id: 999 }];
    mockSelect.mockResolvedValue({ data: remoteData, error: null });

    // Mock local lookup: not found by uuid, not found by name
    // 1. Pending changes lookup -> []
    // 2. Select by UUID -> []
    // 3. Select by Name -> []
    mockQuery
      .mockResolvedValueOnce([]) // Pending Check
      .mockResolvedValueOnce([] as any[]) // By UUID check
      .mockResolvedValueOnce([] as any[]); // By Name check (if triggered)

    // Mock push queue check (empty)
    // Wait, sync calls pull then push.
    // We only care about pull logic here. sync() calls pullChanges then pushChanges.
    // We can call pullChanges via sync or via private method access if exposed or just check calls.

    // We will call sync()
    // We need to mock push queue to be empty so it doesn't do much
    mockQuery.mockResolvedValue([]); // Push queue empty (this query happens inside pushChanges)

    // BUT, Query mock is called sequentially.
    // Sequence inside pullChanges for 1 table (players):
    // 1. SELECT payload FROM sync_queue WHERE table_name = 'players'...
    // 2. SELECT * FROM players WHERE uuid = 'remote-uuid-1'
    // 3. SELECT * FROM players WHERE name = 'New Player'... (Smart Merge check)
    // 4. INSERT INTO players ...

    // We need 4 iterations of tables (players, tournaments, cities, places).
    // Let's focus on 'players' table only.

    // We can just verify that INSERT was called with correct SQL.

    // Setup specific mocks for queries to control flow
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('SELECT payload FROM sync_queue')) return Promise.resolve([]);
      if (sql.includes('SELECT * FROM players WHERE uuid')) return Promise.resolve([]);
      if (sql.includes('SELECT * FROM players WHERE name')) return Promise.resolve([]); // Not found by name
      if (sql.includes('INSERT INTO')) return Promise.resolve({ changes: 1 });
      if (sql.includes('UPDATE')) return Promise.resolve({ changes: 1 });
      return Promise.resolve([]);
    });

    await SyncService.sync();

    // Verify Insert was called for 'players'
    // We expect: INSERT INTO players (name, uuid) VALUES (?, ?) ...
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO players'),
      expect.arrayContaining(['New Player', 'remote-uuid-1'])
    );
  });

  it('pullChanges updates local record if found by UUID', async () => {
    const remoteData = [{ uuid: 'uuid-1', name: 'Updated Name', id: 999 }];
    mockSelect.mockResolvedValue({ data: remoteData, error: null });

    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('sync_queue')) return Promise.resolve([]);
      if (sql.includes('WHERE uuid'))
        return Promise.resolve([{ id: 10, uuid: 'uuid-1', name: 'Old Name' }]);
      return Promise.resolve([]);
    });

    await SyncService.sync();

    // Expect Update
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE players SET'),
      expect.arrayContaining(['Updated Name', 'uuid-1'])
    );
  });

  it('pullChanges skips update if pending local change exists', async () => {
    const remoteData = [{ uuid: 'uuid-1', name: 'Remote Name', id: 999 }];
    mockSelect.mockResolvedValue({ data: remoteData, error: null });

    // Mock pending change
    mockQuery.mockImplementation((sql: string, params: any[]) => {
      if (sql.includes('sync_queue') && params && params[0] === 'players') {
        return Promise.resolve([
          { payload: JSON.stringify({ uuid: 'uuid-1', name: 'Local Change' }) },
        ]);
      }
      return Promise.resolve([]);
    });

    await SyncService.sync();

    // Should NOT update
    expect(mockExecute).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE players'),
      expect.anything()
    );
  });

  it('pullChanges performs Smart Merge (matches by Name)', async () => {
    const remoteData = [{ uuid: 'remote-uuid-2', name: 'Common Name', id: 888 }];
    mockSelect.mockResolvedValue({ data: remoteData, error: null });

    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('sync_queue')) return Promise.resolve([]);
      if (sql.includes('WHERE uuid')) return Promise.resolve([]); // Not found by UUID
      if (sql.includes('WHERE name'))
        return Promise.resolve([{ id: 20, uuid: 'local-uuid-2', name: 'Common Name' }]); // Found by Name
      return Promise.resolve([]);
    });

    await SyncService.sync();

    // Expect 2 updates:
    // 1. Update UUID: UPDATE players SET uuid = ? WHERE id = ?
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE players SET uuid = ? WHERE id = ?'),
      ['remote-uuid-2', 20]
    );

    // 2. Update fields: UPDATE players SET ... WHERE uuid = ?
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE players SET'),
      expect.arrayContaining(['Common Name', 'remote-uuid-2'])
    );
  });
});
