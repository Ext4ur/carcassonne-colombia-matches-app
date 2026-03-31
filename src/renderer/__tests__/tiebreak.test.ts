import { describe, it, expect } from 'vitest';
import { TiebreakService, TiebreakData } from '../services/tiebreak';
import { BuchholzByeMode, Round } from '../types/tournament';
import { getBuchholzModeMeta } from '../utils/buchholzModeMeta';

function computeOpp(
  playerId: number,
  data: TiebreakData,
  opts: {
    buchholzByeMode: BuchholzByeMode;
    numberOfRounds: number;
    tournamentPointsAverage: number;
  },
  dropWorst: boolean,
  dropBest: boolean
): number {
  return (
    TiebreakService as unknown as { computeOpponentPointsTiebreak: (...a: unknown[]) => number }
  ).computeOpponentPointsTiebreak(playerId, data, opts, dropWorst, dropBest);
}

describe('TiebreakService', () => {
  describe('buchholz mode metadata', () => {
    it('marks virtual and kind consistently for each mode', () => {
      expect(getBuchholzModeMeta('legacy')).toMatchObject({
        usesVirtualOpponent: false,
        virtualKind: 'none',
      });
      expect(getBuchholzModeMeta('n_minus_1')).toMatchObject({
        usesVirtualOpponent: false,
        virtualKind: 'none',
      });
      expect(getBuchholzModeMeta('legacy_virtual_avg')).toMatchObject({
        usesVirtualOpponent: true,
        virtualKind: 'field_avg',
      });
      expect(getBuchholzModeMeta('n_minus_1_virtual_avg')).toMatchObject({
        usesVirtualOpponent: true,
        virtualKind: 'field_avg',
      });
      expect(getBuchholzModeMeta('legacy_virtual_worst')).toMatchObject({
        usesVirtualOpponent: true,
        virtualKind: 'round_worst',
      });
      expect(getBuchholzModeMeta('n_minus_1_virtual_worst')).toMatchObject({
        usesVirtualOpponent: true,
        virtualKind: 'round_worst',
      });
    });
  });

  // Mock data setup
  const mockData: TiebreakData = {
    rounds: [{ id: 1, tournament_id: 1, round_number: 1, status: 'completed' }],
    roundMatches: [
      [
        { id: 101, round_id: 1, match_number: 1, status: 'completed' },
        { id: 102, round_id: 1, match_number: 2, status: 'completed' },
      ],
    ],
    resultsByMatch: {
      101: [
        { match_id: 1, player_id: 1, position: 1, points: 100, tournament_points: 1 },
        { match_id: 1, player_id: 2, position: 2, points: 50, tournament_points: 0 },
      ],
      102: [
        { match_id: 1, player_id: 3, position: 1, points: 80, tournament_points: 1 },
        { match_id: 1, player_id: 4, position: 2, points: 70, tournament_points: 0 },
      ],
    },
    playerTotalPoints: {
      1: 3, // Player 1 has 3 points total
      2: 2, // Player 2 has 2 points
      3: 1, // Player 3 has 1 point
      4: 0, // Player 4 has 0 points
    },
  };

  describe('calculateOpponentPointsFromData', () => {
    it('calculates sum of opponent points correctly (Buchholz)', () => {
      // Player 1 played against Player 2 (who has 2 points)
      const points = TiebreakService.calculateOpponentPointsFromData(mockData, 1);
      expect(points).toBe(2);

      // Player 2 played against Player 1 (who has 3 points)
      const points2 = TiebreakService.calculateOpponentPointsFromData(mockData, 2);
      expect(points2).toBe(3);
    });

    it('returns 0 if no games played', () => {
      const points = TiebreakService.calculateOpponentPointsFromData(mockData, 99);
      expect(points).toBe(0);
    });
  });

  describe('computeOpponentPointsTiebreak (bye modes)', () => {
    it('legacy_virtual_avg injects field average for a round without a match', () => {
      const rounds: Round[] = [
        { id: 1, tournament_id: 1, round_number: 1, status: 'completed' },
        { id: 2, tournament_id: 1, round_number: 2, status: 'completed' },
      ];
      const roundMatches = [
        [{ id: 101, round_id: 1, match_number: 1, status: 'completed' as const }],
        [],
      ];
      const resultsByMatch = {
        101: [
          { match_id: 101, player_id: 1, position: 1, points: 100, tournament_points: 1 },
          { match_id: 101, player_id: 2, position: 2, points: 50, tournament_points: 0 },
        ],
      };
      const playerTotalPoints = { 1: 1, 2: 0 };
      const data: TiebreakData = { rounds, roundMatches, resultsByMatch, playerTotalPoints };
      const avg = (1 + 0) / 2;
      const v = computeOpp(
        1,
        data,
        { buchholzByeMode: 'legacy_virtual_avg', numberOfRounds: 2, tournamentPointsAverage: avg },
        true,
        false
      );
      // flat: opponent 0 + virtual avg; sorted [avg,0] drop worst -> avg
      expect(v).toBeCloseTo(avg, 5);
    });

    it('n_minus_1_virtual_avg fills bye round so cut applies like full schedule', () => {
      const rounds: Round[] = [
        { id: 1, tournament_id: 1, round_number: 1, status: 'completed' },
        { id: 2, tournament_id: 1, round_number: 2, status: 'completed' },
      ];
      const roundMatches = [
        [{ id: 101, round_id: 1, match_number: 1, status: 'completed' as const }],
        [{ id: 102, round_id: 2, match_number: 1, status: 'completed' as const }],
      ];
      const resultsByMatch = {
        101: [
          { match_id: 101, player_id: 1, position: 1, points: 100, tournament_points: 1 },
          { match_id: 101, player_id: 2, position: 2, points: 50, tournament_points: 0 },
        ],
        102: [
          { match_id: 102, player_id: 2, position: 1, points: 100, tournament_points: 1 },
          { match_id: 102, player_id: 3, position: 2, points: 50, tournament_points: 0 },
        ],
      };
      const playerTotalPoints = { 1: 1, 2: 2, 3: 0 };
      const data: TiebreakData = { rounds, roundMatches, resultsByMatch, playerTotalPoints };
      const avg = (1 + 2 + 0) / 3;
      const r1 = computeOpp(
        1,
        data,
        {
          buchholzByeMode: 'n_minus_1_virtual_avg',
          numberOfRounds: 2,
          tournamentPointsAverage: avg,
        },
        true,
        false
      );
      // P1: round1 opp sum = P2's 2 pts, round2 virtual = avg -> [2, avg] cut worst -> 2
      expect(r1).toBe(2);
    });

    it('legacy_virtual_worst injects min field score for a bye round', () => {
      const rounds: Round[] = [
        { id: 1, tournament_id: 1, round_number: 1, status: 'completed' },
        { id: 2, tournament_id: 1, round_number: 2, status: 'completed' },
      ];
      const roundMatches = [
        [{ id: 101, round_id: 1, match_number: 1, status: 'completed' as const }],
        [],
      ];
      const resultsByMatch = {
        101: [
          { match_id: 101, player_id: 1, position: 1, points: 100, tournament_points: 1 },
          { match_id: 101, player_id: 2, position: 2, points: 50, tournament_points: 0 },
        ],
      };
      const playerTotalPoints = { 1: 1, 2: 0 };
      const data: TiebreakData = { rounds, roundMatches, resultsByMatch, playerTotalPoints };
      const v = computeOpp(
        1,
        data,
        { buchholzByeMode: 'legacy_virtual_worst', numberOfRounds: 2, tournamentPointsAverage: 0 },
        true,
        false
      );
      // flat: opponent 0 + virtual min for empty r2 = 0; [0,0] drop worst -> 0
      expect(v).toBe(0);
    });
  });

  describe('getBuchholzVirtualSlots', () => {
    it('returns empty for legacy mode', () => {
      expect(
        TiebreakService.getBuchholzVirtualSlots(1, mockData, {
          buchholzByeMode: 'legacy',
          numberOfRounds: 1,
          tournamentPointsAverage: 1,
        })
      ).toEqual([]);
    });

    it('lists virtual avg for each round without a result (legacy_virtual_avg)', () => {
      const rounds: Round[] = [
        { id: 1, tournament_id: 1, round_number: 1, status: 'completed' },
        { id: 2, tournament_id: 1, round_number: 2, status: 'completed' },
      ];
      const roundMatches = [
        [{ id: 101, round_id: 1, match_number: 1, status: 'completed' as const }],
        [],
      ];
      const resultsByMatch = {
        101: [
          { match_id: 101, player_id: 1, position: 1, points: 100, tournament_points: 1 },
          { match_id: 101, player_id: 2, position: 2, points: 50, tournament_points: 0 },
        ],
      };
      const playerTotalPoints = { 1: 1, 2: 0 };
      const data: TiebreakData = { rounds, roundMatches, resultsByMatch, playerTotalPoints };
      const avg = (1 + 0) / 2;
      const slots = TiebreakService.getBuchholzVirtualSlots(1, data, {
        buchholzByeMode: 'legacy_virtual_avg',
        numberOfRounds: 2,
        tournamentPointsAverage: avg,
      });
      expect(slots).toEqual([{ roundNumber: 2, value: avg, kind: 'field_avg' }]);
    });
  });

  describe('calculateHeadToHeadFromData', () => {
    it('returns 1 if player1 beat player2', () => {
      // In match 101, Player 1 (pos 1) beat Player 2 (pos 2)
      const result = TiebreakService.calculateHeadToHeadFromData(mockData, 1, 2);
      expect(result).toBe(1);
    });

    it('returns -1 if player2 beat player1', () => {
      // In match 101, Player 2 lost to Player 1
      const result = TiebreakService.calculateHeadToHeadFromData(mockData, 2, 1);
      expect(result).toBe(-1);
    });

    it('returns 0 if players never played', () => {
      // Player 1 and 3 played different matches
      const result = TiebreakService.calculateHeadToHeadFromData(mockData, 1, 3);
      expect(result).toBe(0);
    });
  });

  describe('calculatePointDifferenceFromData', () => {
    it('calculates difference correctly', () => {
      // Match 101: P1(100) vs P2(50). Diff for P1 = 100 - 50 = 50.
      const diff1 = TiebreakService.calculatePointDifferenceFromData(mockData, 1);
      expect(diff1).toBe(50);

      // Match 101: P2(50) vs P1(100). Diff for P2 = 50 - 100 = -50.
      const diff2 = TiebreakService.calculatePointDifferenceFromData(mockData, 2);
      expect(diff2).toBe(-50);
    });
  });
});
