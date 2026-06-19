import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const storage: Record<string, string> = {};

function mockLocalStorage() {
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage[k] ?? null,
    setItem: (k: string, v: string) => {
      storage[k] = v;
    },
    removeItem: (k: string) => {
      delete storage[k];
    },
    clear: () => {
      for (const k of Object.keys(storage)) delete storage[k];
    },
    key: () => null,
    length: 0,
  });
}

describe('storeLifecycle', () => {
  beforeEach(() => {
    mockLocalStorage();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    for (const k of Object.keys(storage)) delete storage[k];
  });

  it('admin mode: can always create and delete', async () => {
    vi.stubEnv('VITE_DEVIR_STORE_MODE', 'false');
    const mod = await import('../services/storeLifecycle');
    expect(mod.canCreateStoreTournament([{ type: 'qualifier' }])).toBe(true);
    expect(mod.canDeleteStoreTournament()).toBe(true);
    expect(mod.isStoreKioskLocked([])).toBe(false);
    expect(mod.canEditStoreTournament('completed')).toBe(true);
  });

  it('store mode: create only when no qualifier tournaments', async () => {
    vi.stubEnv('VITE_DEVIR_STORE_MODE', 'true');
    const mod = await import('../services/storeLifecycle');
    expect(mod.canCreateStoreTournament([])).toBe(true);
    expect(mod.canCreateStoreTournament([{ type: 'qualifier', status: 'draft' }])).toBe(false);
    expect(mod.canCreateStoreTournament([{ type: 'circuit' }])).toBe(true);
  });

  it('store mode: clears stale kiosk lock when DB is empty', async () => {
    vi.stubEnv('VITE_DEVIR_STORE_MODE', 'true');
    storage.store_kiosk_locked = 'true';
    const mod = await import('../services/storeLifecycle');
    expect(mod.canCreateStoreTournament([])).toBe(true);
    expect(mod.isStoreKioskLockedFlag()).toBe(false);
  });

  it('store mode: cannot delete tournaments', async () => {
    vi.stubEnv('VITE_DEVIR_STORE_MODE', 'true');
    const mod = await import('../services/storeLifecycle');
    expect(mod.canDeleteStoreTournament()).toBe(false);
  });

  it('store mode: locked when completed or flag set', async () => {
    vi.stubEnv('VITE_DEVIR_STORE_MODE', 'true');
    const mod = await import('../services/storeLifecycle');
    expect(mod.isStoreKioskLocked([{ status: 'in_progress', type: 'qualifier' }])).toBe(false);
    expect(mod.isStoreKioskLocked([{ status: 'completed', type: 'qualifier' }])).toBe(true);
    expect(mod.isStoreTournamentReadOnly('completed')).toBe(true);
    expect(mod.canEditStoreTournament('completed')).toBe(false);
    mod.setStoreKioskLocked();
    expect(mod.isStoreKioskLocked([{ status: 'in_progress', type: 'qualifier' }])).toBe(true);
  });

  it('store mode: filters to qualifier tournaments only', async () => {
    vi.stubEnv('VITE_DEVIR_STORE_MODE', 'true');
    const mod = await import('../services/storeLifecycle');
    const list = [
      { id: 1, type: 'qualifier' as const },
      { id: 2, type: 'circuit' as const },
    ];
    expect(mod.filterTournamentsForStoreKiosk(list)).toEqual([{ id: 1, type: 'qualifier' }]);
  });
});
