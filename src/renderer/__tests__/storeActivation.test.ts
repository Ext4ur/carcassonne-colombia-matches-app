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

describe('storeActivation', () => {
  beforeEach(() => {
    mockLocalStorage();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    for (const k of Object.keys(storage)) delete storage[k];
  });

  it('filterTournamentsForStoreMode devuelve solo el torneo asignado qualifier', async () => {
    vi.stubEnv('VITE_DEVIR_STORE_MODE', 'true');
    const { setStoreActivation, filterTournamentsForStoreMode } =
      await import('../services/storeActivation');
    setStoreActivation({
      code: 'DEVIR-TEST',
      tournament_uuid: 'aaa-bbb',
      mode: 'manage',
    });
    const list = filterTournamentsForStoreMode([
      { uuid: 'aaa-bbb', type: 'qualifier', name: 'Mine' },
      { uuid: 'other', type: 'qualifier', name: 'Other' },
      { uuid: 'aaa-bbb', type: 'circuit', name: 'Wrong type' },
    ]);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Mine');
  });

  it('canManageAssignedTournament respeta modo readonly', async () => {
    vi.stubEnv('VITE_DEVIR_STORE_MODE', 'true');
    const { setStoreActivation, canManageAssignedTournament } =
      await import('../services/storeActivation');
    setStoreActivation({
      code: 'DEVIR-TEST',
      tournament_uuid: 'uuid-1',
      mode: 'readonly',
    });
    expect(canManageAssignedTournament('uuid-1')).toBe(false);
    setStoreActivation({
      code: 'DEVIR-TEST',
      tournament_uuid: 'uuid-1',
      mode: 'join',
    });
    expect(canManageAssignedTournament('uuid-1')).toBe(true);
  });

  it('sin modo tienda no filtra torneos', async () => {
    vi.stubEnv('VITE_DEVIR_STORE_MODE', '');
    const { filterTournamentsForStoreMode } = await import('../services/storeActivation');
    const input = [
      { uuid: 'a', type: 'qualifier' },
      { uuid: 'b', type: 'circuit' },
    ];
    expect(filterTournamentsForStoreMode(input)).toEqual(input);
  });
});
