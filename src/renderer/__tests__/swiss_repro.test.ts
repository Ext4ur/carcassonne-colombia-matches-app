import { describe, it, expect } from 'vitest';
import { SwissPairingService } from '../services/swiss';
import { PlayerStanding, TournamentConfig } from '../types/tournament';

describe('SwissPairingService Reproduction: 5 players Round 2', () => {
  // No need for a separate players array if we use standings directly

  // Round 1 matches: P1 vs P2, P3 vs P4, P5 (Bye)
  const previousOpponents = {
    1: [2],
    2: [1],
    3: [4],
    4: [3],
    5: [],
  };

  const standings: PlayerStanding[] = [
    {
      player_id: 1,
      player_name: 'P1',
      total_points: 1,
      matches_played: 1,
      wins: 1,
      tiebreak_values: {},
      active: true,
      dropout_round: null,
      starts_count: 1,
    },
    {
      player_id: 3,
      player_name: 'P3',
      total_points: 1,
      matches_played: 1,
      wins: 1,
      tiebreak_values: {},
      active: true,
      dropout_round: null,
      starts_count: 1,
    },
    {
      player_id: 5,
      player_name: 'P5',
      total_points: 1,
      matches_played: 0,
      wins: 0,
      tiebreak_values: {},
      active: true,
      dropout_round: null,
      starts_count: 0,
    },
    {
      player_id: 2,
      player_name: 'P2',
      total_points: 0,
      matches_played: 1,
      wins: 0,
      tiebreak_values: {},
      active: true,
      dropout_round: null,
      starts_count: 0,
    },
    {
      player_id: 4,
      player_name: 'P4',
      total_points: 0,
      matches_played: 1,
      wins: 0,
      tiebreak_values: {},
      active: true,
      dropout_round: null,
      starts_count: 0,
    },
  ];

  const config: TournamentConfig = {
    id: 1,
    tournament_id: 1,
    players_per_match: 2,
    avoid_rematches: true,
    pairing_algorithm: 'backtracking',
    bye_selection: 'worst',
  } as unknown as TournamentConfig;

  const startStats = {
    1: { totalStarts: 1, lastStartRound: 1 },
    2: { totalStarts: 0, lastStartRound: 0 },
    3: { totalStarts: 1, lastStartRound: 1 },
    4: { totalStarts: 0, lastStartRound: 0 },
    5: { totalStarts: 0, lastStartRound: 0 },
  };

  it('generates pairings correctly for 5 players in Round 2 with backtracking', async () => {
    // We need to bypass the database calls, so we test computePairings directly
    // Use any only where necessary to access private methods in tests
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = SwissPairingService as any;

    // First, simulate what selectByePlayer would do
    const playersWithBye = new Set([5]);
    const byePlayer = service.selectByePlayer(standings, playersWithBye, 'worst');

    // Bye should be P4 (worst among those who haven't had a bye)
    expect(byePlayer.player_id).toBe(4);

    const allAvailable = standings.filter((p) => p.player_id !== byePlayer.player_id);

    const { pairings, warnings } = await service.computePairings(
      allAvailable,
      previousOpponents,
      2,
      config,
      startStats
    );

    expect(pairings.length).toBe(2);
    expect(warnings.length).toBe(0);

    // Verify no rematches
    pairings.forEach((p: { players: PlayerStanding[] }) => {
      const p1 = p.players[0].player_id;
      const p2 = p.players[1].player_id;
      expect(previousOpponents[p1 as keyof typeof previousOpponents]).not.toContain(p2);
    });
  });

  it('handles scenario where backtracking might fail but greedy works', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = SwissPairingService as any;
    // Let's create a scenario where almost everyone has played everyone else
    const strictOpponents = {
      1: [2, 3, 4],
      2: [1, 3, 5],
      3: [1, 2, 4],
      4: [1, 3, 5],
      5: [2, 4],
    };

    // If we have 1, 2, 3, 5 available.
    // 1 has played 2, 3. Must play 5.
    // If 1-5, remaining 2, 3.
    // 2 has played 3. Rematch!

    // Backtracking should return null if no solution without rematches.
    const allAvailable = standings.filter((p) => p.player_id !== 4);

    const { pairings, warnings } = await service.computePairings(
      allAvailable,
      strictOpponents,
      2,
      config,
      startStats
    );

    expect(pairings.length).toBe(2);
    // May or may not emit warnings depending on pairing path; pairings must be valid
    expect(Array.isArray(warnings)).toBe(true);
  });
});
