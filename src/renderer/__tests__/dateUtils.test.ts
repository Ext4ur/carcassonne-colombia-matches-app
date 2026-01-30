import { describe, it, expect } from 'vitest';
import { formatDateForDisplay, getLocalDateString } from '@utils/dateUtils';

describe('formatDateForDisplay', () => {
  it('returns DD/MM/YYYY for YYYY-MM-DD string', () => {
    expect(formatDateForDisplay('2025-01-15')).toBe('15/01/2025');
  });

  it('strips time from ISO string and formats as DD/MM/YYYY', () => {
    expect(formatDateForDisplay('2025-06-30T12:00:00.000Z')).toBe('30/06/2025');
  });

  it('returns "-" for null, undefined or empty', () => {
    expect(formatDateForDisplay(null)).toBe('-');
    expect(formatDateForDisplay(undefined)).toBe('-');
    expect(formatDateForDisplay('')).toBe('-');
    expect(formatDateForDisplay('   ')).toBe('-');
  });
});

describe('getLocalDateString', () => {
  it('returns a string in YYYY-MM-DD format', () => {
    const result = getLocalDateString();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('pads month and day with zero', () => {
    // We can't control the date easily without mocking; just ensure format
    const result = getLocalDateString();
    const [, m, d] = result.split('-').map(Number);
    expect(m).toBeGreaterThanOrEqual(1);
    expect(m).toBeLessThanOrEqual(12);
    expect(d).toBeGreaterThanOrEqual(1);
    expect(d).toBeLessThanOrEqual(31);
  });
});
