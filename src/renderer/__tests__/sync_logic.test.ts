import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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

/** Supabase URL/key are read once at module load; re-import after stubbing env. */
async function loadSupabaseConfig() {
  return import('../api/clients/supabaseConfig');
}

describe('Cloud Sync Logic', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.resetModules();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-publishable-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('isSupabaseConfigured', () => {
    it('should return false when Supabase env vars are missing', async () => {
      vi.stubEnv('VITE_SUPABASE_URL', '');
      vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');
      vi.resetModules();
      const { isSupabaseConfigured } = await loadSupabaseConfig();
      expect(isSupabaseConfigured()).toBe(false);
    });

    it('should return false if settings are disabled (International default)', async () => {
      vi.stubEnv('VITE_APP_ENV', 'international');
      const { isSupabaseConfigured } = await loadSupabaseConfig();
      expect(isSupabaseConfigured()).toBe(false);
    });

    it('should return true if settings are enabled (Colombia default)', async () => {
      vi.stubEnv('VITE_APP_ENV', 'colombia');
      const { isSupabaseConfigured } = await loadSupabaseConfig();
      expect(isSupabaseConfigured()).toBe(true);
    });

    it('should respect localStorage override (enable in International)', async () => {
      vi.stubEnv('VITE_APP_ENV', 'international');
      localStorageMock.setItem('cloud_sync_enabled', 'true');
      const { isSupabaseConfigured } = await loadSupabaseConfig();
      expect(isSupabaseConfigured()).toBe(true);
    });

    it('should respect localStorage override (disable in Colombia)', async () => {
      vi.stubEnv('VITE_APP_ENV', 'colombia');
      localStorageMock.setItem('cloud_sync_enabled', 'false');
      const { isSupabaseConfigured } = await loadSupabaseConfig();
      expect(isSupabaseConfigured()).toBe(false);
    });
  });

  describe('SyncService Suppression', () => {
    it('should not add to queue if sync is disabled', async () => {
      vi.stubEnv('VITE_APP_ENV', 'international');
      localStorageMock.setItem('cloud_sync_enabled', 'false');

      const executeSpy = vi.fn();
      vi.doMock('../api/clients/SqliteClient', () => ({
        SqliteClient: vi.fn().mockImplementation(() => ({
          execute: executeSpy,
          query: vi.fn(),
        })),
      }));

      const { SyncService } = await import('../services/syncService');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (SyncService as any).reset();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (SyncService as any)._sqlite = { execute: executeSpy, query: vi.fn() };

      await SyncService.addToQueue('test_table', 'INSERT', { data: 'test' });
      expect(executeSpy).not.toHaveBeenCalled();
    });
  });
});
