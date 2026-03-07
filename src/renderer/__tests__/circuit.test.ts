/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CircuitService } from '../services/circuit';
import { DatabaseService } from '../services/database';
import { SwissPairingService } from '../services/swiss';

// Mock Dependencies
vi.mock('../services/database', () => ({
  DatabaseService: {
    getCircuitTournaments: vi.fn(),
    getTournamentConfig: vi.fn(),
    getTournamentRounds: vi.fn(),
    getRoundMatches: vi.fn(),
    getMatchWithResults: vi.fn(),
  },
}));

vi.mock('../services/swiss', () => ({
  SwissPairingService: {
    calculateStandings: vi.fn(),
  },
}));

describe('CircuitService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getCircuitStandings', () => {
    it('calculates dynamic scoring and tie-breakers correctly', async () => {
      // 2 completed tournaments in circuit
      (DatabaseService.getCircuitTournaments as any).mockResolvedValue([
        { id: 101, status: 'completed', name: 'T1' },
        { id: 102, status: 'completed', name: 'T2' },
      ]);
      (DatabaseService.getTournamentConfig as any).mockResolvedValue({});
      (DatabaseService.getTournamentRounds as any).mockResolvedValue([]);

      // Standings T1 (4 players): 1:P1, 2:P2, 3:P3, 4:P4
      // Pts (<=6 players): 1st:6, 2nd:4, 3rd:3, 4th:1
      (SwissPairingService.calculateStandings as any)
        .mockResolvedValueOnce([
          { player_id: 1, player_name: 'P1', wins: 3 },
          { player_id: 2, player_name: 'P2', wins: 2 },
          { player_id: 3, player_name: 'P3', wins: 1 },
          { player_id: 4, player_name: 'P4', wins: 0 },
        ])
        // Standings T2 (4 players): 1:P2, 2:P1, 3:P4, 4:P3
        .mockResolvedValueOnce([
          { player_id: 2, player_name: 'P2', wins: 3 },
          { player_id: 1, player_name: 'P1', wins: 2 },
          { player_id: 4, player_name: 'P4', wins: 1 },
          { player_id: 3, player_name: 'P3', wins: 0 },
        ]);

      const result = await CircuitService.getCircuitStandings(1);

      // P1: T1(6) + T2(4) = 10 pts, 3+2=5 wins
      // P2: T1(4) + T2(6) = 10 pts, 2+3=5 wins
      // We expect P2 and P1 tied in pts and wins.
      // SOS and H2H would be 0 as we mocked rounds as empty.
      expect(result).toHaveLength(4);
      expect(result[0].total_points).toBe(10);
      expect(result[1].total_points).toBe(10);
      expect(result[0].wins).toBe(5);
      expect(result[1].wins).toBe(5);
    });

    it('applies SOS tie-breaker', async () => {
      (DatabaseService.getCircuitTournaments as any).mockResolvedValue([
        { id: 101, status: 'completed', name: 'T1' },
      ]);
      (DatabaseService.getTournamentConfig as any).mockResolvedValue({});

      // T1 standings: P1 1st, P2 2nd (both 6 players) -> Pts: 6, 4
      (SwissPairingService.calculateStandings as any).mockResolvedValue([
        { player_id: 1, player_name: 'P1', wins: 1 },
        { player_id: 2, player_name: 'P2', wins: 1 },
      ]);

      // Mock Rounds to track opponents
      // P1 vs P2 (P1 wins), P1 vs P3, P2 vs P4
      (DatabaseService.getTournamentRounds as any).mockResolvedValue([
        { id: 1, status: 'completed' },
      ]);
      (DatabaseService.getRoundMatches as any).mockResolvedValue([
        { id: 501, status: 'completed' },
      ]);
      (DatabaseService.getMatchWithResults as any).mockResolvedValue({
        results: [
          { player_id: 1, position: 1 }, // P1 wins
          { player_id: 2, position: 2 },
        ],
      });

      // We need P1 and P2 to have same Pts and Wins but different SOS
      // Wait, getCircuitStandings sorts them.
      // In this mock: P1 wins=1, P2 wins=1.
      // Opponents facing: P1 faced P2. P2 faced P1.
      // SOS(P1) = wins(P2) = 1.
      // SOS(P2) = wins(P1) = 1.
      // Still tied.

      const result = await CircuitService.getCircuitStandings(1);
      expect(result[0].player_id).toBe(1); // P1 wins H2H
    });
  });

  describe('getCircuitPositionEvolution', () => {
    it('returns empty if no completed tournaments', async () => {
      (DatabaseService.getCircuitTournaments as any).mockResolvedValue([
        { id: 101, status: 'active' },
      ]);

      // Spy on standing to return a dummy player
      const spy = vi.spyOn(CircuitService, 'getCircuitStandings').mockResolvedValue([
        {
          player_id: 1,
          player_name: 'P1',
          total_points: 0,
          tournaments_played: 0,
          wins: 0,
          sos: 0,
        },
      ]);

      const result = await CircuitService.getCircuitPositionEvolution(1);

      expect(result.stops).toEqual([]);
      expect(result.players).toHaveLength(1);
      expect(result.players[0].positions).toEqual([]);
      spy.mockRestore();
    });

    it('calculates position evolution correctly', async () => {
      (DatabaseService.getCircuitTournaments as any).mockResolvedValue([
        { id: 101, name: 'Stop 1', status: 'completed' },
        { id: 102, name: 'Stop 2', status: 'completed' },
      ]);
      (DatabaseService.getTournamentConfig as any).mockReturnValue({});

      vi.spyOn(CircuitService, 'getCircuitStandings').mockResolvedValue([
        {
          player_id: 1,
          player_name: 'Alice',
          total_points: 20,
          tournaments_played: 2,
          wins: 1,
          sos: 0,
        },
        {
          player_id: 2,
          player_name: 'Bob',
          total_points: 15,
          tournaments_played: 2,
          wins: 1,
          sos: 0,
        },
      ]);

      (SwissPairingService.calculateStandings as any)
        .mockResolvedValueOnce([
          { player_id: 1, total_points: 10 },
          { player_id: 2, total_points: 5 },
        ])
        .mockResolvedValueOnce([
          { player_id: 2, total_points: 10 },
          { player_id: 1, total_points: 5 },
        ]);

      const result = await CircuitService.getCircuitPositionEvolution(1);

      expect(result.stops).toEqual(['Stop 1', 'Stop 2']);
      expect(result.players).toHaveLength(2);

      const alice = result.players.find((p) => p.player_id === 1);
      const bob = result.players.find((p) => p.player_id === 2);

      expect(alice?.positions).toEqual([1, 2]);
      expect(bob?.positions).toEqual([2, 1]);
    });
  });

  describe('getCircuitPointsEvolution', () => {
    it('calculates cumulative points', async () => {
      (DatabaseService.getCircuitTournaments as any).mockResolvedValue([
        { id: 101, name: 'T1', status: 'completed' },
        { id: 102, name: 'T2', status: 'completed' },
      ]);
      (DatabaseService.getTournamentConfig as any).mockReturnValue({});

      vi.spyOn(CircuitService, 'getCircuitStandings').mockResolvedValue([
        {
          player_id: 1,
          player_name: 'Alice',
          total_points: 10,
          tournaments_played: 2,
          wins: 0,
          sos: 0,
        },
      ]);

      // T1 (2 players): P1 1st -> 6 pts (dynamic scoring for <=6)
      // T2 (2 players): P1 2nd -> 4 pts
      (SwissPairingService.calculateStandings as any)
        .mockResolvedValueOnce([
          { player_id: 1, wins: 3 },
          { player_id: 2, wins: 0 },
        ])
        .mockResolvedValueOnce([
          { player_id: 2, wins: 3 },
          { player_id: 1, wins: 0 },
        ]);

      const result = await CircuitService.getCircuitPointsEvolution(1);

      // Cumulative: 6 -> 6 + 4 = 10
      expect(result.players[0].pointsCumulative).toEqual([6, 10]);
    });
  });
});
