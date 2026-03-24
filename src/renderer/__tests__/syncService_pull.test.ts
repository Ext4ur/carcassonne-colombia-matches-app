import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SyncService } from '../services/syncService';

// Mocks - Use vi.hoisted to ensure they are available for hoisted vi.mock calls
const {
  mockExecute,
  mockQuery,
  mockInsert,
  mockUpdate,
  mockDelete,
  mockSelect,
  mockEq,
  mockGt,
  mockIn,
  mockMaybeSingle,
  mockLimit,
  mockOrder,
  mockFrom,
} = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockQuery: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
  mockSelect: vi.fn(),
  mockEq: vi.fn(),
  mockGt: vi.fn(),
  mockIn: vi.fn(),
  mockLimit: vi.fn(),
  mockOrder: vi.fn(),
  mockMaybeSingle: vi.fn().mockImplementation(() => Promise.resolve({ data: null, error: null })),
  mockFrom: vi.fn(),
}));

vi.mock('../api/clients/SqliteClient', () => ({
  SqliteClient: vi.fn().mockImplementation(() => ({
    execute: mockExecute,
    query: mockQuery,
  })),
}));

interface MockChain {
  insert: (...args: unknown[]) => MockChain;
  update: (...args: unknown[]) => MockChain;
  delete: (...args: unknown[]) => MockChain;
  select: (...args: unknown[]) => MockChain;
  eq: (...args: unknown[]) => MockChain;
  gt: (...args: unknown[]) => MockChain;
  in: (...args: unknown[]) => MockChain;
  limit: (...args: unknown[]) => MockChain;
  order: (...args: unknown[]) => MockChain;
  maybeSingle: (...args: unknown[]) => Promise<{ data: unknown; error: unknown; status: number }>;
  then: (
    onFulfilled: (value: { data: unknown; error: unknown; status: number }) => unknown
  ) => Promise<unknown>;
}

/** `data` for awaitable queries: array => row list; single object => one row; used by .in() / .then() */
const createMockChain = (data: unknown = [], error: unknown = null, status = 200): MockChain => {
  const rows: unknown[] = Array.isArray(data) ? data : data != null ? [data] : [];
  const chain: MockChain = {
    insert: (...args: unknown[]) => {
      mockInsert(...args);
      return chain;
    },
    update: (...args: unknown[]) => {
      mockUpdate(...args);
      return chain;
    },
    delete: (...args: unknown[]) => {
      mockDelete(...args);
      return chain;
    },
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return chain;
    },
    eq: (...args: unknown[]) => {
      mockEq(...args);
      return chain;
    },
    gt: (...args: unknown[]) => {
      mockGt(...args);
      return chain;
    },
    in: (...args: unknown[]) => {
      mockIn(...args);
      return chain;
    },
    limit: (...args: unknown[]) => {
      mockLimit(...args);
      return chain;
    },
    order: (...args: unknown[]) => {
      mockOrder(...args);
      return chain;
    },
    maybeSingle: (...args: unknown[]) => {
      mockMaybeSingle(...args);
      return Promise.resolve({ data: rows[0] ?? null, error, status });
    },
    then: (onFulfilled: (value: { data: unknown; error: unknown; status: number }) => unknown) =>
      Promise.resolve({ data: rows, error, status }).then(onFulfilled),
  };
  return chain;
};

// Helper for mock logic
mockFrom.mockImplementation(() => {
  return createMockChain();
});

vi.mock('../api/clients/SupabaseClient', () => ({
  SupabaseClient: vi.fn().mockImplementation(() => ({
    client: {
      from: (table: string) => mockFrom(table),
    },
    query: vi.fn(),
  })),
}));

vi.mock('../api/clients/supabaseConfig', () => ({
  isSupabaseConfigured: vi.fn().mockReturnValue(true),
  getConfigError: vi.fn(),
}));

// Mock Navigator
const originalNavigator = global.navigator;

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
});

