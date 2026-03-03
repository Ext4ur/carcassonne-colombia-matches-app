/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mocks - Defined BEFORE import
const mockExecute = vi.fn();
const mockQuery = vi.fn();

// Mock Supabase methods
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();

// Mock SqliteClient
vi.mock('../api/clients/SqliteClient', () => {
  return {
    SqliteClient: vi.fn().mockImplementation(() => ({
      execute: mockExecute,
      query: mockQuery,
    })),
  };
});

const mockMaybeSingle = vi
  .fn()
  .mockImplementation(() => Promise.resolve({ data: null, error: null }));
const mockLimit = vi.fn().mockReturnThis();
const mockOrder = vi.fn().mockReturnThis();

// Create a robust chainable mock object
const mockChain: any = {
  insert: mockInsert,
  update: mockUpdate,
  delete: mockDelete,
  select: mockSelect,
  eq: mockEq,
  limit: mockLimit,
  order: mockOrder,
  single: mockSingle,
  maybeSingle: mockMaybeSingle,
  // behaves like a promise when awaited
  then: (onFulfilled: any) =>
    Promise.resolve({ data: [], error: null, status: 200 }).then(onFulfilled),
};

// Ensure all methods return the chain to allow any order of chaining
mockInsert.mockReturnValue(mockChain);
mockUpdate.mockReturnValue(mockChain);
mockDelete.mockReturnValue(mockChain);
mockSelect.mockReturnValue(mockChain);
mockEq.mockReturnValue(mockChain);
mockLimit.mockReturnValue(mockChain);
mockOrder.mockReturnValue(mockChain);
mockSingle.mockImplementation(() => Promise.resolve({ data: null, error: null }));
mockMaybeSingle.mockImplementation(() => Promise.resolve({ data: null, error: null }));

const mockFrom = vi.fn().mockReturnValue(mockChain);

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

describe('SyncService', () => {
  let SyncService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Standard mock returns
    mockExecute.mockResolvedValue({ changes: 1 });
    mockQuery.mockResolvedValue([]);

    // Ensure chainable mocks return the chain (already set globally, but reset here to be safe)
    mockInsert.mockReturnValue(mockChain);
    mockUpdate.mockReturnValue(mockChain);
    mockDelete.mockReturnValue(mockChain);
    mockSelect.mockReturnValue(mockChain);
    mockEq.mockReturnValue(mockChain);
    mockSingle.mockImplementation(() => Promise.resolve({ data: null, error: null }));
    mockMaybeSingle.mockImplementation(() => Promise.resolve({ data: null, error: null }));

    // Mock navigator.onLine
    Object.defineProperty(global, 'navigator', {
      value: { onLine: true },
      writable: true,
    });

    // Dynamic import to pick up fresh mocks
    const mod = await import('../services/syncService');
    SyncService = mod.SyncService;
  });

  afterEach(() => {
    if (SyncService) SyncService.stopSync();
    Object.defineProperty(global, 'navigator', { value: originalNavigator });
  });

  it('addToQueue inserts into SQLite and triggers sync if online', async () => {
    await SyncService.addToQueue('test_table', 'INSERT', { uuid: '123', name: 'Test' });

    expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO sync_queue'), [
      'test_table',
      'INSERT',
      JSON.stringify({ uuid: '123', name: 'Test' }),
    ]);
  });

  it('pushChanges processes pending items', async () => {
    const queueItem = {
      id: 1,
      table_name: 'players',
      operation: 'INSERT',
      payload: JSON.stringify({ uuid: 'uuid-1', name: 'Player 1', id: 100 }), // local id 100
      status: 'pending',
      retry_count: 0,
    };

    // Mock getting item
    mockQuery.mockResolvedValueOnce([queueItem]);

    await SyncService.sync();

    // 1. Check if it tried to update status to processing
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE sync_queue SET status = 'processing'"),
      [1]
    );

    // 2. Check Supabase Insert
    expect(mockFrom).toHaveBeenCalledWith('players');
    // Verify ID was stripped
    expect(mockInsert).toHaveBeenCalledWith({ uuid: 'uuid-1', name: 'Player 1' });

    // 3. Check Delete from Queue
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM sync_queue'),
      [1]
    );
  });

  it('pushChanges handles idempotency (skips insert if exists)', async () => {
    const queueItem = {
      id: 2,
      table_name: 'players',
      operation: 'INSERT',
      payload: JSON.stringify({ uuid: 'uuid-2', name: 'Player 2' }),
      status: 'pending',
    };

    mockQuery.mockResolvedValueOnce([queueItem]);

    // Mock Supabase finding existing record
    mockMaybeSingle.mockResolvedValue({ data: { id: 55 }, error: null });

    await SyncService.sync();

    // Select check
    expect(mockSelect).toHaveBeenCalledWith('id');
    expect(mockEq).toHaveBeenCalledWith('uuid', 'uuid-2');

    // NO insert
    expect(mockInsert).not.toHaveBeenCalled();

    // Delete from queue (success)
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM sync_queue'),
      [2]
    );
  });

  it('pushChanges handles update', async () => {
    const queueItem = {
      id: 3,
      table_name: 'tournaments',
      operation: 'UPDATE',
      payload: JSON.stringify({ uuid: 'uuid-3', status: 'completed' }),
      status: 'pending',
    };

    mockQuery.mockResolvedValueOnce([queueItem]);

    await SyncService.sync();

    expect(mockFrom).toHaveBeenCalledWith('tournaments');
    // Should update with payload
    expect(mockUpdate).toHaveBeenCalledWith({ uuid: 'uuid-3', status: 'completed' });
    expect(mockEq).toHaveBeenCalledWith('uuid', 'uuid-3');

    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM sync_queue'),
      [3]
    );
  });

  it('handles failures and updates retry count', async () => {
    const queueItem = {
      id: 4,
      table_name: 'players',
      operation: 'INSERT',
      payload: JSON.stringify({ uuid: 'fail-uuid' }),
      status: 'pending',
      retry_count: 0,
    };

    mockQuery.mockResolvedValueOnce([queueItem]);
    // Mock NOT finding existing record
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    // Mock failure on the final .select() call (which has no arguments)
    mockSelect.mockImplementation((columns) => {
      if (columns) return mockChain;
      return Promise.resolve({ data: null, error: { message: 'Network Error' } });
    });

    await SyncService.sync();

    // Should NOT delete
    expect(mockExecute).not.toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM sync_queue'),
      [4]
    );

    // Should update to failed
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE sync_queue SET status = 'failed'"),
      ['Network Error', 4]
    );
  });

  it('skips sync if offline', async () => {
    // Mock Offline
    Object.defineProperty(global, 'navigator', {
      value: { onLine: false },
      writable: true,
    });

    await SyncService.sync();

    // Should not query queue
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
