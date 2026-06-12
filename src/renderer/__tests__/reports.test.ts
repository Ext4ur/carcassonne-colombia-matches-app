/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReportService } from '../services/reports';
import { DatabaseService } from '../services/database';
import { SwissPairingService } from '../services/swiss';

// Mock Dependencies
vi.mock('../services/database', () => ({
  DatabaseService: {
    getTournamentById: vi.fn(),
    getTournamentRounds: vi.fn(),
    getRoundMatches: vi.fn(),
    getMatchResults: vi.fn(),
    getMatchPlayers: vi.fn(),
    getKnockoutSeeds: vi.fn(),
    getTournamentConfig: vi.fn(),
  },
}));

vi.mock('../services/swiss', () => ({
  SwissPairingService: {
    calculateStandings: vi.fn(),
  },
}));

vi.mock('../i18n/config', () => ({
  default: {
    t: (key: string) => key,
  },
}));

// Mock Date for deterministic PDF output if needed (though PDF includes current date)
// For now, checks will be structural.

describe('ReportService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateTournamentExcel', () => {
    it('generates correct sheets and headers', async () => {
      const tId = 1;
      (DatabaseService.getTournamentById as any).mockResolvedValue({
        id: tId,
        name: 'Test Cup',
        date: '2024-01-01',
      });
      (DatabaseService.getTournamentRounds as any).mockResolvedValue([
        { id: 10, round_number: 1, match_count: 2 },
      ]);
      (DatabaseService.getRoundMatches as any).mockResolvedValue([{ id: 100, match_number: 1 }]);
      (DatabaseService.getMatchResults as any).mockResolvedValue([
        { player_name: 'P1', position: 1, points: 100, tournament_points: 1 },
      ]);
      (DatabaseService.getTournamentConfig as any).mockResolvedValue({});

      // Standings (campos mínimos; desempates vacíos si no hay tiebreak_values)
      (SwissPairingService.calculateStandings as any).mockResolvedValue([
        {
          player_id: 1,
          player_name: 'P1',
          total_points: 1,
          wins: 1,
          matches_played: 1,
          active: true,
          dropout_round: null,
          tiebreak_values: {},
        },
        {
          player_id: 2,
          player_name: 'P2',
          total_points: 0,
          wins: 0,
          matches_played: 1,
          active: true,
          dropout_round: null,
          tiebreak_values: {},
        },
      ]);

      const result = await ReportService.generateTournamentExcel(tId);

      expect(result.sheets).toHaveLength(3);
      expect(result.sheets.map((s: any) => s.name)).toEqual([
        'tournaments.reports.sheet_standings',
        'tournaments.reports.sheet_matches',
        'tournaments.reports.sheet_stats',
      ]);

      // Check Leaderboard
      const lb = result.sheets[0];
      expect(lb.rows).toHaveLength(2); // 2 players
      expect(lb.rows[0]).toEqual([
        1,
        'P1',
        '1.00',
        1,
        'tournaments.config.buchholz_bye_legacy',
        'tournaments.reports.virtual_rule_none',
        '',
        '',
        '',
        '',
      ]);

      // Check detailed results
      const details = result.sheets[1];
      expect(details.rows).toHaveLength(1); // 1 result row mocked
      expect(details.rows[0]).toEqual(['tournaments.reports.round 1', 1, 'P1', 1, 100, 1]);
    });
  });

  describe('generateTournamentCSV', () => {
    it('generates correct rows for standings', async () => {
      const tId = 1;
      (DatabaseService.getTournamentConfig as any).mockResolvedValue({});
      (DatabaseService.getTournamentRounds as any).mockResolvedValue([]);
      (SwissPairingService.calculateStandings as any).mockResolvedValue([
        {
          player_id: 1,
          player_name: 'Winner',
          total_points: 3.5,
          wins: 3,
          matches_played: 3,
          active: true,
          dropout_round: null,
          tiebreak_values: {},
        },
      ]);

      const result = await ReportService.generateTournamentCSV(tId, 'csv-standings');

      expect(result.headers).toEqual([
        'tournaments.reports.position',
        'tournaments.reports.player',
        'tournaments.reports.total_points',
        'tournaments.reports.wins',
        'tournaments.reports.buchholz_mode',
        'tournaments.reports.virtual_opponent',
        'tiebreaks_short.opponent_points_drop_worst',
        'tiebreaks_short.opponent_points_drop_best_worst',
        'tiebreaks_short.head_to_head',
        'tiebreaks_short.point_difference',
      ]);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual({
        'tournaments.reports.position': 1,
        'tournaments.reports.player': 'Winner',
        'tournaments.reports.total_points': '3.50',
        'tournaments.reports.wins': 3,
        'tournaments.reports.buchholz_mode': 'tournaments.config.buchholz_bye_legacy',
        'tournaments.reports.virtual_opponent': 'tournaments.reports.virtual_rule_none',
        'tiebreaks_short.opponent_points_drop_worst': '',
        'tiebreaks_short.opponent_points_drop_best_worst': '',
        'tiebreaks_short.head_to_head': '',
        'tiebreaks_short.point_difference': '',
      });
    });
  });

  describe('generateTournamentPDF', () => {
    it('generates HTML content containing key info', async () => {
      const tId = 1;
      (DatabaseService.getTournamentById as any).mockResolvedValue({
        id: tId,
        name: 'PDF Tournament',
        date: '2024-05-05',
      });
      (DatabaseService.getTournamentConfig as any).mockReturnValue({});
      (SwissPairingService.calculateStandings as any).mockResolvedValue([
        { player_name: 'Champ', total_points: 5, wins: 5 },
        { player_name: 'RunnerUp', total_points: 4, wins: 4 },
        { player_name: 'Third', total_points: 3, wins: 3 },
      ]);

      const html = await ReportService.generateTournamentPDF(tId);

      expect(html).toContain('PDF Tournament');
      expect(html).toContain('Champ');
      expect(html).toContain('5.00 pts'); // Fixed to expect .00 as per service logic (toFixed(2))
      expect(html).toContain('RunnerUp');
      expect(html).toContain('Third');
      expect(html).toContain('<!DOCTYPE html>');
    });
  });

  describe('generateTournamentImage', () => {
    it('generates shareable HTML with podium and top players', async () => {
      const tId = 1;
      (DatabaseService.getTournamentById as any).mockResolvedValue({
        id: tId,
        name: 'Image Cup',
        date: '2024-06-01',
      });
      (DatabaseService.getTournamentConfig as any).mockResolvedValue({
        tiebreak_criteria: [{ id: 'wins', enabled: true }],
      });
      (SwissPairingService.calculateStandings as any).mockResolvedValue([
        { player_name: 'First', total_points: 5, wins: 5, tiebreak_values: {} },
        { player_name: 'Second', total_points: 4, wins: 4, tiebreak_values: {} },
        { player_name: 'Third', total_points: 3, wins: 3, tiebreak_values: {} },
      ]);

      const html = await ReportService.generateTournamentImage(tId);

      expect(html).toContain('Image Cup');
      expect(html).toContain('First');
      expect(html).toContain('Second');
      expect(html).toContain('Third');
      expect(html).toContain('podium');
      expect(html).toContain('<!DOCTYPE html>');
    });
  });

  describe('generateStandingsTableImage', () => {
    it('generates HTML with full standings table markers', async () => {
      const tId = 1;
      (DatabaseService.getTournamentById as any).mockResolvedValue({
        id: tId,
        name: 'Standings Cup',
        date: '2024-07-01',
      });
      (DatabaseService.getTournamentConfig as any).mockResolvedValue({
        tiebreak_criteria: [{ id: 'point_difference', enabled: true, order: 1 }],
      });
      (DatabaseService.getTournamentRounds as any).mockResolvedValue([]);
      (SwissPairingService.calculateStandings as any).mockResolvedValue([
        {
          player_name: 'Alpha',
          total_points: 5,
          wins: 5,
          tiebreak_values: { point_difference: 12 },
        },
        {
          player_name: 'Beta',
          total_points: 4,
          wins: 4,
          tiebreak_values: { point_difference: 3 },
        },
      ]);

      const html = await ReportService.generateStandingsTableImage(tId);

      expect(html).toContain('Standings Cup');
      expect(html).toContain('standings-table-image');
      expect(html).toContain('standings-table');
      expect(html).toContain('Alpha');
      expect(html).toContain('Beta');
      expect(html).toContain('5.00');
      expect(html).toContain('<!DOCTYPE html>');
    });
  });

  describe('generateKnockoutBracketImage', () => {
    it('generates HTML with knockout bracket markers', async () => {
      const tId = 2;
      (DatabaseService.getTournamentById as any).mockResolvedValue({
        id: tId,
        name: 'KO Cup',
        date: '2024-08-01',
        competition_format: 'swiss_knockout',
      });
      (DatabaseService.getTournamentRounds as any).mockResolvedValue([
        {
          id: 20,
          round_number: 4,
          phase: 'knockout',
          knockout_stage: 'semifinal',
        },
        {
          id: 21,
          round_number: 5,
          phase: 'knockout',
          knockout_stage: 'final',
        },
      ]);
      (DatabaseService.getRoundMatches as any).mockImplementation(async (roundId: number) => {
        if (roundId === 20) {
          return [
            {
              id: 200,
              match_number: 1,
              knockout_bracket_slot: 1,
              series_target_wins: 1,
            },
            {
              id: 201,
              match_number: 2,
              knockout_bracket_slot: 2,
              series_target_wins: 1,
            },
          ];
        }
        return [
          {
            id: 210,
            match_number: 1,
            knockout_match_stage: 'final',
            series_target_wins: 1,
            series_winner_id: 11,
          },
        ];
      });
      (DatabaseService.getMatchPlayers as any).mockImplementation(async (matchId: number) => {
        if (matchId === 200) {
          return [
            { id: 1, name: 'P1' },
            { id: 2, name: 'P2' },
          ];
        }
        if (matchId === 201) {
          return [
            { id: 3, name: 'P3' },
            { id: 4, name: 'P4' },
          ];
        }
        return [
          { id: 11, name: 'Finalist A' },
          { id: 12, name: 'Finalist B' },
        ];
      });
      (DatabaseService.getMatchResults as any).mockResolvedValue([]);

      const html = await ReportService.generateKnockoutBracketImage(tId);

      expect(html).toContain('KO Cup');
      expect(html).toContain('knockout-bracket-image');
      expect(html).toContain('bracket-layout');
      expect(html).toContain('P1');
      expect(html).toContain('Finalist A');
      expect(html).toContain('<!DOCTYPE html>');
    });

    it('generates bracket HTML for top-2 (final only)', async () => {
      const tId = 3;
      (DatabaseService.getTournamentById as any).mockResolvedValue({
        id: tId,
        name: 'KO Top 2',
        date: '2024-09-01',
        competition_format: 'swiss_knockout',
      });
      (DatabaseService.getTournamentRounds as any).mockResolvedValue([
        {
          id: 30,
          round_number: 3,
          phase: 'knockout',
          knockout_stage: 'final',
        },
      ]);
      (DatabaseService.getRoundMatches as any).mockResolvedValue([
        {
          id: 300,
          match_number: 1,
          knockout_match_stage: 'final',
          series_target_wins: 1,
          series_winner_id: 1,
        },
      ]);
      (DatabaseService.getMatchPlayers as any).mockResolvedValue([
        { id: 1, name: 'Champion' },
        { id: 2, name: 'Runner-up' },
      ]);
      (DatabaseService.getMatchResults as any).mockResolvedValue([]);

      const html = await ReportService.generateKnockoutBracketImage(tId);

      expect(html).toContain('KO Top 2');
      expect(html).toContain('bracket-layout');
      expect(html).toContain('Champion');
      expect(html).not.toContain('knockout.bracket.empty');
    });
  });
});
