import { describe, it, expect } from 'vitest';
import { TiebreakService, TiebreakData } from '../services/tiebreak';

describe('TiebreakService', () => {
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
        { player_id: 1, position: 1, points: 100, tournament_points: 1 },
        { player_id: 2, position: 2, points: 50, tournament_points: 0 },
      ],
      102: [
        { player_id: 3, position: 1, points: 80, tournament_points: 1 },
        { player_id: 4, position: 2, points: 60, tournament_points: 0 },
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
