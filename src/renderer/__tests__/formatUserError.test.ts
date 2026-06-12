import { describe, it, expect } from 'vitest';
import { formatUserError } from '../utils/formatUserError';

describe('formatUserError', () => {
  const fallback = 'Error genérico';

  it('returns Error.message when present', () => {
    expect(formatUserError(new Error('Detalle del fallo'), fallback)).toBe('Detalle del fallo');
  });

  it('returns trimmed string errors', () => {
    expect(formatUserError('  Mensaje directo  ', fallback)).toBe('Mensaje directo');
  });

  it('returns fallback for empty Error message', () => {
    expect(formatUserError(new Error(''), fallback)).toBe(fallback);
    expect(formatUserError(new Error('   '), fallback)).toBe(fallback);
  });

  it('returns fallback for unknown types', () => {
    expect(formatUserError(null, fallback)).toBe(fallback);
    expect(formatUserError(undefined, fallback)).toBe(fallback);
    expect(formatUserError(42, fallback)).toBe(fallback);
  });

  it('reads message from plain objects', () => {
    expect(formatUserError({ message: 'Desde objeto' }, fallback)).toBe('Desde objeto');
  });
});
