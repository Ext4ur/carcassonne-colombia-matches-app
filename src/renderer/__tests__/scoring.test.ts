import { describe, it, expect } from 'vitest';
import { getTournamentPoints, calculatePositions } from '@utils/scoring';

describe('getTournamentPoints', () => {
  it('returns points for position from scoring system', () => {
    const system = { 1: 3, 2: 1, 3: 0 };
    expect(getTournamentPoints(1, system)).toBe(3);
    expect(getTournamentPoints(2, system)).toBe(1);
    expect(getTournamentPoints(3, system)).toBe(0);
  });

  it('returns 0 for unknown position', () => {
    expect(getTournamentPoints(5, { 1: 1, 2: 0 })).toBe(0);
  });
});

describe('calculatePositions', () => {
  it('assigns position 1 to highest points, 2 to second', () => {
    const results = [
      { player_id: 10, points: 5 },
      { player_id: 20, points: 3 },
    ];
    const out = calculatePositions(results);
    expect(out.find((r) => r.player_id === 10)?.position).toBe(1);
    expect(out.find((r) => r.player_id === 20)?.position).toBe(2);
  });

  it('in case of tie, first player gets worse position when firstPlayerId is set', () => {
    const results = [
      { player_id: 1, points: 4 },
      { player_id: 2, points: 4 },
    ];
    const out = calculatePositions(results, 1);
    expect(out.find((r) => r.player_id === 1)?.position).toBe(2);
    expect(out.find((r) => r.player_id === 2)?.position).toBe(1);
  });

  it('assigns same position to tied players when no firstPlayerId', () => {
    const results = [
      { player_id: 1, points: 4 },
      { player_id: 2, points: 4 },
      { player_id: 3, points: 0 },
    ];
    const out = calculatePositions(results);
    const pos1 = out.find((r) => r.player_id === 1)?.position;
    const pos2 = out.find((r) => r.player_id === 2)?.position;
    expect(pos1).toBe(1);
    expect(pos2).toBe(1);
    expect(out.find((r) => r.player_id === 3)?.position).toBe(3);
  });
});
