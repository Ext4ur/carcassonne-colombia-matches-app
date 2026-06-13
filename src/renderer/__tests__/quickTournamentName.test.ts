import { describe, it, expect } from 'vitest';
import { buildQuickTournamentName } from '@utils/quickTournamentName';

describe('buildQuickTournamentName', () => {
  it('combines place and date with separator', () => {
    expect(buildQuickTournamentName('Medellín Centro', '2026-06-10')).toBe(
      'Medellín Centro - 2026-06-10'
    );
  });

  it('trims whitespace from place and date', () => {
    expect(buildQuickTournamentName('  Bogotá  ', '  2026-01-05  ')).toBe('Bogotá - 2026-01-05');
  });

  it('returns only date when place is empty', () => {
    expect(buildQuickTournamentName('', '2026-06-10')).toBe('2026-06-10');
  });

  it('returns only place when date is empty', () => {
    expect(buildQuickTournamentName('Cali', '')).toBe('Cali');
  });

  it('returns empty string when both are empty', () => {
    expect(buildQuickTournamentName('', '')).toBe('');
    expect(buildQuickTournamentName('   ', '  ')).toBe('');
  });
});
