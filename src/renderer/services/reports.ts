/* eslint-disable @typescript-eslint/no-explicit-any */
import { DatabaseService } from './database';
import { Tournament, PlayerStanding } from '../types/tournament';

import i18n from '../i18n/config';

export class ReportService {
  static async generateTournamentExcel(tournamentId: number): Promise<any> {
    const standings = await this.getStandings(tournamentId);
    const rounds = await DatabaseService.getTournamentRounds(tournamentId);

    // Sheet 1: Leaderboard
    const leaderboardHeaders = [
      i18n.t('tournaments.reports.position'),
      i18n.t('tournaments.reports.player'),
      i18n.t('tournaments.reports.total_points'),
      i18n.t('tournaments.reports.wins'),
    ];
    const leaderboardRows = standings.map((s, index) => [
      index + 1,
      s.player_name,
      s.total_points.toFixed(2),
      s.wins,
    ]);

    // Sheet 2: Results by Round
    const roundResults: any[] = [];
    for (const round of rounds) {
      const matches = await DatabaseService.getRoundMatches(round.id!);
      roundResults.push({
        round: `${i18n.t('tournaments.reports.round')} ${round.round_number}`,
        matches: await Promise.all(
          matches.map(async (match) => {
            const results = await DatabaseService.getMatchResults(match.id!, tournamentId);
            const resultsWithPlayers = results.map((r) => ({
              player: r.player_name ?? 'Unknown',
              position: r.position,
              points: r.points,
              tournament_points: r.tournament_points,
            }));
            return {
              match: match.match_number,
              results: resultsWithPlayers,
            };
          })
        ),
      });
    }

    const roundHeaders = [
      i18n.t('tournaments.reports.round'),
      i18n.t('tournaments.reports.match'),
      i18n.t('tournaments.reports.player'),
      i18n.t('tournaments.reports.position'),
      i18n.t('tournaments.reports.match_points'),
      i18n.t('tournaments.reports.tournament_points'),
    ];
    const roundRows: any[] = [];
    for (const roundData of roundResults) {
      for (const match of roundData.matches) {
        for (const result of match.results) {
          roundRows.push([
            roundData.round,
            match.match,
            result.player,
            result.position,
            result.points,
            result.tournament_points,
          ]);
        }
      }
    }

    // Sheet 3: Statistics
    const statsHeaders = [
      i18n.t('tournaments.reports.stat_name'),
      i18n.t('tournaments.reports.stat_value'),
    ];
    const statsRows = [
      [i18n.t('tournaments.reports.total_players'), standings.length],
      [i18n.t('tournaments.reports.total_rounds'), rounds.length],
      [
        i18n.t('tournaments.reports.total_matches'),
        rounds.reduce((sum, r) => sum + (r as any).match_count || 0, 0),
      ],
      [
        i18n.t('tournaments.reports.avg_points'),
        (standings.reduce((sum, s) => sum + s.total_points, 0) / (standings.length || 1)).toFixed(
          2
        ),
      ],
    ];

    return {
      sheets: [
        {
          name: i18n.t('tournaments.reports.sheet_standings'),
          headers: leaderboardHeaders,
          rows: leaderboardRows,
        },
        {
          name: i18n.t('tournaments.reports.sheet_matches'),
          headers: roundHeaders,
          rows: roundRows,
        },
        {
          name: i18n.t('tournaments.reports.sheet_stats'),
          headers: statsHeaders,
          rows: statsRows,
        },
      ],
    };
  }

  static async generateTournamentCSV(
    tournamentId: number,
    type: 'csv-standings' | 'csv-matches' | 'csv-stats'
  ): Promise<any> {
    const excelData = await this.generateTournamentExcel(tournamentId);

    let sheet: { headers: string[]; rows: any[] };
    if (type === 'csv-standings') {
      sheet = excelData.sheets[0];
    } else if (type === 'csv-matches') {
      sheet = excelData.sheets[1];
    } else {
      sheet = excelData.sheets[2];
    }

    // Convert arrays back to objects for CSV serialization using the headers as keys
    const rows = sheet.rows.map((rowArr: any[]) => {
      const obj: any = {};
      sheet.headers.forEach((header: string, i: number) => {
        obj[header] = rowArr[i];
      });
      return obj;
    });

    return { headers: sheet.headers, rows };
  }

