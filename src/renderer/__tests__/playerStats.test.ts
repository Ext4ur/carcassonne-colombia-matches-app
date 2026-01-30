/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlayerStatsService, computeStatsFromResults } from '../services/playerStats';
import { DatabaseService } from '../services/database';

// Mock DatabaseService
vi.mock('../services/database', () => ({
  DatabaseService: {
    getPlayerById: vi.fn(),
    getTournamentIdsForPlayer: vi.fn(),
    getAllTournaments: vi.fn(),
    getTournamentConfig: vi.fn(),
    getTournamentRounds: vi.fn(),
    getRoundMatches: vi.fn(),
    getMatchResults: vi.fn(),
    getAllCircuits: vi.fn(),
  },
}));

// Mock SwissPairingService
vi.mock('../services/swiss', () => ({
  SwissPairingService: {
    calculateStandings: vi.fn(),
  },
}));

import { SwissPairingService } from '../services/swiss';

describe('PlayerStatsService', () => {
  const mockPlayer = {
    id: 1,
    name: 'Test Player',
    bga_username: 'test_bga',
    display_preference: 'name' as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getPlayerStatisticsRaw', () => {
    it('returns null if player does not exist', async () => {
      (DatabaseService.getPlayerById as any).mockResolvedValue(null);
      const result = await PlayerStatsService.getPlayerStatisticsRaw(999);
      expect(result).toBeNull();
    });

    it('returns empty stats if no tournaments', async () => {
      (DatabaseService.getPlayerById as any).mockResolvedValue(mockPlayer);
      (DatabaseService.getTournamentIdsForPlayer as any).mockResolvedValue([]);

      const result = await PlayerStatsService.getPlayerStatisticsRaw(1);
      expect(result).toEqual({
        player: mockPlayer,
        allTournamentResults: [],
        filterOptions: { tournaments: [], circuits: [] },
      });
    });

    it('calculates stats for completed tournaments', async () => {
      (DatabaseService.getPlayerById as any).mockResolvedValue(mockPlayer);
      (DatabaseService.getTournamentIdsForPlayer as any).mockResolvedValue([101]);
      (DatabaseService.getAllTournaments as any).mockResolvedValue([
        { id: 101, name: 'Tourney 1', status: 'completed', circuit_id: null, type: 'circuit' },
        { id: 102, name: 'Pending Tourney', status: 'pending', circuit_id: null, type: 'circuit' }, // Should be ignored
      ]);
      (DatabaseService.getTournamentConfig as any).mockResolvedValue({});
      (DatabaseService.getTournamentRounds as any).mockResolvedValue([{ id: 1, round_number: 1 }]);
      (DatabaseService.getRoundMatches as any).mockResolvedValue([{ id: 10, match_number: 1 }]);
      (DatabaseService.getMatchResults as any).mockResolvedValue([{ player_id: 1 }]); // Player played in matches
      (DatabaseService.getAllCircuits as any).mockResolvedValue([]);

      // Mock Standings
      (SwissPairingService.calculateStandings as any).mockResolvedValue([
        { player_id: 2, total_points: 10 },
        { player_id: 1, total_points: 5 }, // Player is 2nd
      ]);

      const result = await PlayerStatsService.getPlayerStatisticsRaw(1);

      expect(result).not.toBeNull();
      expect(result!.allTournamentResults).toHaveLength(1);
      expect(result!.allTournamentResults[0].position).toBe(2);
      expect(result!.allTournamentResults[0].points).toBe(5);
      expect(result!.allTournamentResults[0].matchesPlayed).toBe(1);
    });
  });

  describe('computeStatsFromResults', () => {
    const rawData: any = {
      player: mockPlayer,
      allTournamentResults: [
        {
          tournament: { id: 1, name: 'T1', type: 'circuit', circuit_id: 10 },
          position: 1,
          points: 10,
          matchesPlayed: 3,
        },
        {
          tournament: { id: 2, name: 'T2', type: 'qualifier' },
          position: 5,
          points: 2,
          matchesPlayed: 3,
        },
        {
          tournament: { id: 3, name: 'T3', type: 'circuit', circuit_id: 10 },
          position: 2,
          points: 8,
          matchesPlayed: 3,
        },
      ],
      filterOptions: {},
    };

    it('computes aggregated stats correctly', () => {
      const stats = computeStatsFromResults(mockPlayer, rawData);

      expect(stats.totalTournaments).toBe(3);
      expect(stats.totalWins).toBe(1); // Only T1
      expect(stats.averagePosition).toBeCloseTo((1 + 5 + 2) / 3); // 2.66
      expect(stats.bestPosition).toBe(1);
      expect(stats.worstPosition).toBe(5);

      // Circuit stats
      expect(stats.circuitStats.tournaments).toBe(2); // T1, T3
      expect(stats.circuitStats.wins).toBe(1);

      // Qualifier stats
      expect(stats.qualifierStats.tournaments).toBe(1); // T2
    });

    it('filters by tournament id', () => {
      const stats = computeStatsFromResults(mockPlayer, rawData, { tournamentIds: [1] });
      expect(stats.totalTournaments).toBe(1);
      expect((stats as any).allTournamentResults).toBeUndefined(); // internal field
      expect(stats.recentTournaments[0].tournament.id).toBe(1);
    });

    it('filters by circuit id', () => {
      // Filter for circuit 10
      const stats = computeStatsFromResults(mockPlayer, rawData, { circuitIds: [10] });
      expect(stats.totalTournaments).toBe(2); // T1 and T3
    });
  });
});
