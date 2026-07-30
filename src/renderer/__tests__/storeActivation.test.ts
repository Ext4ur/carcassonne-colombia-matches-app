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

  it('getAssignedTournamentUuid returns assigned uuid in store mode', async () => {
    vi.stubEnv('VITE_DEVIR_STORE_MODE', 'true');
    const { setStoreActivation, getAssignedTournamentUuid } =
      await import('../services/storeActivation');
    setStoreActivation({
      code: 'DEVIR-TEST',
      tournament_uuid: 'aaa-bbb',
      mode: 'manage',
    });
    expect(getAssignedTournamentUuid()).toBe('aaa-bbb');
  });

  it('getAssignedTournamentUuid is null outside store mode', async () => {
    vi.stubEnv('VITE_DEVIR_STORE_MODE', '');
    const { setStoreActivation, getAssignedTournamentUuid } =
      await import('../services/storeActivation');
    setStoreActivation({
      code: 'DEVIR-TEST',
      tournament_uuid: 'aaa-bbb',
      mode: 'manage',
    });
    expect(getAssignedTournamentUuid()).toBeNull();
  });

  it('getMachineFingerprint persists across calls', async () => {
    const { getMachineFingerprint } = await import('../services/storeActivation');
    const a = getMachineFingerprint();
    const b = getMachineFingerprint();
    expect(a).toBe(b);
    expect(a.startsWith('fp-')).toBe(true);
  });
});
