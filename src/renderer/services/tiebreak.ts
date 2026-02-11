/* eslint-disable @typescript-eslint/no-explicit-any */

import { DatabaseService } from './database';
import { Round, PlayerStanding } from '../types/tournament';

/** Datos pre-cargados para calcular tiebreaks sin más queries */
export interface TiebreakData {
  rounds: Round[];
  roundMatches: any[][];
  resultsByMatch: Record<number, any[]>;
  playerTotalPoints: Record<number, number>;
}

export class TiebreakService {
  /** Calculate a specific tiebreak criterion for all players */
  static async calculate(
    criterionId: string,
    standings: PlayerStanding[],
    roundMatches: any[],
    resultsByMatch: Record<number, any[]>,
    players: any[]
  ): Promise<Record<number, number>> {
    const playerTotalPoints: Record<number, number> = {};
    const result: Record<number, number> = {};

    // Calculate total points for context if needed
    standings.forEach((s) => {
      playerTotalPoints[s.player_id] = s.total_points;
    });

    const data: TiebreakData = {
      rounds: [], // Not strictly needed for these calcs if roundMatches is sufficient, but interface requires it
      roundMatches: [roundMatches], // Hack: roundMatches passed here is flat, but data expects Match[][].
      // Actually, looking at usages, existing methods iterate data.roundMatches[r].
      // If we pass flat list as roundMatches[0], loop r=0 will work.
      resultsByMatch,
      playerTotalPoints,
    };

    // Correction: existing methods iterate data.rounds.length.
    // We need to construct a "fake" rounds array or adjust the input.
    // Since calculating opponent points needs to know about rounds,
    // it's better if we passed matches grouped by round?
    // In SwissPairingService, we flattened roundMatches.
    // BUT, existing TiebreakService methods (lines 23, 55, 74) iterate `r < data.rounds.length`.

    // If we only have flat matches, we can wrap them in a single "round" (index 0).
    // And set data.rounds = [dummyRound].
    data.rounds = [{ id: 0, tournament_id: 0, round_number: 1, status: 'completed' }]; // Dummy round to trigger one iteration

    for (const player of players) {
      if (!player.id) continue;

      let val = 0;
      switch (criterionId) {
        case 'wins':
          // Already processed in standings, but if we need to re-calc?
          // Usually taken from standings directly.
          // But TiebreakService should return the value.
          val = standings.find((s) => s.player_id === player.id)?.wins || 0;
          break;
        case 'opponent_points_drop_worst':
          val = this.calculateOpponentPointsFromData(data, player.id, true, false);
          break;
        case 'opponent_points_drop_best_worst':
          val = this.calculateOpponentPointsFromData(data, player.id, true, true);
          break;
        case 'point_difference':
          val = this.calculatePointDifferenceFromData(data, player.id);
          break;
        case 'head_to_head':
          // Head to head is relative, not absolute value per player.
          // It's usually handled during sort comparison.
          // Assign 0 here.
          val = 0;
          break;
        default:
          val = 0;
      }
      result[player.id] = val;
    }

    return result;
  }

  /** Calcula puntos de oponentes desde datos en memoria (0 queries) */
  static calculateOpponentPointsFromData(
    data: TiebreakData,
    playerId: number,
    dropWorst: boolean = false,
    dropBest: boolean = false
  ): number {
    const opponentPoints: number[] = [];
    for (let r = 0; r < data.rounds.length; r++) {
      const matches = data.roundMatches[r] || [];
      for (const match of matches) {
        const results = data.resultsByMatch[match.id] || [];
        const playerResult = results.find((r: any) => r.player_id === playerId);
        if (playerResult) {
          const opponents = results.filter((r: any) => r.player_id !== playerId);
          for (const opp of opponents) {
            opponentPoints.push(data.playerTotalPoints[opp.player_id] ?? 0);
          }
        }
      }
    }
    if (opponentPoints.length === 0) return 0;
    let points = [...opponentPoints];
    if (dropWorst && points.length > 1) {
      points = points.sort((a, b) => b - a);
      points.pop();
    }
    if (dropBest && points.length > 1) {
      points = points.sort((a, b) => b - a);
      points.shift();
    }
    return points.reduce((sum, p) => sum + p, 0);
  }

  /** Head-to-head desde datos en memoria */
  static calculateHeadToHeadFromData(
    data: TiebreakData,
    playerId1: number,
    playerId2: number
  ): number {
    for (let r = 0; r < data.rounds.length; r++) {
      const matches = data.roundMatches[r] || [];
      for (const match of matches) {
        const results = data.resultsByMatch[match.id] || [];
        const r1 = results.find((r: any) => r.player_id === playerId1);
        const r2 = results.find((r: any) => r.player_id === playerId2);
        if (r1 && r2) {
          if (r1.position < r2.position) return 1;
          if (r2.position < r1.position) return -1;
          return 0;
        }
      }
    }
    return 0;
  }

