import { describe, it, expect } from 'vitest';
import { orderResultsByMatchPlayers, sortPlayersByName } from '../utils/matchPlayerOrder';

describe('match player order (list vs result form)', () => {
  const seatOrder = [
    { id: 20, name: 'Bruno' },
    { id: 10, name: 'Ana' },
  ];

  it('orderResultsByMatchPlayers keeps seat order when DB results are sorted by position', () => {
    const fromDbByPosition = [
      { player_id: 10, points: 85 },
      { player_id: 20, points: 72 },
    ];
    const ordered = orderResultsByMatchPlayers(fromDbByPosition, seatOrder, 2);
    expect(ordered.map((r) => r.player_id)).toEqual([20, 10]);
    expect(ordered[0]?.points).toBe(72);
    expect(ordered[1]?.points).toBe(85);
  });

  it('pending match: seat order matches between batch list and form initialization', () => {
    const formRows = orderResultsByMatchPlayers(
      seatOrder.map((p) => ({ player_id: p.id!, points: 0 })),
      seatOrder,
      2
    );
    expect(formRows.map((r) => r.player_id)).toEqual(seatOrder.map((p) => p.id));
  });

  it('documents pre-AC-087 bug: alphabetical form order could invert pairing order', () => {
    const listOrder = seatOrder.map((p) => p.name);
    const legacyFormOrder = sortPlayersByName(seatOrder).map((p) => p.name);
    expect(listOrder).toEqual(['Bruno', 'Ana']);
    expect(legacyFormOrder).toEqual(['Ana', 'Bruno']);
    expect(listOrder).not.toEqual(legacyFormOrder);
  });

  it('4-player table: seat order preserved for all seats', () => {
    const four = [
      { id: 4, name: 'Diana' },
      { id: 1, name: 'Alberto' },
      { id: 3, name: 'Carlos' },
      { id: 2, name: 'Beatriz' },
    ];
    const dbResults = [
      { player_id: 1, points: 100 },
      { player_id: 2, points: 90 },
      { player_id: 3, points: 80 },
      { player_id: 4, points: 70 },
    ];
    expect(orderResultsByMatchPlayers(dbResults, four, 4).map((r) => r.player_id)).toEqual([
      4, 1, 3, 2,
    ]);
  });
});
