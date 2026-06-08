import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isSupabaseConfigured } from '../api/clients/supabaseConfig';
import { SyncService } from '../services/syncService';

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

// Mock import.meta.env
vi.mock('../api/clients/supabaseConfig', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    // We will control isSupabaseConfigured directly in some tests or via environment
  };
});

describe('Cloud Sync Logic', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.resetModules();
  });

  describe('isSupabaseConfigured', () => {
    it('should return false if settings are disabled (International default)', () => {
      vi.stubEnv('VITE_APP_ENV', 'international');
      expect(isSupabaseConfigured()).toBe(false);
    });

    it('should return true if settings are enabled (Colombia default)', () => {
      vi.stubEnv('VITE_APP_ENV', 'colombia');
      expect(isSupabaseConfigured()).toBe(true);
    });

    it('should respect localStorage override (enable in International)', () => {
      vi.stubEnv('VITE_APP_ENV', 'international');
      localStorageMock.setItem('cloud_sync_enabled', 'true');
      expect(isSupabaseConfigured()).toBe(true);
    });

    it('should respect localStorage override (disable in Colombia)', () => {
      vi.stubEnv('VITE_APP_ENV', 'colombia');
      localStorageMock.setItem('cloud_sync_enabled', 'false');
      expect(isSupabaseConfigured()).toBe(false);
    });
  });

  describe('SyncService Suppression', () => {
    it('should not add to queue if sync is disabled', async () => {
      vi.stubEnv('VITE_APP_ENV', 'international');
      localStorageMock.setItem('cloud_sync_enabled', 'false');

      const executeSpy = vi.fn();
      vi.mock('../api/clients/SqliteClient', () => ({
        SqliteClient: vi.fn().mockImplementation(() => ({
          execute: executeSpy,
          query: vi.fn(),
        })),
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (SyncService as any).reset();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (SyncService as any)._sqlite = { execute: executeSpy, query: vi.fn() };

      await SyncService.addToQueue('test_table', 'INSERT', { data: 'test' });
      expect(executeSpy).not.toHaveBeenCalled();
    });
  });
});
