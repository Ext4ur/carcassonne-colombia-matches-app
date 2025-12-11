import { DatabaseService } from './database';
import { Player } from '../types/player';
import { Tournament } from '../types/tournament';

export interface PlayerStatistics {
  player: Player;
  totalTournaments: number;
  totalWins: number;
  totalMatches: number;
  averagePosition: number;
  bestPosition: number;
  worstPosition: number;
  qualifierStats: {
    tournaments: number;
    wins: number;
    averagePosition: number;
  };
  circuitStats: {
    tournaments: number;
    wins: number;
    averagePosition: number;
  };
  recentTournaments: Array<{
    tournament: Tournament;
    position: number;
    points: number;
  }>;
}

export class PlayerStatsService {
  static async getPlayerStatistics(playerId: number): Promise<PlayerStatistics | null> {
    const player = await DatabaseService.getPlayerById(playerId);
    if (!player) return null;

    // Get all tournaments this player participated in
    const tournaments = await DatabaseService.getAllTournaments();
    const playerTournaments: any[] = [];

    for (const tournament of tournaments) {
      const players = await DatabaseService.getTournamentPlayers(tournament.id!);
      if (players.some((p) => p.id === playerId)) {
        playerTournaments.push(tournament);
      }
    }

    // Get standings for each tournament
    const standings: Array<{ tournament: Tournament; position: number; points: number }> = [];
    let totalWins = 0;
    let totalMatches = 0;
    let totalPosition = 0;
    let bestPosition = Infinity;
    let worstPosition = 0;
    let qualifierCount = 0;
    let qualifierWins = 0;
    let qualifierPosition = 0;
    let circuitCount = 0;
    let circuitWins = 0;
    let circuitPosition = 0;

    for (const tournament of playerTournaments) {
      if (tournament.status !== 'completed') continue;

      const { SwissPairingService } = await import('./swiss');
      const config = await DatabaseService.getTournamentConfig(tournament.id!);
      const tournamentStandings = await SwissPairingService.calculateStandings(
        tournament.id!,
        config?.tiebreak_criteria || []
      );

      const playerStanding = tournamentStandings.find((s) => s.player_id === playerId);
      if (playerStanding) {
        const position = tournamentStandings.findIndex((s) => s.player_id === playerId) + 1;
        standings.push({
          tournament,
          position,
          points: playerStanding.total_points,
        });

        if (position === 1) {
          totalWins++;
          if (tournament.type === 'qualifier') {
            qualifierWins++;
          } else {
            circuitWins++;
          }
        }

        totalPosition += position;
        bestPosition = Math.min(bestPosition, position);
        worstPosition = Math.max(worstPosition, position);

        if (tournament.type === 'qualifier') {
          qualifierCount++;
          qualifierPosition += position;
        } else {
          circuitCount++;
          circuitPosition += position;
        }
      }

      // Count matches
      const rounds = await DatabaseService.getTournamentRounds(tournament.id!);
      for (const round of rounds) {
        const matches = await DatabaseService.getRoundMatches(round.id!);
        for (const match of matches) {
          const results = await DatabaseService.getMatchResults(match.id!);
          if (results.some((r) => r.player_id === playerId)) {
            totalMatches++;
          }
        }
      }
    }

    return {
      player,
      totalTournaments: playerTournaments.filter((t) => t.status === 'completed').length,
      totalWins,
      totalMatches,
      averagePosition: standings.length > 0 ? totalPosition / standings.length : 0,
      bestPosition: bestPosition === Infinity ? 0 : bestPosition,
      worstPosition,
      qualifierStats: {
        tournaments: qualifierCount,
        wins: qualifierWins,
        averagePosition: qualifierCount > 0 ? qualifierPosition / qualifierCount : 0,
      },
      circuitStats: {
        tournaments: circuitCount,
        wins: circuitWins,
        averagePosition: circuitCount > 0 ? circuitPosition / circuitCount : 0,
      },
      recentTournaments: standings.slice(0, 10).reverse(),
    };
  }
}


