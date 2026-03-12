/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { SwissPairingService } from '../services/swiss';
import { PlayerStanding } from '../types/tournament';

describe('SwissPairingService.findPairingsWithBacktracking', () => {
  // Accessing private static method through any for testing
  const findPairingsWithBacktracking = (
    SwissPairingService as any
  ).findPairingsWithBacktracking.bind(SwissPairingService);

  it('finds a valid matching with 0 rematches in a complex scenario', () => {
    /**
     * Scenario: 6 players
     * P1 has played: P2, P3
     * P4 has played: P5
     *
     * If we pair P1-P4 (Greedy might do this as they are both high points),
     * we are left with {P2, P3, P5, P6}.
     * P2-P3 is a rematch. P5-P6 is new.
     * Total rematches: 1.
     *
     * BUT if we pair P1-P5, we are left with {P2, P3, P4, P6}.
     * P2-P4 is new. P3-P6 is new.
     * Total rematches: 0.
     */
    const players: PlayerStanding[] = [
      {
        player_id: 1,
        player_name: 'P1',
        total_points: 10,
        wins: 0,
        tiebreak_values: {},
        matches_played: 2,
        active: true,
        dropout_round: null,
      },
      {
        player_id: 2,
        player_name: 'P2',
        total_points: 9,
        wins: 0,
        tiebreak_values: {},
        matches_played: 2,
        active: true,
        dropout_round: null,
      },
      {
        player_id: 3,
        player_name: 'P3',
        total_points: 8,
        wins: 0,
        tiebreak_values: {},
        matches_played: 2,
        active: true,
        dropout_round: null,
      },
      {
        player_id: 4,
        player_name: 'P4',
        total_points: 7,
        wins: 0,
        tiebreak_values: {},
        matches_played: 2,
        active: true,
        dropout_round: null,
      },
      {
        player_id: 5,
        player_name: 'P5',
        total_points: 6,
        wins: 0,
        tiebreak_values: {},
        matches_played: 2,
        active: true,
        dropout_round: null,
      },
      {
        player_id: 6,
        player_name: 'P6',
        total_points: 5,
        wins: 0,
        tiebreak_values: {},
        matches_played: 2,
        active: true,
        dropout_round: null,
      },
    ];

    const previousOpponents: Record<number, number[]> = {
      1: [2, 3],
      2: [1, 3],
      3: [1, 2],
      4: [5],
      5: [4],
      6: [],
    };

    const result = findPairingsWithBacktracking(players, previousOpponents, 2);

    expect(result).not.toBeNull();
    expect(result.length).toBe(3);

    // Verify no rematches in result
    for (const match of result) {
      const p1 = match[0].player_id;
      const p2 = match[1].player_id;
      expect(previousOpponents[p1]).not.toContain(p2);
    }
  });

  it('returns null if no solution with 0 rematches is possible', () => {
    // 4 players where everyone has played everyone else
    const players: PlayerStanding[] = [
      {
        player_id: 1,
        player_name: 'P1',
        total_points: 10,
        wins: 0,
        tiebreak_values: {},
        matches_played: 3,
        active: true,
        dropout_round: null,
      },
      {
        player_id: 2,
        player_name: 'P2',
        total_points: 9,
        wins: 0,
        tiebreak_values: {},
        matches_played: 3,
        active: true,
        dropout_round: null,
      },
      {
        player_id: 3,
        player_name: 'P3',
        total_points: 8,
        wins: 0,
        tiebreak_values: {},
        matches_played: 3,
        active: true,
        dropout_round: null,
      },
      {
        player_id: 4,
        player_name: 'P4',
        total_points: 7,
        wins: 0,
        tiebreak_values: {},
        matches_played: 3,
        active: true,
        dropout_round: null,
      },
    ];

    const previousOpponents: Record<number, number[]> = {
      1: [2, 3, 4],
      2: [1, 3, 4],
      3: [1, 2, 4],
      4: [1, 2, 3],
    };

    const result = findPairingsWithBacktracking(players, previousOpponents, 2);
    expect(result).toBeNull();
  });
});
