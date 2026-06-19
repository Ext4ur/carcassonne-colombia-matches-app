import { describe, it, expect, vi, afterEach } from 'vitest';

describe('appMode', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('isStoreMode solo con VITE_DEVIR_STORE_MODE', async () => {
    vi.stubEnv('VITE_DEVIR_STORE_MODE', 'true');
    vi.stubEnv('VITE_DEVIR_HQ_MODE', '');
    const { isStoreMode, isDevirHqMode, isLocalOnlyMode } = await import('../utils/appMode');
    expect(isStoreMode()).toBe(true);
    expect(isDevirHqMode()).toBe(false);
    expect(isLocalOnlyMode()).toBe(true);
  });

  it('isDevirHqMode solo con VITE_DEVIR_HQ_MODE', async () => {
    vi.stubEnv('VITE_DEVIR_STORE_MODE', '');
    vi.stubEnv('VITE_DEVIR_HQ_MODE', 'true');
    const { isStoreMode, isDevirHqMode, isLocalOnlyMode } = await import('../utils/appMode');
    expect(isStoreMode()).toBe(false);
    expect(isDevirHqMode()).toBe(true);
    expect(isLocalOnlyMode()).toBe(true);
  });

  it('admin sin flags', async () => {
    vi.stubEnv('VITE_DEVIR_STORE_MODE', '');
    vi.stubEnv('VITE_DEVIR_HQ_MODE', '');
    const { isLocalOnlyMode } = await import('../utils/appMode');
    expect(isLocalOnlyMode()).toBe(false);
  });
});
