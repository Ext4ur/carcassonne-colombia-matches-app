import { DatabaseService } from './database';
import {
  Round,
  PlayerStanding,
  Match,
  MatchResultWithPlayer,
  BuchholzByeMode,
} from '../types/tournament';
import { Player } from '../types/player';

/** Datos pre-cargados para calcular tiebreaks sin más queries */
export interface TiebreakData {
  rounds: Round[];
  roundMatches: Match[][];
  resultsByMatch: Record<number, MatchResultWithPlayer[]>;
  playerTotalPoints: Record<number, number>;
}

export interface TiebreakCalculateOptions {
  buchholzByeMode: BuchholzByeMode;
  /** Rondas programadas N (>= 1) */
  numberOfRounds: number;
  /** Media de total_points del campo antes de tiebreaks */
  tournamentPointsAverage: number;
}

export class TiebreakService {
  /** Calculate a specific tiebreak criterion for all players */
  static async calculate(
    criterionId: string,
    standings: PlayerStanding[],
    rounds: Round[],
    roundMatchesByRound: Match[][],
    resultsByMatch: Record<number, MatchResultWithPlayer[]>,
    players: Player[],
    buchholzOpts: TiebreakCalculateOptions
  ): Promise<Record<number, number>> {
    const playerTotalPoints: Record<number, number> = {};
    const result: Record<number, number> = {};

    standings.forEach((s) => {
      playerTotalPoints[s.player_id] = s.total_points;
    });

    const data: TiebreakData = {
      rounds,
      roundMatches: roundMatchesByRound,
      resultsByMatch,
      playerTotalPoints,
    };

    for (const player of players) {
      if (!player.id) continue;

      let val = 0;
      switch (criterionId) {
        case 'wins':
          val = standings.find((s) => s.player_id === player.id)?.wins || 0;
          break;
        case 'opponent_points_drop_worst':
          val = this.computeOpponentPointsTiebreak(player.id, data, buchholzOpts, true, false);
          break;
        case 'opponent_points_drop_best_worst':
          val = this.computeOpponentPointsTiebreak(player.id, data, buchholzOpts, true, true);
          break;
        case 'point_difference':
          val = this.calculatePointDifferenceFromData(data, player.id);
          break;
        case 'head_to_head':
          val = 0;
          break;
        default:
          val = 0;
      }
      result[player.id] = val;
    }

    return result;
  }

