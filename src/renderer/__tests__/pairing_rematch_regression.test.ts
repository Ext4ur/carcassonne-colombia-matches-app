import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SwissPairingService } from '../services/swiss';
import { PlayerStanding, TournamentConfig } from '../types/tournament';

const findBestPairings = (
  SwissPairingService as unknown as {
    findBestPairings: (
      r: PlayerStanding[],
      o: Record<number, number[]>,
      ppm: number,
      maxR: number,
      cur?: number
    ) => PlayerStanding[][] | null;
  }
).findBestPairings.bind(SwissPairingService);

const computePairings = (
  SwissPairingService as unknown as {
    computePairings: (
      players: PlayerStanding[],
      opps: Record<number, number[]>,
      ppm: number,
      config: TournamentConfig | null,
      startStats: Record<number, { totalStarts: number; lastStartRound: number }>
    ) => Promise<{
      pairings: Array<{ players: PlayerStanding[] }>;
      warnings: string[];
    }>;
  }
).computePairings.bind(SwissPairingService);

function assertNoRematchesInRound(
  matches: PlayerStanding[][],
  previousOpponents: Record<number, number[]>
) {
  for (const match of matches) {
    for (let i = 0; i < match.length; i++) {
      for (let j = i + 1; j < match.length; j++) {
        const a = match[i]!.player_id;
        const b = match[j]!.player_id;
        expect(previousOpponents[a] ?? []).not.toContain(b);
      }
    }
  }
}

/** Aristas-revancha totales en la ronda (misma métrica que findBestPairings). */
function countRematchEdgesInRound(
  matches: PlayerStanding[][],
  previousOpponents: Record<number, number[]>
): number {
  let total = 0;
  for (const match of matches) {
    for (let i = 0; i < match.length; i++) {
      const p = match[i]!;
      const others = match.slice(i + 1);
      const opps = previousOpponents[p.player_id] || [];
      total += others.filter((o) => opps.includes(o.player_id)).length;
    }
  }
  return total;
}

/** Grafo no dirigido simétrico a partir de listas de oponentes. */
function symmetricOpponents(ids: number[], edges: [number, number][]): Record<number, number[]> {
  const m: Record<number, Set<number>> = {};
  for (const id of ids) m[id] = new Set();
  for (const [a, b] of edges) {
    m[a]!.add(b);
    m[b]!.add(a);
  }
  const out: Record<number, number[]> = {};
  for (const id of ids) out[id] = [...m[id]!];
  return out;
}

function standing(
  id: number,
  name: string,
  pts: number,
  extra: Partial<PlayerStanding> = {}
): PlayerStanding {
  return {
    player_id: id,
    player_name: name,
    total_points: pts,
    wins: 0,
    tiebreak_values: {},
    matches_played: 0,
    active: true,
    dropout_round: null,
    ...extra,
  };
}

