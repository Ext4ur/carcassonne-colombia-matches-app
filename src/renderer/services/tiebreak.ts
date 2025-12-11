import { DatabaseService } from './database';
import { Round, MatchResult } from '../types/tournament';

export class TiebreakService {
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

  private static async getPlayerTotalPoints(tournamentId: number, playerId: number): Promise<number> {
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