  static async generateTournamentPDF(tournamentId: number): Promise<string> {
    const tournament = (await DatabaseService.getTournamentById(tournamentId)) as Tournament;
    const standings = await this.getStandings(tournamentId);
    const top3 = standings.slice(0, 3);

    // Create HTML content for PDF
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { color: #0ea5e9; }
            .podium { display: flex; justify-content: center; margin: 20px 0; }
            .podium-item { margin: 0 20px; text-align: center; }
            .podium-box { width: 80px; margin: 0 auto 10px; padding: 20px; border-radius: 8px; }
            .first { background: #fbbf24; height: 120px; }
            .second { background: #9ca3af; height: 100px; }
            .third { background: #fb923c; height: 80px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
            th { background-color: #f3f4f6; }
          </style>
        </head>
        <body>
          <h1>${tournament.name}</h1>
          <p>${i18n.t('tournaments.reports.export_pdf_date')}: ${new Date(tournament.date).toLocaleDateString(i18n.language)}</p>
          
          <div class="podium">
            ${
              top3[1]
                ? `<div class="podium-item">
              <div class="podium-box second">2</div>
              <p><strong>${top3[1].player_name}</strong></p>
              <p>${top3[1].total_points.toFixed(2)} pts</p>
            </div>`
                : ''
            }
            ${
              top3[0]
                ? `<div class="podium-item">
              <div class="podium-box first">1</div>
              <p><strong>${top3[0].player_name}</strong></p>
              <p>${top3[0].total_points.toFixed(2)} pts</p>
            </div>`
                : ''
            }
            ${
              top3[2]
                ? `<div class="podium-item">
              <div class="podium-box third">3</div>
              <p><strong>${top3[2].player_name}</strong></p>
              <p>${top3[2].total_points.toFixed(2)} pts</p>
            </div>`
                : ''
            }
          </div>
 
          <h2>${i18n.t('tournaments.reports.export_pdf_leaderboard')}</h2>
          <table>
            <thead>
              <tr>
                <th>${i18n.t('tournaments.reports.position')}</th>
                <th>${i18n.t('tournaments.reports.player')}</th>
                <th>${i18n.t('tournaments.reports.total_points_short')}</th>
                <th>${i18n.t('tournaments.reports.wins')}</th>
              </tr>
            </thead>
            <tbody>
              ${standings
                .map(
                  (s, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td>${s.player_name}</td>
                  <td>${s.total_points.toFixed(2)}</td>
                  <td>${s.wins}</td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;

    return htmlContent;
  }

  static async generateTournamentImage(tournamentId: number): Promise<string> {
    const tournament = (await DatabaseService.getTournamentById(tournamentId)) as Tournament;
    const standings = await this.getStandings(tournamentId);
    const config = await DatabaseService.getTournamentConfig(tournamentId);
    const tiebreakCriteria = config?.tiebreak_criteria || [];
    const top4 = standings.slice(0, 4);

    // Helper to get tiebreak value display
    const getTiebreakDisplay = (standing: PlayerStanding, criterionId: string): string => {
      const value = standing.tiebreak_values[criterionId];
      if (value === undefined || value === null) return '';

      if (criterionId === 'wins') {
        return `${value} 🏆`;
      } else if (criterionId === 'opponent_points_drop_worst') {
        return `${value.toFixed(1)} 📊`;
      } else if (criterionId === 'opponent_points_drop_best_worst') {
        return `${value.toFixed(1)} 📈`;
      } else if (criterionId === 'head_to_head') {
        // For head-to-head, show the result
        if (value > 0) {
          return '✅ Directo';
        } else if (value < 0) {
          return '❌ Directo';
        }
        return '';
      } else if (criterionId === 'point_difference') {
        return value > 0 ? `+${value.toFixed(0)} 📉` : `${value.toFixed(0)} 📉`;
      }
      return '';
    };

    // Find where differences start for each position
    const getRelevantTiebreaks = (standing: PlayerStanding, position: number): string[] => {
      const relevant: string[] = [];

      // Always show wins first
      if (standing.wins !== undefined) {
        relevant.push(getTiebreakDisplay(standing, 'wins'));
      }

      // For first place, show all enabled criteria
      if (position === 0) {
        for (const criterion of tiebreakCriteria) {
          if (!criterion.enabled || criterion.id === 'wins') continue;
          const display = getTiebreakDisplay(standing, criterion.id);
          if (display && display.trim() !== '') {
            relevant.push(display);
          }
        }
        return relevant;
      }

      // For other positions, show all criteria that have values
      // Show all criteria until we find where they differ from previous position
      // const prevStanding = standings[position - 1];

      // Check each criterion in order (excluding wins which is already shown)
      for (const criterion of tiebreakCriteria) {
        if (!criterion.enabled || criterion.id === 'wins') continue;

        const currentValue = standing.tiebreak_values[criterion.id];

        // Show criterion if it has a value
        if (currentValue !== undefined && currentValue !== null) {
          const display = getTiebreakDisplay(standing, criterion.id);
          if (display && display.trim() !== '') {
            relevant.push(display);
          }
        }
      }

      return relevant;
    };

    // Create HTML content for image
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; 
              padding: 40px; 
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              margin: 0;
            }
            .container {
              background: white;
              border-radius: 20px;
              padding: 40px;
              box-shadow: 0 20px 60px rgba(0,0,0,0.3);
              max-width: 1200px;
              margin: 0 auto;
            }
            h1 { 
              color: #1f2937; 
              text-align: center;
              margin-bottom: 10px;
              font-size: 2.5em;
            }
            .date {
              text-align: center;
              color: #6b7280;
              margin-bottom: 40px;
              font-size: 1.2em;
            }
            .podium { 
              display: flex; 
              justify-content: center; 
              align-items: flex-end;
              margin: 40px 0;
              gap: 20px;
            }
            .podium-item { 
              text-align: center;
              display: flex;
              flex-direction: column;
              align-items: center;
            }
            .podium-box { 
              width: 140px; 
              margin-bottom: 15px; 
              padding: 30px 20px; 
              border-radius: 12px 12px 0 0;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            }
            .first { 
              background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%); 
              height: 180px;
            }
            .second { 
              background: linear-gradient(135deg, #9ca3af 0%, #6b7280 100%); 
              height: 150px;
            }
            .third { 
              background: linear-gradient(135deg, #fb923c 0%, #f97316 100%); 
              height: 120px;
            }
            .fourth {
              background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%);
              height: 90px;
            }
            .position-number {
              font-size: 3em;
              font-weight: bold;
              color: white;
              text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
            }
            .player-name {
              font-weight: bold;
              font-size: 1.3em;
              color: #1f2937;
              margin: 10px 0 5px 0;
            }
            .tiebreak-info {
              font-size: 0.9em;
              color: #4b5563;
              line-height: 1.6;
            }
            .tiebreak-item {
              margin: 3px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>${tournament.name}</h1>
            <div class="date">${new Date(tournament.date).toLocaleDateString(i18n.language, { year: 'numeric', month: 'long', day: 'numeric' })}</div>
            
            <div class="podium">
              ${
                top4[1]
                  ? `
                <div class="podium-item">
                  <div class="podium-box second">
                    <div class="position-number">🥈 2</div>
                  </div>
                  <div class="player-name">${top4[1].player_name}</div>
                  <div class="tiebreak-info">
                    ${
                      getRelevantTiebreaks(top4[1], 1).length > 0
                        ? getRelevantTiebreaks(top4[1], 1)
                            .map((t) => `<div class="tiebreak-item">${t}</div>`)
                            .join('')
                        : '<div class="tiebreak-item">-</div>'
                    }
                  </div>
                </div>
              `
                  : ''
              }
              ${
                top4[0]
                  ? `
                <div class="podium-item">
                  <div class="podium-box first">
                    <div class="position-number">🥇 1</div>
                  </div>
                  <div class="player-name">${top4[0].player_name}</div>
                  <div class="tiebreak-info">
                    ${getRelevantTiebreaks(top4[0], 0)
                      .map((t) => `<div class="tiebreak-item">${t}</div>`)
                      .join('')}
                  </div>
                </div>
              `
                  : ''
              }
              ${
                top4[2]
                  ? `
                <div class="podium-item">
                  <div class="podium-box third">
                    <div class="position-number">🥉 3</div>
                  </div>
                  <div class="player-name">${top4[2].player_name}</div>
                  <div class="tiebreak-info">
                    ${getRelevantTiebreaks(top4[2], 2)
                      .map((t) => `<div class="tiebreak-item">${t}</div>`)
                      .join('')}
                  </div>
                </div>
              `
                  : ''
              }
              ${
                top4[3]
                  ? `
                <div class="podium-item">
                  <div class="podium-box fourth">
                    <div class="position-number">4</div>
                  </div>
                  <div class="player-name">${top4[3].player_name}</div>
                  <div class="tiebreak-info">
                    ${getRelevantTiebreaks(top4[3], 3)
                      .map((t) => `<div class="tiebreak-item">${t}</div>`)
                      .join('')}
                  </div>
                </div>
              `
                  : ''
              }
            </div>
          </div>
        </body>
      </html>
    `;

    return htmlContent;
  }

  private static async getStandings(tournamentId: number): Promise<PlayerStanding[]> {
    const { SwissPairingService } = await import('./swiss');
    const config = await DatabaseService.getTournamentConfig(tournamentId);
    return await SwissPairingService.calculateStandings(
      tournamentId,
      config?.tiebreak_criteria || [],
      undefined,
      config?.player_display_mode
    );
  }
}