describe('Rematch regression — findBestPairings', () => {
  it('6 players 2-per-table: greedy would rematch; backtracking finds 0 rematches', () => {
    const players: PlayerStanding[] = [
      standing(1, 'P1', 10),
      standing(2, 'P2', 9),
      standing(3, 'P3', 8),
      standing(4, 'P4', 7),
      standing(5, 'P5', 6),
      standing(6, 'P6', 5),
    ];
    const previousOpponents: Record<number, number[]> = {
      1: [2, 3],
      2: [1, 3],
      3: [1, 2],
      4: [5],
      5: [4],
      6: [],
    };
    const result = findBestPairings(players, previousOpponents, 2, 0, 0);
    expect(result).not.toBeNull();
    assertNoRematchesInRound(result!, previousOpponents);
  });

  it('9 players 3-per-table: R1 three disjoint triples; R2 can pair one from each triple with 0 rematches', () => {
    const players: PlayerStanding[] = Array.from({ length: 9 }, (_, i) =>
      standing(i + 1, `P${i + 1}`, 0)
    );
    const previousOpponents: Record<number, number[]> = {
      1: [2, 3],
      2: [1, 3],
      3: [1, 2],
      4: [5, 6],
      5: [4, 6],
      6: [4, 5],
      7: [8, 9],
      8: [7, 9],
      9: [7, 8],
    };
    const result = findBestPairings(players, previousOpponents, 3, 0, 0);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(3);
    assertNoRematchesInRound(result!, previousOpponents);
  });

  it('K4 complete graph: no 0-rematch pairing with 2 players per match', () => {
    const players: PlayerStanding[] = [1, 2, 3, 4].map((id) => standing(id, `P${id}`, 10));
    const opps: Record<number, number[]> = {
      1: [2, 3, 4],
      2: [1, 3, 4],
      3: [1, 2, 4],
      4: [1, 2, 3],
    };
    expect(findBestPairings(players, opps, 2, 0, 0)).toBeNull();
    expect(findBestPairings(players, opps, 2, 1, 0)).toBeNull();
    const withBudget = findBestPairings(players, opps, 2, 2, 0);
    expect(withBudget).not.toBeNull();
    expect(countRematchEdgesInRound(withBudget!, opps)).toBe(2);
  });

  it('K6 complete graph: necesita 3 aristas-revancha (3 mesas de 2); presupuestos 0–2 imposibles', () => {
    const ids = [1, 2, 3, 4, 5, 6];
    const players = ids.map((id) => standing(id, `P${id}`, 10));
    const opps: Record<number, number[]> = {};
    for (const id of ids) {
      opps[id] = ids.filter((x) => x !== id);
    }
    expect(findBestPairings(players, opps, 2, 0, 0)).toBeNull();
    expect(findBestPairings(players, opps, 2, 1, 0)).toBeNull();
    expect(findBestPairings(players, opps, 2, 2, 0)).toBeNull();
    const ok = findBestPairings(players, opps, 2, 3, 0);
    expect(ok).not.toBeNull();
    expect(countRematchEdgesInRound(ok!, opps)).toBe(3);
  });

  it('Bipartito K4,4: emparejar dentro de cada mitad → 0 revanchas (nadie jugó contra su pareja)', () => {
    const a = [1, 2, 3, 4];
    const b = [5, 6, 7, 8];
    const edges: [number, number][] = [];
    for (const x of a) for (const y of b) edges.push([x, y]);
    const players = [...a, ...b].map((id) => standing(id, `P${id}`, 5));
    const opps = symmetricOpponents([...a, ...b], edges);
    const result = findBestPairings(players, opps, 2, 0, 0);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(4);
    assertNoRematchesInRound(result!, opps);
  });

  it('Estrella (6): centro 1 solo contra hojas; hojas emparejadas entre sí sin revancha; la mesa del centro lleva 1 revancha inevitable', () => {
    const players = [1, 2, 3, 4, 5, 6].map((id) => standing(id, `P${id}`, 10 - id));
    const opps: Record<number, number[]> = {
      1: [2, 3, 4, 5, 6],
      2: [1],
      3: [1],
      4: [1],
      5: [1],
      6: [1],
    };
    expect(findBestPairings(players, opps, 2, 0, 0)).toBeNull();
    const result = findBestPairings(players, opps, 2, 1, 0);
    expect(result).not.toBeNull();
    expect(countRematchEdgesInRound(result!, opps)).toBe(1);
    const leafOnly = result!.filter((m) => !m.some((p) => p.player_id === 1));
    for (const m of leafOnly) assertNoRematchesInRound([m], opps);
  });

  it('presupuesto incremental: para un grafo aleatorio pequeño, la primera solución respeta maxR', () => {
    const ids = [1, 2, 3, 4, 5, 6];
    const edges: [number, number][] = [
      [1, 2],
      [2, 3],
      [3, 1],
      [4, 5],
      [5, 6],
      [6, 4],
      [1, 4],
      [2, 5],
      [3, 6],
    ];
    const players = ids.map((id) => standing(id, `P${id}`, 0));
    const opps = symmetricOpponents(ids, edges);
    let lastBudget = -1;
    let found: PlayerStanding[][] | null = null;
    for (let maxR = 0; maxR <= 6; maxR++) {
      const r = findBestPairings(players, opps, 2, maxR, 0);
      if (r) {
        found = r;
        lastBudget = maxR;
        expect(countRematchEdgesInRound(r, opps)).toBeLessThanOrEqual(maxR);
        break;
      }
    }
    expect(found).not.toBeNull();
    expect(lastBudget).toBeGreaterThanOrEqual(0);
  });
});