  /** Diferencia de puntos desde datos en memoria */
  static calculatePointDifferenceFromData(data: TiebreakData, playerId: number): number {
    let total = 0;
    for (let r = 0; r < data.rounds.length; r++) {
      const matches = data.roundMatches[r] || [];
      for (const match of matches) {
        const results = data.resultsByMatch[match.id] || [];
        const playerResult = results.find((r: any) => r.player_id === playerId);
        if (playerResult) {
          const myPoints = playerResult.points ?? 0;
          const oppPoints = results
            .filter((r: any) => r.player_id !== playerId)
            .reduce((sum, r: any) => sum + (r.points ?? 0), 0);
          total += myPoints - oppPoints;
        }
      }
    }
    return total;
  }

  static async calculateOpponentPoints(
    tournamentId: number,
    playerId: number,
    dropWorst: boolean = false,
    dropBest: boolean = false
  ): Promise<number> {
    // Get all opponents this player has faced
    const rounds = await DatabaseService.getTournamentRounds(tournamentId);
    const opponentPoints: number[] = [];

    for (const round of rounds) {
      const matches = await DatabaseService.getRoundMatches(round.id!);
      for (const match of matches) {
        const results = await DatabaseService.getMatchResults(match.id!);
        const playerResult = results.find((r) => r.player_id === playerId);

        if (playerResult) {
          // Get all opponents in this match
          const opponents = results.filter((r) => r.player_id !== playerId);
          for (const opponent of opponents) {
            // Get opponent's total tournament points
            const opponentTotal = await this.getPlayerTotalPoints(tournamentId, opponent.player_id);
            opponentPoints.push(opponentTotal);
          }
        }
      }
    }

    if (opponentPoints.length === 0) return 0;

    let points = [...opponentPoints];

    if (dropWorst && points.length > 1) {
      points = points.sort((a, b) => b - a);
      points.pop(); // Remove worst
    }

    if (dropBest && points.length > 1) {
      points = points.sort((a, b) => b - a);
      points.shift(); // Remove best
    }

    return points.reduce((sum, p) => sum + p, 0);
  }

  static async calculateHeadToHead(
    tournamentId: number,
    playerId1: number,
    playerId2: number
  ): Promise<number> {
    // Returns 1 if playerId1 won, -1 if playerId2 won, 0 if tie or no match
    const rounds = await DatabaseService.getTournamentRounds(tournamentId);

    for (const round of rounds) {
      const matches = await DatabaseService.getRoundMatches(round.id!);
      for (const match of matches) {
        const results = await DatabaseService.getMatchResults(match.id!);
        const player1Result = results.find((r) => r.player_id === playerId1);
        const player2Result = results.find((r) => r.player_id === playerId2);

        if (player1Result && player2Result) {
          if (player1Result.position < player2Result.position) {
            return 1; // player1 won
          } else if (player2Result.position < player1Result.position) {
            return -1; // player2 won
          }
          return 0; // tie
        }
      }
    }

    return 0; // No head-to-head match
  }

  static async calculatePointDifference(tournamentId: number, playerId: number): Promise<number> {
    // Sum of (points scored - points against) in each match
    const rounds = await DatabaseService.getTournamentRounds(tournamentId);
    let totalDifference = 0;

    for (const round of rounds) {
      const matches = await DatabaseService.getRoundMatches(round.id!);
      for (const match of matches) {
        const results = await DatabaseService.getMatchResults(match.id!);
        const playerResult = results.find((r) => r.player_id === playerId);

        if (playerResult) {
          const playerPoints = playerResult.points;
          const opponentPoints = results
            .filter((r) => r.player_id !== playerId)
            .reduce((sum, r) => sum + r.points, 0);

          totalDifference += playerPoints - opponentPoints;
        }
      }
    }

    return totalDifference;
  }

  private static async getPlayerTotalPoints(
    tournamentId: number,
    playerId: number
  ): Promise<number> {
    const rounds = await DatabaseService.getTournamentRounds(tournamentId);
    let total = 0;

    for (const round of rounds) {
      const matches = await DatabaseService.getRoundMatches(round.id!);
      for (const match of matches) {
        const results = await DatabaseService.getMatchResults(match.id!);
        const playerResult = results.find((r) => r.player_id === playerId);
        if (playerResult) {
          total += playerResult.tournament_points;
        }
      }
    }

    return total;
  }
}
