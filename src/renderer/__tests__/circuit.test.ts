/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CircuitService } from '../services/circuit';
import { DatabaseService } from '../services/database';
import { SwissPairingService } from '../services/swiss';

// Mock Dependencies
vi.mock('../services/database', () => ({
  DatabaseService: {
    getCircuitTournaments: vi.fn(),
    getCircuitStandings: vi.fn(),
    getTournamentConfig: vi.fn(),
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

  describe('getCircuitPositionEvolution', () => {
    it('returns empty if no tournaments', async () => {
      (DatabaseService.getCircuitTournaments as any).mockResolvedValue([]);
      (DatabaseService.getCircuitStandings as any).mockResolvedValue([
        { player_id: 1, player_name: 'P1', total_points: 0, tournaments_played: 0, wins: 0 },
      ]);

      const result = await CircuitService.getCircuitPositionEvolution(1);

      expect(result.stops).toEqual([]);
      expect(result.players).toHaveLength(1);
      expect(result.players[0].positions).toEqual([]);
    });

    it('calculates position evolution correctly', async () => {
      // Setup: 2 Players, 2 Tournaments
      const p1 = {
        player_id: 1,
        player_name: 'Alice',
        total_points: 20,
        tournaments_played: 2,
        wins: 1,
      };
      const p2 = {
        player_id: 2,
        player_name: 'Bob',
        total_points: 15,
        tournaments_played: 2,
        wins: 1,
      };

      (DatabaseService.getCircuitStandings as any).mockResolvedValue([p1, p2]);
      (DatabaseService.getCircuitTournaments as any).mockResolvedValue([
        { id: 101, name: 'Stop 1' },
        { id: 102, name: 'Stop 2' },
      ]);
      (DatabaseService.getTournamentConfig as any).mockReturnValue({});

      // Mock Standings for Stop 1: Alice 1st, Bob 2nd
      // Mock Standings for Stop 2: Bob 1st, Alice 2nd
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

      // Stop 1 values (from mocked calculateStandings 1st call) -> Index is 0-based, function adds +1?
      // Let's check logic: idx + 1.
      expect(alice?.positions).toEqual([1, 2]); // 1st then 2nd
      expect(bob?.positions).toEqual([2, 1]); // 2nd then 1st
    });

    it('handles player missing a tournament', async () => {
      const p1 = {
        player_id: 1,
        player_name: 'Alice',
        total_points: 0,
        tournaments_played: 0,
        wins: 0,
      };
      (DatabaseService.getCircuitStandings as any).mockResolvedValue([p1]);
      (DatabaseService.getCircuitTournaments as any).mockResolvedValue([{ id: 101, name: 'T1' }]);
      (DatabaseService.getTournamentConfig as any).mockReturnValue({});

      // T1 standings: Player 1 is NOT there
      (SwissPairingService.calculateStandings as any).mockResolvedValue([
        { player_id: 99, total_points: 10 },
      ]);

      const result = await CircuitService.getCircuitPositionEvolution(1);
      expect(result.players[0].positions).toEqual([null]);
    });
  });

  describe('getCircuitPointsEvolution', () => {
    it('calculates cumulative points', async () => {
      const p1 = {
        player_id: 1,
        player_name: 'Alice',
        total_points: 20,
        tournaments_played: 2,
        wins: 0,
      };
      (DatabaseService.getCircuitStandings as any).mockResolvedValue([p1]);
      (DatabaseService.getCircuitTournaments as any).mockResolvedValue([
        { id: 101, name: 'T1' },
        { id: 102, name: 'T2' },
      ]);
      (DatabaseService.getTournamentConfig as any).mockReturnValue({});

      // T1: 10 points
      // T2: 25 points
      (SwissPairingService.calculateStandings as any)
        .mockResolvedValueOnce([{ player_id: 1, total_points: 10 }])
        .mockResolvedValueOnce([{ player_id: 1, total_points: 25 }]);

      const result = await CircuitService.getCircuitPointsEvolution(1);

      // Cumulative: 10 -> 10 + 25 = 35
      expect(result.players[0].pointsCumulative).toEqual([10, 35]);
    });
  });
});
