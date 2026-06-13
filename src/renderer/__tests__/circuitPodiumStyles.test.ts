import { describe, it, expect } from 'vitest';
import { getCircuitPodiumRowClass } from '@utils/circuitPodiumStyles';

describe('getCircuitPodiumRowClass', () => {
  it('returns highlight classes for positions 1–4', () => {
    expect(getCircuitPodiumRowClass(1)).toContain('font-semibold');
    expect(getCircuitPodiumRowClass(2)).toContain('font-semibold');
    expect(getCircuitPodiumRowClass(3)).toContain('font-semibold');
    expect(getCircuitPodiumRowClass(4)).toContain('font-semibold');
  });

  it('returns empty string for position 5 and below', () => {
    expect(getCircuitPodiumRowClass(5)).toBe('');
    expect(getCircuitPodiumRowClass(0)).toBe('');
  });

  it('uses distinct classes per podium position', () => {
    const classes = [1, 2, 3, 4].map(getCircuitPodiumRowClass);
    expect(new Set(classes).size).toBe(4);
  });
});
