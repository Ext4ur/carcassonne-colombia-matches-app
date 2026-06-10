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
  mockLimit,
  mockOrder,
  mockMaybeSingle,
  mockFrom,
  calls,
} = vi.hoisted(() => {
  const calls: string[] = [];
  return {
    mockExecute: vi.fn(),
    mockQuery: vi.fn(),
    mockInsert: vi.fn(),
    mockUpdate: vi.fn(),
    mockDelete: vi.fn(),
    mockSelect: vi.fn(),
    mockEq: vi.fn(),
    mockGt: vi.fn(),
    mockLimit: vi.fn(),
    mockOrder: vi.fn(),
    mockMaybeSingle: vi.fn().mockImplementation(() => Promise.resolve({ data: null, error: null })),
    mockFrom: vi.fn(),
    calls,
  };
});

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
  limit: (...args: unknown[]) => MockChain;
  order: (...args: unknown[]) => MockChain;
  maybeSingle: (...args: unknown[]) => Promise<{ data: unknown; error: unknown; status: number }>;
  then: (
    onFulfilled: (value: { data: unknown; error: unknown; status: number }) => unknown
  ) => Promise<unknown>;
}

// Create a robust chainable mock object factory
const createMockChain = (data: unknown = [], error: unknown = null, status = 200): MockChain => {
  const chain: MockChain = {
    insert: (...args: unknown[]) => {
      calls.push('insert');
      mockInsert(...args);
      return chain;
    },
    update: (...args: unknown[]) => {
      calls.push('update');
      mockUpdate(...args);
      return chain;
    },
    delete: (...args: unknown[]) => {
      calls.push('delete');
      mockDelete(...args);
      return chain;
    },
    select: (...args: unknown[]) => {
      calls.push('select');
      mockSelect(...args);
      return chain;
    },
    eq: (...args: unknown[]) => {
      calls.push('eq');
      mockEq(...args);
      return chain;
    },
    gt: (...args: unknown[]) => {
      calls.push('gt');
      mockGt(...args);
      return chain;
    },
    limit: (...args: unknown[]) => {
      calls.push('limit');
      mockLimit(...args);
      return chain;
    },
    order: (...args: unknown[]) => {
      calls.push('order');
      mockOrder(...args);
      return chain;
    },
    maybeSingle: (...args: unknown[]) => {
      mockMaybeSingle(...args);
      return Promise.resolve({ data, error, status });
    },
    then: (onFulfilled: (value: { data: unknown; error: unknown; status: number }) => unknown) =>
      Promise.resolve({ data, error, status }).then(onFulfilled),
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
  isRemoteSyncReady: vi.fn().mockReturnValue(true),
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

describe('SyncService', () => {
  beforeEach(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (SyncService as any).reset();

    // Force exact identity by injecting directly into the private static field
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (SyncService as any)._sqlite = {
      execute: mockExecute,
      query: mockQuery,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (SyncService as any)._supabase = {
      client: {
        from: mockFrom,
      },
    };

    mockExecute.mockClear();
    mockQuery.mockClear();
    mockInsert.mockClear();
    mockUpdate.mockClear();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockQuery as any)._called = false;
    mockDelete.mockClear();
    mockSelect.mockClear();
    mockEq.mockClear();
    mockMaybeSingle.mockClear();
    mockFrom.mockClear();
    calls.length = 0;
    vi.clearAllMocks();

    // Standard mock returns
    mockExecute.mockResolvedValue({ changes: 1 });
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM sync_meta WHERE key = 'last_audit_log_id'")) {
        return [{ value: '0' }];
      }
      return [];
    });

    // Default mock behavior for terminal methods
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    localStorageMock.clear();

    // Pre-set the lock
    const lockKey = 'sync_service_lock';
    localStorageMock.setItem(
      lockKey,
      JSON.stringify({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        instanceId: (SyncService as any).instanceId,
        timestamp: Date.now(),
      })
    );

    Object.defineProperty(global, 'navigator', {
      value: { onLine: true },
      writable: true,
    });
  });

  afterEach(() => {
    if (SyncService) SyncService.stopSync();
    Object.defineProperty(global, 'navigator', { value: originalNavigator });
    vi.clearAllMocks();
  });

  const runSync = async () => {
    try {
      await SyncService.sync();
    } catch (e: unknown) {
      process.stderr.write(`[Test] sync() threw: ${(e as Error).message || e}\n`);
      throw e;
    }
  };

  it('addToQueue inserts into SQLite and triggers sync if online', async () => {
    // Avoid background sync race by mocking sync() for this test
    const syncSpy = vi.spyOn(SyncService, 'sync').mockImplementation(async () => {});

    const player = { uuid: '123', name: 'Test' };
    await SyncService.addToQueue('players', 'INSERT', player);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringMatching(/INSERT\s+INTO\s+sync_queue/i),
      expect.arrayContaining(['players', 'INSERT', JSON.stringify(player)])
    );

    // Verify it triggered sync
    expect(syncSpy).toHaveBeenCalled();
    syncSpy.mockRestore();
  });

  it('pushChanges processes pending items', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (SyncService as any)._isOnline = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (SyncService as any)._isSchemaReady = true;
    const queueItem = {
      id: 1,
      table_name: 'players',
      operation: 'UPDATE',
      payload: JSON.stringify({ uuid: 'uuid-1', name: 'Player 1' }),
      status: 'pending',
      retry_count: 0,
    };

    // Mock queries to handle the sequence correctly
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('sync_meta')) return [{ value: '0' }];
      if (sql.includes('sync_queue')) {
        // Return queueItem only once per test run
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!(mockQuery as any)._called) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (mockQuery as any)._called = true;
          return [queueItem];
        }
        return [];
      }
      return [];
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockQuery as any)._called = false;

    await runSync();
    await new Promise((r) => setTimeout(r, 20));

    // Verify via calls array (absolute proof of execution)
    expect(calls).toContain('update');

    // Check if mockUpdate was called
    expect(mockUpdate).toHaveBeenCalled();
  });

  it('pushChanges handles idempotency (skips insert if exists)', async () => {
    const queueItem = {
      id: 2,
      table_name: 'players',
      operation: 'INSERT',
      payload: JSON.stringify({ uuid: 'uuid-2', name: 'Player 2' }),
      status: 'pending',
    };

    // Mock queue and sync_meta
    let queryCount = 0;
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM sync_meta WHERE key = 'last_audit_log_id'")) return [{ value: '0' }];
      if (sql.includes('SELECT * FROM sync_queue')) {
        return queryCount++ === 0 ? [queueItem] : [];
      }
      return [];
    });

    // Mock Supabase finding existing record
    mockMaybeSingle.mockResolvedValue({ data: { id: 55 }, error: null });

    await runSync();

    // NO insert
    expect(mockInsert).not.toHaveBeenCalled();

    // Delete from queue (success)
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringMatching(/DELETE\s+FROM\s+sync_queue/i),
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

    // Mock queue and sync_meta
    let queryCount = 0;
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM sync_meta WHERE key = 'last_audit_log_id'")) return [{ value: '0' }];
      if (sql.includes('SELECT * FROM sync_queue')) {
        return queryCount++ === 0 ? [queueItem] : [];
      }
      return [];
    });

    await runSync();

    expect(mockFrom).toHaveBeenCalledWith('tournaments'); // pushChanges
    // Should update with payload
    expect(mockUpdate).toHaveBeenCalledWith({ uuid: 'uuid-3', status: 'completed' });
    expect(mockEq).toHaveBeenCalledWith('uuid', 'uuid-3');

    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringMatching(/DELETE\s+FROM\s+sync_queue/i),
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

    // Mock queue and sync_meta
    let queryCount = 0;
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM sync_meta WHERE key = 'last_audit_log_id'")) return [{ value: '0' }];
      if (sql.includes('SELECT * FROM sync_queue')) {
        return queryCount++ === 0 ? [queueItem] : [];
      }
      return [];
    });

    // Mock finding NO existing record (so it tries to INSERT)
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    // Force a failure on INSERT for correctly testing retry logic
    mockFrom.mockImplementation((table: string) => {
      if (table === 'players') {
        const errorChain = createMockChain(null, { message: 'Network Error' }, 200);
        return errorChain;
      }
      return createMockChain();
    });

    await runSync();

    // Should update to failed
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringMatching(/UPDATE\s+sync_queue\s+SET\s+status\s+=\s+'failed'/i),
      ['Network Error', 4]
    );
  });

  it('skips sync if offline', async () => {
    // Mock Offline
    Object.defineProperty(global, 'navigator', {
      value: { onLine: false },
      writable: true,
    });

    await runSync();

    // Should not query queue
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
