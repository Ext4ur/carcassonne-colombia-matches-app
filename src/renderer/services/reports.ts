/* eslint-disable @typescript-eslint/no-explicit-any */
import { DatabaseService } from './database';
import { Tournament, PlayerStanding, normalizeBuchholzByeMode } from '../types/tournament';
import { getBuchholzModeMeta } from '../utils/buchholzModeMeta';
import {
  formatPlayerStandingHeadToHeadText,
  hasPlayerStandingHeadToHeadAnnotations,
} from '../utils/headToHeadDisplay';
import {
  formatStandingTiebreakForExport,
  getStandingsExportTiebreakColumns,
  tiebreakHeaderForExport,
} from '../utils/standingTiebreakExport';

import type {
  BracketMatchNode,
  BracketRoundColumn,
} from '../components/tournament/KnockoutBracket';
import { knockoutStageI18nKey } from '../types/knockout';
import { buildBracketTree } from '../utils/knockoutBracketTree';
import i18n from '../i18n/config';

export class ReportService {
  static async generateTournamentExcel(tournamentId: number): Promise<any> {
    const standings = await this.getStandings(tournamentId);
    const rounds = await DatabaseService.getTournamentRounds(tournamentId);
    const config = await DatabaseService.getTournamentConfig(tournamentId);
    const modeMeta = getBuchholzModeMeta(normalizeBuchholzByeMode(config?.buchholz_bye_mode));
    const modeLabel = i18n.t(modeMeta.modeLabelI18nKey);
    const virtualRule = modeMeta.usesVirtualOpponent
      ? modeMeta.virtualKind === 'field_avg'
        ? i18n.t('tournaments.reports.virtual_rule_avg')
        : i18n.t('tournaments.reports.virtual_rule_worst')
      : i18n.t('tournaments.reports.virtual_rule_none');

    // Sheet 1: Leaderboard (+ columnas de desempate activas, alineadas con la UI)
    const tiebreakCols = getStandingsExportTiebreakColumns(config?.tiebreak_criteria);
    const tReport = (key: string, options?: Record<string, unknown>) => i18n.t(key, options);
    const tiebreakHeaders = tiebreakCols.map((c) => tiebreakHeaderForExport(c, tReport));
    const leaderboardHeaders = [
      i18n.t('tournaments.reports.position'),
      i18n.t('tournaments.reports.player'),
      i18n.t('tournaments.reports.total_points'),
      i18n.t('tournaments.reports.wins'),
      i18n.t('tournaments.reports.buchholz_mode'),
      i18n.t('tournaments.reports.virtual_opponent'),
      ...tiebreakHeaders,
    ];
    const leaderboardRows = standings.map((s, index) => [
      index + 1,
      s.player_name,
      s.total_points.toFixed(2),
      s.wins,
      modeLabel,
      virtualRule,
      ...tiebreakCols.map((c) => formatStandingTiebreakForExport(s, c.id, tReport)),
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
      [i18n.t('tournaments.reports.buchholz_mode'), modeLabel],
      [i18n.t('tournaments.reports.virtual_opponent'), virtualRule],
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
    const config = await DatabaseService.getTournamentConfig(tournamentId);
    const modeMeta = getBuchholzModeMeta(normalizeBuchholzByeMode(config?.buchholz_bye_mode));
    const modeLabel = i18n.t(modeMeta.modeLabelI18nKey);
    const virtualRule = modeMeta.usesVirtualOpponent
      ? modeMeta.virtualKind === 'field_avg'
        ? i18n.t('tournaments.reports.virtual_rule_avg')
        : i18n.t('tournaments.reports.virtual_rule_worst')
      : i18n.t('tournaments.reports.virtual_rule_none');
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
          <p>${i18n.t('tournaments.reports.buchholz_mode')}: ${modeLabel}</p>
          <p>${i18n.t('tournaments.reports.virtual_opponent')}: ${virtualRule}</p>
          
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
    const modeMeta = getBuchholzModeMeta(normalizeBuchholzByeMode(config?.buchholz_bye_mode));
    const modeLabel = i18n.t(modeMeta.modeLabelI18nKey);
    const virtualRule = modeMeta.usesVirtualOpponent
      ? modeMeta.virtualKind === 'field_avg'
        ? i18n.t('tournaments.reports.virtual_rule_avg')
        : i18n.t('tournaments.reports.virtual_rule_worst')
      : i18n.t('tournaments.reports.virtual_rule_none');
    const tiebreakCriteria = config?.tiebreak_criteria || [];
    const top4 = standings.slice(0, 4);

    // Helper to get tiebreak value display
    const getTiebreakDisplay = (standing: PlayerStanding, criterionId: string): string => {
      if (criterionId === 'head_to_head') {
        return formatPlayerStandingHeadToHeadText(standing, (key, opts) => i18n.t(key, opts));
      }

      const value = standing.tiebreak_values[criterionId];
      if (value === undefined || value === null) return '';

      if (criterionId === 'wins') {
        return `${value} 🏆`;
      } else if (criterionId === 'opponent_points_drop_worst') {
        return `${value.toFixed(1)} 📊`;
      } else if (criterionId === 'opponent_points_drop_best_worst') {
        return `${value.toFixed(1)} 📈`;
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
          if (criterion.id === 'head_to_head') {
            if (hasPlayerStandingHeadToHeadAnnotations(standing)) {
              relevant.push(getTiebreakDisplay(standing, 'head_to_head'));
            }
            continue;
          }
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

        if (criterion.id === 'head_to_head') {
          if (hasPlayerStandingHeadToHeadAnnotations(standing)) {
            relevant.push(getTiebreakDisplay(standing, 'head_to_head'));
          }
          continue;
        }

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
            .buchholz-meta {
              text-align: center;
              color: #4b5563;
              margin-top: -20px;
              margin-bottom: 30px;
              font-size: 1em;
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
              white-space: pre-line;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>${tournament.name}</h1>
            <div class="date">${new Date(tournament.date).toLocaleDateString(i18n.language, { year: 'numeric', month: 'long', day: 'numeric' })}</div>
            <div class="buchholz-meta">${i18n.t('tournaments.reports.buchholz_mode')}: ${modeLabel} · ${i18n.t('tournaments.reports.virtual_opponent')}: ${virtualRule}</div>
            
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

  static async generateStandingsTableImage(tournamentId: number): Promise<string> {
    const tournament = (await DatabaseService.getTournamentById(tournamentId)) as Tournament;
    const standings = await this.getStandings(tournamentId);
    const config = await DatabaseService.getTournamentConfig(tournamentId);
    const tiebreakCols = getStandingsExportTiebreakColumns(config?.tiebreak_criteria);
    const tReport = (key: string, options?: Record<string, unknown>) => i18n.t(key, options);
    const tiebreakHeaders = tiebreakCols.map((c) => tiebreakHeaderForExport(c, tReport));

    const headers = [
      i18n.t('tournaments.reports.position'),
      i18n.t('tournaments.reports.player'),
      i18n.t('tournaments.reports.total_points_short'),
      i18n.t('tournaments.reports.wins'),
      ...tiebreakHeaders,
    ];

    const rows = standings.map((s, index) => [
      String(index + 1),
      s.player_name,
      s.total_points.toFixed(2),
      String(s.wins),
      ...tiebreakCols.map((c) => formatStandingTiebreakForExport(s, c.id, tReport)),
    ]);

    const tableHead = headers.map((h) => `<th>${h}</th>`).join('');
    const tableBody = rows
      .map(
        (row) =>
          `<tr>${row.map((cell, i) => `<td class="${i === 0 ? 'pos' : ''}">${cell || '—'}</td>`).join('')}</tr>`
      )
      .join('');

    return this.wrapImageDocument(
      tournament,
      `
        <h2 class="section-title">${i18n.t('tournaments.reports.export_pdf_leaderboard')}</h2>
        <table class="standings-table">
          <thead><tr>${tableHead}</tr></thead>
          <tbody>${tableBody}</tbody>
        </table>
      `,
      'standings-table-image'
    );
  }

  static async generateKnockoutBracketImage(tournamentId: number): Promise<string> {
    const tournament = (await DatabaseService.getTournamentById(tournamentId)) as Tournament;
    const columns = await this.loadBracketColumns(tournamentId);
    const tree = buildBracketTree(columns);
    const hasSideRounds =
      tree.leftRounds.some((c) => c.matches.length > 0) ||
      tree.rightRounds.some((c) => c.matches.length > 0);

    const bracketBody =
      columns.length === 0 || (!hasSideRounds && !tree.final)
        ? `<p class="empty">${i18n.t('knockout.bracket.empty')}</p>`
        : this.buildBracketHtml(tree);

    return this.wrapImageDocument(
      tournament,
      `
        <h2 class="section-title">${i18n.t('tournaments.reports.export_image_ko_bracket_title')}</h2>
        ${bracketBody}
      `,
      'knockout-bracket-image'
    );
  }

  private static wrapImageDocument(
    tournament: Tournament,
    bodyHtml: string,
    rootClass: string
  ): string {
    return `
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
            .${rootClass} h1 {
              color: #1f2937;
              text-align: center;
              margin-bottom: 10px;
              font-size: 2.2em;
            }
            .date {
              text-align: center;
              color: #6b7280;
              margin-bottom: 30px;
              font-size: 1.1em;
            }
            .section-title {
              text-align: center;
              color: #374151;
              margin: 0 0 24px 0;
              font-size: 1.4em;
            }
            .standings-table {
              width: 100%;
              border-collapse: collapse;
              font-size: 0.95em;
            }
            .standings-table th {
              background: #f3f4f6;
              color: #374151;
              padding: 10px 12px;
              text-align: left;
              border-bottom: 2px solid #e5e7eb;
              white-space: nowrap;
            }
            .standings-table td {
              padding: 8px 12px;
              border-bottom: 1px solid #e5e7eb;
              color: #1f2937;
            }
            .standings-table tr:nth-child(even) td {
              background: #f9fafb;
            }
            .standings-table td.pos {
              font-weight: 700;
              color: #4b5563;
              width: 48px;
            }
            .empty {
              text-align: center;
              color: #6b7280;
              font-size: 1em;
            }
            .bracket-layout {
              display: flex;
              align-items: stretch;
              justify-content: center;
              gap: 8px;
              padding: 8px 0;
            }
            .bracket-side {
              display: flex;
              gap: 20px;
              align-items: stretch;
            }
            .bracket-side.right {
              flex-direction: row-reverse;
            }
            .bracket-round {
              display: flex;
              flex-direction: column;
              gap: 20px;
              justify-content: space-around;
              min-height: 100%;
            }
            .bracket-round-title {
              font-size: 11px;
              font-weight: 600;
              text-align: center;
              color: #6b7280;
              margin-bottom: 4px;
            }
            .match-node {
              border: 1px solid #e5e7eb;
              border-radius: 8px;
              padding: 10px 12px;
              background: #fff;
              min-width: 150px;
              box-shadow: 0 1px 3px rgba(0,0,0,0.08);
              font-size: 13px;
            }
            .match-player {
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              max-width: 180px;
            }
            .match-player.winner {
              font-weight: 700;
              color: #15803d;
            }
            .match-vs {
              font-size: 10px;
              color: #9ca3af;
              text-align: center;
              margin: 4px 0;
            }
            .match-series {
              font-size: 10px;
              color: #6b7280;
              text-align: center;
              margin-top: 4px;
            }
            .match-winner {
              font-size: 10px;
              color: #2563eb;
              text-align: center;
              margin-top: 4px;
            }
            .bracket-connector {
              display: flex;
              flex-direction: column;
              justify-content: center;
              width: 20px;
            }
            .bracket-connector div {
              flex: 1;
              min-height: 36px;
            }
            .bracket-connector .top {
              border-right: 2px solid #d1d5db;
              border-top: 2px solid #d1d5db;
              border-top-right-radius: 8px;
            }
            .bracket-connector .bottom {
              border-right: 2px solid #d1d5db;
              border-bottom: 2px solid #d1d5db;
              border-bottom-right-radius: 8px;
            }
            .bracket-connector.left .top {
              border-right: none;
              border-left: 2px solid #d1d5db;
              border-top-left-radius: 8px;
              border-top-right-radius: 0;
            }
            .bracket-connector.left .bottom {
              border-right: none;
              border-left: 2px solid #d1d5db;
              border-bottom-left-radius: 8px;
              border-bottom-right-radius: 0;
            }
            .bracket-center {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              gap: 16px;
              min-width: 190px;
              padding: 0 12px;
            }
            .final-label {
              font-size: 11px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.05em;
              color: #b45309;
            }
            .bronze-block {
              width: 100%;
              border-top: 1px solid #e5e7eb;
              padding-top: 12px;
              margin-top: 4px;
            }
            .bronze-title {
              font-size: 11px;
              font-weight: 600;
              text-align: center;
              color: #92400e;
              margin-bottom: 8px;
            }
          </style>
        </head>
        <body>
          <div class="container ${rootClass}">
            <h1>${tournament.name}</h1>
            <div class="date">${new Date(tournament.date).toLocaleDateString(i18n.language, { year: 'numeric', month: 'long', day: 'numeric' })}</div>
            ${bodyHtml}
          </div>
        </body>
      </html>
    `;
  }

  private static buildBracketHtml(tree: ReturnType<typeof buildBracketTree>): string {
    const renderMatch = (node: BracketMatchNode): string => {
      const p1Class =
        node.winnerName && node.winnerName === node.player1Name
          ? 'match-player winner'
          : 'match-player';
      const p2Class =
        node.winnerName && node.winnerName === node.player2Name
          ? 'match-player winner'
          : 'match-player';
      return `
        <div class="match-node">
          <div class="${p1Class}">${node.player1Name}</div>
          <div class="match-vs">vs</div>
          <div class="${p2Class}">${node.player2Name}</div>
          ${node.seriesLabel ? `<div class="match-series">${node.seriesLabel}</div>` : ''}
          ${
            node.winnerName
              ? `<div class="match-winner">${i18n.t('knockout.bracket.winner', { name: node.winnerName })}</div>`
              : ''
          }
        </div>
      `;
    };

    const renderRound = (col: BracketRoundColumn): string => {
      if (col.matches.length === 0) return '';
      const title = col.round.knockout_stage
        ? i18n.t(knockoutStageI18nKey(col.round.knockout_stage))
        : i18n.t('tournaments.round_n', { n: col.round.round_number });
      return `
        <div class="bracket-round">
          <div class="bracket-round-title">${title}</div>
          ${col.matches.map((m) => renderMatch(m)).join('')}
        </div>
      `;
    };

    const hasSideRounds =
      tree.leftRounds.some((c) => c.matches.length > 0) ||
      tree.rightRounds.some((c) => c.matches.length > 0);

    const leftHtml = tree.leftRounds.map(renderRound).join('');
    const rightHtml = tree.rightRounds.map(renderRound).join('');

    const centerHtml = `
      <div class="bracket-center">
        <div class="final-label">${i18n.t('knockout.bracket.final_title')}</div>
        ${tree.final ? renderMatch(tree.final) : `<p class="empty">${i18n.t('knockout.bracket.empty')}</p>`}
        ${
          tree.bronze
            ? `
          <div class="bronze-block">
            <div class="bronze-title">${i18n.t('knockout.stage.third_place')}</div>
            ${renderMatch(tree.bronze)}
          </div>
        `
            : ''
        }
      </div>
    `;

    const connectorRight = hasSideRounds
      ? `<div class="bracket-connector"><div class="top"></div><div class="bottom"></div></div>`
      : '';
    const connectorLeft = hasSideRounds
      ? `<div class="bracket-connector left"><div class="top"></div><div class="bottom"></div></div>`
      : '';

    return `
      <div class="bracket-layout">
        <div class="bracket-side">${leftHtml}</div>
        ${connectorRight}
        ${centerHtml}
        ${connectorLeft}
        <div class="bracket-side right">${rightHtml}</div>
      </div>
    `;
  }

  private static async loadBracketColumns(tournamentId: number): Promise<BracketRoundColumn[]> {
    const rounds = await DatabaseService.getTournamentRounds(tournamentId);
    const koRounds = rounds.filter((r) => r.phase === 'knockout');
    const { computeSeriesState } = await import('./knockout');
    const cols: BracketRoundColumn[] = [];

    for (const round of koRounds) {
      if (!round.id) continue;
      const roundMatches = await DatabaseService.getRoundMatches(round.id);
      const nodes = await Promise.all(
        roundMatches.map(async (m) => {
          const players = await DatabaseService.getMatchPlayers(m.id!);
          const results = await DatabaseService.getMatchResults(m.id!);
          const winner = m.series_winner_id
            ? players.find((p) => p.id === m.series_winner_id)?.name
            : undefined;
          let seriesLabel: string | undefined;
          if ((m.series_target_wins ?? 1) > 1 && players.length === 2) {
            const pids = [players[0]!.id!, players[1]!.id!] as [number, number];
            const state = computeSeriesState(m, results, pids);
            seriesLabel = `${state.winsByPlayer[pids[0]] ?? 0}-${state.winsByPlayer[pids[1]] ?? 0}`;
          }
          return {
            match: m,
            player1Name: players[0]?.name ?? '—',
            player2Name: players[1]?.name ?? '—',
            winnerName: winner,
            seriesLabel,
          };
        })
      );
      cols.push({ round, matches: nodes });
    }

    return cols;
  }

  /** Clasificación con valores de desempate (p. ej. informes, respaldo JSON). */
  static async getStandings(tournamentId: number): Promise<PlayerStanding[]> {
    const { computeKnockoutFinalStandingsForTournament } = await import('./knockoutStandings');
    return computeKnockoutFinalStandingsForTournament(tournamentId);
  }
}