describe('SyncService Pull', () => {
  beforeEach(async () => {
    SyncService.reset();
    localStorageMock.clear();
    vi.stubGlobal('navigator', { onLine: true });

    mockExecute.mockClear();
    mockQuery.mockClear();
    mockInsert.mockClear();
    mockUpdate.mockClear();
    mockSelect.mockClear();
    mockEq.mockClear();
    mockGt.mockClear();
    mockIn.mockClear();
    mockLimit.mockClear();
    mockOrder.mockClear();
    mockMaybeSingle.mockClear();
    mockFrom.mockClear();
    vi.clearAllMocks();

    // Standard mock returns
    mockExecute.mockResolvedValue({ changes: 1 });
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM sync_meta WHERE key = 'last_audit_log_id'")) {
        return [{ value: '0' }];
      }
      return [];
    });
  });

  afterEach(() => {
    SyncService.stopSync();
    Object.defineProperty(global, 'navigator', { value: originalNavigator });
    vi.clearAllMocks();
  });

  it('pullChanges inserts remote records if not found locally', async () => {
    const remoteRecord = { uuid: 'remote-1', name: 'Remote Player', id: 100 };
    const logs = [{ id: 1, table_name: 'players', record_uuid: 'remote-1', operation: 'INSERT' }];

    // Mock audit logs
    mockFrom.mockImplementation((table: string) => {
      if (table === 'sync_audit_logs') {
        return createMockChain(logs);
      }
      if (table === 'players') {
        return createMockChain([remoteRecord]);
      }
      return createMockChain();
    });

    // Local check: not found
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM sync_meta WHERE key = 'last_audit_log_id'")) return [{ value: '0' }];
      if (sql.includes('SELECT id FROM players WHERE uuid = ?')) return [];
      return [];
    });

    // CAST to any for internal call tracking if needed, but here we use vi.fn mocks anyway
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (SyncService as any).pullChanges();

    // Verify insert - note that 'id' is stripped in insertLocalRecord
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringMatching(/INSERT INTO players/i),
      expect.arrayContaining(['remote-1', 'Remote Player'])
    );
  });

  it('pullChanges updates remote records if found locally', async () => {
    const remoteRecord = { uuid: 'remote-2', name: 'Updated Player', id: 200 };
    const logs = [{ id: 2, table_name: 'players', record_uuid: 'remote-2', operation: 'UPDATE' }];

    mockFrom.mockImplementation((table: string) => {
      if (table === 'sync_audit_logs') return createMockChain(logs);
      if (table === 'players') return createMockChain([remoteRecord]);
      return createMockChain();
    });

    // Local check: FOUND
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM sync_meta WHERE key = 'last_audit_log_id'")) return [{ value: '0' }];
      if (sql.includes('SELECT id FROM players WHERE uuid = ?')) return [{ id: 5 }];
      return [];
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (SyncService as any).pullChanges();

    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringMatching(/UPDATE players SET name = \? WHERE uuid = \?/i),
      ['Updated Player', 'remote-2']
    );
  });

  it('pullChanges performs Smart Merge (matches by Name)', async () => {
    // remote uuid is 'new-uuid', but name 'Legacy' exists locally with different uuid
    const remoteRecord = { uuid: 'new-uuid', name: 'Legacy Player', id: 300 };
    const logs = [{ id: 3, table_name: 'players', record_uuid: 'new-uuid', operation: 'INSERT' }];

    mockFrom.mockImplementation((table: string) => {
      if (table === 'sync_audit_logs') return createMockChain(logs);
      if (table === 'players') return createMockChain([remoteRecord]);
      return createMockChain();
    });

    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM sync_meta WHERE key = 'last_audit_log_id'")) return [{ value: '0' }];
      if (sql.includes('SELECT id FROM players WHERE uuid = ?')) return []; // Not found by uuid
      if (sql.includes('SELECT id FROM players WHERE name = ?')) return [{ id: 10 }]; // FOUND by name
      return [];
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (SyncService as any).pullChanges();

    // 1. Update UUID
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringMatching(/UPDATE players SET uuid = \? WHERE id = \?/i),
      ['new-uuid', 10]
    );
    // 2. Update Data
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringMatching(/UPDATE players SET name = \? WHERE uuid = \?/i),
      ['Legacy Player', 'new-uuid']
    );
  });

  it('pullChanges deletes local records', async () => {
    const logs = [
      { id: 4, table_name: 'players', record_uuid: 'deleted-uuid', operation: 'DELETE' },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === 'sync_audit_logs') return createMockChain(logs);
      return createMockChain();
    });

    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM sync_meta WHERE key = 'last_audit_log_id'")) return [{ value: '0' }];
      return [];
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (SyncService as any).pullChanges();

    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringMatching(/DELETE FROM players WHERE uuid = \?/i),
      ['deleted-uuid']
    );
  });

  it('pullChanges prefetches multiple players with one IN query', async () => {
    const r1 = { uuid: 'u1', name: 'P1', id: 1 };
    const r2 = { uuid: 'u2', name: 'P2', id: 2 };
    const logs = [
      { id: 1, table_name: 'players', record_uuid: 'u1', operation: 'INSERT' as const },
      { id: 2, table_name: 'players', record_uuid: 'u2', operation: 'INSERT' as const },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === 'sync_audit_logs') return createMockChain(logs);
      if (table === 'players') return createMockChain([r1, r2]);
      return createMockChain();
    });

    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM sync_meta WHERE key = 'last_audit_log_id'")) return [{ value: '0' }];
      if (sql.includes('SELECT id FROM players WHERE uuid = ?')) return [];
      return [];
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (SyncService as any).pullChanges();

    expect(mockIn).toHaveBeenCalled();
    expect(mockIn.mock.calls[0][0]).toBe('uuid');
    expect(mockIn.mock.calls[0][1]).toEqual(expect.arrayContaining(['u1', 'u2']));
    expect(mockEq).not.toHaveBeenCalled();

    const inserts = mockExecute.mock.calls.filter((c) =>
      String(c[0]).toLowerCase().includes('insert into players')
    );
    expect(inserts.length).toBe(2);
  });
});