  private static sumAfterSortedCuts(
    values: number[],
    dropWorst: boolean,
    dropBest: boolean
  ): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => b - a);
    if (dropWorst && sorted.length > 0) sorted.pop();
    if (dropBest && sorted.length > 0) sorted.shift();
    return sorted.reduce((s, x) => s + x, 0);
  }

  static playerPlayedRound(
    roundIndex: number,
    playerId: number,
    roundMatchesByRound: Match[][],
    resultsByMatch: Record<number, MatchResultWithPlayer[]>
  ): boolean {
    const matches = roundMatchesByRound[roundIndex] || [];
    for (const match of matches) {
      const results = resultsByMatch[match.id!] || [];
      if (results.some((r) => r.player_id === playerId)) return true;
    }
    return false;
  }

  static opponentTournamentPointsSumInRound(
    roundIndex: number,
    playerId: number,
    roundMatchesByRound: Match[][],
    resultsByMatch: Record<number, MatchResultWithPlayer[]>,
    playerTotalPoints: Record<number, number>
  ): number {
    const matches = roundMatchesByRound[roundIndex] || [];
    for (const match of matches) {
      const results = resultsByMatch[match.id!] || [];
      if (!results.some((r) => r.player_id === playerId)) continue;
      return results
        .filter((r) => r.player_id !== playerId)
        .reduce((sum, r) => sum + (playerTotalPoints[r.player_id] ?? 0), 0);
    }
    return 0;
  }

  private static computeOpponentPointsTiebreak(
    playerId: number,
    data: TiebreakData,
    opts: TiebreakCalculateOptions,
    dropWorst: boolean,
    dropBest: boolean
  ): number {
    const mode = opts.buchholzByeMode;
    const { rounds, roundMatches, resultsByMatch, playerTotalPoints } = data;
    const avg = opts.tournamentPointsAverage;
    const N = Math.max(1, opts.numberOfRounds);

    if (mode === 'legacy' || mode === 'legacy_virtual_avg') {
      const flat: number[] = [];
      for (let r = 0; r < rounds.length; r++) {
        const matches = roundMatches[r] || [];
        for (const match of matches) {
          const results = resultsByMatch[match.id!] || [];
          if (!results.some((res) => res.player_id === playerId)) continue;
          for (const res of results) {
            if (res.player_id !== playerId) {
              flat.push(playerTotalPoints[res.player_id] ?? 0);
            }
          }
        }
      }
      if (mode === 'legacy_virtual_avg') {
        for (let r = 0; r < rounds.length; r++) {
          if (!this.playerPlayedRound(r, playerId, roundMatches, resultsByMatch)) {
            flat.push(avg);
          }
        }
      }
      return this.sumAfterSortedCuts(flat, dropWorst, dropBest);
    }

    // n_minus_1 and n_minus_1_virtual_avg: one aggregate per scheduled round number
    const perRound: number[] = [];
    for (let rn = 1; rn <= N; rn++) {
      const idx = rounds.findIndex((r) => r.round_number === rn);
      if (idx < 0) continue;
      const played = this.playerPlayedRound(idx, playerId, roundMatches, resultsByMatch);
      if (played) {
        perRound.push(
          this.opponentTournamentPointsSumInRound(
            idx,
            playerId,
            roundMatches,
            resultsByMatch,
            playerTotalPoints
          )
        );
      } else if (mode === 'n_minus_1_virtual_avg') {
        perRound.push(avg);
      }
    }

    const M = perRound.length;
    if (M === N && N > 0) {
      return this.sumAfterSortedCuts(perRound, dropWorst, dropBest);
    }
    return perRound.reduce((s, x) => s + x, 0);
  }

  /** Calcula puntos de oponentes desde datos en memoria (0 queries); usa estructura por rondas reales */
  static calculateOpponentPointsFromData(
    data: TiebreakData,
    playerId: number,
    dropWorst: boolean = false,
    dropBest: boolean = false
  ): number {
    const nRounds =
      data.rounds.length > 0 ? Math.max(...data.rounds.map((r) => r.round_number)) : 1;
    const sumPts = Object.values(data.playerTotalPoints).reduce((a, b) => a + b, 0);
    const cnt = Object.keys(data.playerTotalPoints).length;
    const avg = cnt > 0 ? sumPts / cnt : 0;
    return this.computeOpponentPointsTiebreak(
      playerId,
      data,
      {
        buchholzByeMode: 'legacy',
        numberOfRounds: Math.max(1, nRounds),
        tournamentPointsAverage: avg,
      },
      dropWorst,
      dropBest
    );
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
        const results = data.resultsByMatch[match.id!] || [];
        const r1 = results.find((res) => res.player_id === playerId1);
        const r2 = results.find((res) => res.player_id === playerId2);
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
        const results = data.resultsByMatch[match.id!] || [];
        const playerResult = results.find((res) => res.player_id === playerId);
        if (playerResult) {
          const myPoints = playerResult.points ?? 0;
          const oppPoints = results
            .filter((res) => res.player_id !== playerId)
            .reduce((sum, res) => sum + (res.points ?? 0), 0);
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
    const rounds = await DatabaseService.getTournamentRounds(tournamentId);
    const opponentPoints: number[] = [];

    for (const round of rounds) {
      const matches = await DatabaseService.getRoundMatches(round.id!);
      for (const match of matches) {
        const results = await DatabaseService.getMatchResults(match.id!);
        const playerResult = results.find((r) => r.player_id === playerId);

        if (playerResult) {
          const opponents = results.filter((r) => r.player_id !== playerId);
          for (const opponent of opponents) {
            const opponentTotal = await this.getPlayerTotalPoints(tournamentId, opponent.player_id);
            opponentPoints.push(opponentTotal);
          }
        }
      }
    }

    if (opponentPoints.length === 0) return 0;

    const points = [...opponentPoints].sort((a, b) => b - a);

    if (dropWorst && points.length > 0) {
      points.pop();
    }

    if (dropBest && points.length > 0) {
      points.shift();
    }

    return points.reduce((sum, p) => sum + p, 0);
  }

  static async calculateHeadToHead(
    tournamentId: number,
    playerId1: number,
    playerId2: number
  ): Promise<number> {
    const rounds = await DatabaseService.getTournamentRounds(tournamentId);

    for (const round of rounds) {
      const roundMatches = await DatabaseService.getRoundMatches(round.id!);

      for (const match of roundMatches) {
        const results = await DatabaseService.getMatchResults(match.id!);
        const player1Result = results.find((res) => res.player_id === playerId1);
        const player2Result = results.find((r) => r.player_id === playerId2);

        if (player1Result && player2Result) {
          if (player1Result.position < player2Result.position) {
            return 1;
          } else if (player2Result.position < player1Result.position) {
            return -1;
          }
          return 0;
        }
      }
    }

    return 0;
  }

  static async calculatePointDifference(tournamentId: number, playerId: number): Promise<number> {
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