describe('Rematch regression — computePairings', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.3);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('pairing_algorithm greedy + avoid_rematches still runs backtracking first (6 players / 2)', async () => {
    const players: PlayerStanding[] = [
      standing(1, 'P1', 10),
      standing(2, 'P2', 9),
      standing(3, 'P3', 8),
      standing(4, 'P4', 7),
      standing(5, 'P5', 6),
      standing(6, 'P6', 5),
    ];
    const previousOpponents: Record<number, number[]> = {
      1: [2, 3],
      2: [1, 3],
      3: [1, 2],
      4: [5],
      5: [4],
      6: [],
    };
    const config: TournamentConfig = {
      tournament_id: 1,
      avoid_rematches: true,
      tiebreak_criteria: [],
      scoring_system: { 1: 1, 2: 0 },
      pairing_algorithm: 'greedy',
    };
    const startStats: Record<number, { totalStarts: number; lastStartRound: number }> = {
      1: { totalStarts: 0, lastStartRound: 0 },
      2: { totalStarts: 1, lastStartRound: 1 },
      3: { totalStarts: 2, lastStartRound: 2 },
      4: { totalStarts: 0, lastStartRound: 0 },
      5: { totalStarts: 1, lastStartRound: 1 },
      6: { totalStarts: 2, lastStartRound: 2 },
    };
    const { pairings, warnings } = await computePairings(
      players,
      previousOpponents,
      2,
      config,
      startStats
    );
    expect(pairings.length).toBe(3);
    assertNoRematchesInRound(
      pairings.map((p) => p.players),
      previousOpponents
    );
    expect(warnings.length).toBe(0);
  });

  it('K4 + avoid + backtracking: 2 revanchas inevitables, sin aviso de fallback', async () => {
    const players: PlayerStanding[] = [1, 2, 3, 4].map((id) => standing(id, `P${id}`, 10));
    const previousOpponents: Record<number, number[]> = {
      1: [2, 3, 4],
      2: [1, 3, 4],
      3: [1, 2, 4],
      4: [1, 2, 3],
    };
    const config: TournamentConfig = {
      tournament_id: 1,
      avoid_rematches: true,
      tiebreak_criteria: [],
      scoring_system: { 1: 1, 2: 0 },
      pairing_algorithm: 'backtracking',
    };
    const startStats = Object.fromEntries(
      [1, 2, 3, 4].map((id) => [id, { totalStarts: 0, lastStartRound: 0 }])
    ) as Record<number, { totalStarts: number; lastStartRound: number }>;

    const { pairings, warnings } = await computePairings(
      players,
      previousOpponents,
      2,
      config,
      startStats
    );
    expect(pairings.length).toBe(2);
    expect(
      countRematchEdgesInRound(
        pairings.map((p) => p.players),
        previousOpponents
      )
    ).toBe(2);
    expect(warnings.length).toBe(0);
  });

  it('avoid_rematches false + greedy skips backtracking (may warn on forced rematch)', async () => {
    const players: PlayerStanding[] = [
      standing(1, 'P1', 10),
      standing(2, 'P2', 9),
      standing(3, 'P3', 8),
      standing(4, 'P4', 7),
    ];
    const previousOpponents: Record<number, number[]> = {
      1: [2, 3, 4],
      2: [1, 3, 4],
      3: [1, 2, 4],
      4: [1, 2, 3],
    };
    const config: TournamentConfig = {
      tournament_id: 1,
      avoid_rematches: false,
      tiebreak_criteria: [],
      scoring_system: { 1: 1, 2: 0 },
      pairing_algorithm: 'greedy',
    };
    const startStats: Record<number, { totalStarts: number; lastStartRound: number }> = {
      1: { totalStarts: 0, lastStartRound: 0 },
      2: { totalStarts: 0, lastStartRound: 0 },
      3: { totalStarts: 0, lastStartRound: 0 },
      4: { totalStarts: 0, lastStartRound: 0 },
    };
    const { pairings } = await computePairings(players, previousOpponents, 2, config, startStats);
    expect(pairings.length).toBe(2);
  });
});
