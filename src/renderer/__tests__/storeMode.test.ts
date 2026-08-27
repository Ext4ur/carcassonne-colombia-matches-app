import { describe, it, expect, vi, afterEach } from 'vitest';

describe('isStoreMode', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('devuelve false sin flag', async () => {
    vi.stubEnv('VITE_DEVIR_STORE_MODE', '');
    const { isStoreMode } = await import('../utils/appMode');
    expect(isStoreMode()).toBe(false);
  });

  it('devuelve true cuando VITE_DEVIR_STORE_MODE=true', async () => {
    vi.stubEnv('VITE_DEVIR_STORE_MODE', 'true');
    const { isStoreMode } = await import('../utils/appMode');
    expect(isStoreMode()).toBe(true);
  });
});
