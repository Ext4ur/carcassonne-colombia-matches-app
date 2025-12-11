import { DatabaseService } from './database';
import { Player } from '../types/player';

export interface HeadToHeadRecord {
  player1: Player;
  player2: Player;
  matches: Array<{
    tournament: string;
    round: number;
    player1Position: number;
    player2Position: number;
    player1Points: number;
    player2Points: number;
  }>;
  player1Wins: number;
  player2Wins: number;
  ties: number;
  player1TotalPoints: number;
  player2TotalPoints: number;
}

export class HeadToHeadService {
  static async getHeadToHead(player1Id: number, player2Id: number): Promise<HeadToHeadRecord | null> {
    const player1 = await DatabaseService.getPlayerById(player1Id);
    const player2 = await DatabaseService.getPlayerById(player2Id);

    if (!player1 || !player2) return null;

    // Get all tournaments
    const tournaments = await DatabaseService.getAllTournaments();
    const matches: HeadToHeadRecord['matches'] = [];

    for (const tournament of tournaments) {
      const rounds = await DatabaseService.getTournamentRounds(tournament.id!);
      
      for (const round of rounds) {
        const roundMatches = await DatabaseService.getRoundMatches(round.id!);
        
        for (const match of roundMatches) {
          const results = await DatabaseService.getMatchResults(match.id!);
          const player1Result = results.find((r) => r.player_id === player1Id);
          const player2Result = results.find((r) => r.player_id === player2Id);

          if (player1Result && player2Result) {
            matches.push({
              tournament: tournament.name,
              round: round.round_number,
              player1Position: player1Result.position,
              player2Position: player2Result.position,
              player1Points: player1Result.points,
              player2Points: player2Result.points,
            });
          }
        }
      }
    }

    // Calculate statistics
    let player1Wins = 0;
    let player2Wins = 0;
    let ties = 0;
    let player1TotalPoints = 0;
    let player2TotalPoints = 0;

    for (const match of matches) {
      if (match.player1Position < match.player2Position) {
        player1Wins++;
      } else if (match.player2Position < match.player1Position) {
        player2Wins++;
      } else {
        ties++;
      }
      player1TotalPoints += match.player1Points;
      player2TotalPoints += match.player2Points;
    }

    return {
      player1,
      player2,
      matches,
      player1Wins,
      player2Wins,
      ties,
      player1TotalPoints,
      player2TotalPoints,
    };
  }

  static async getPlayerOpponents(playerId: number): Promise<Array<{ player: Player; matches: number; wins: number; losses: number }>> {
    const tournaments = await DatabaseService.getAllTournaments();
    const opponentMap = new Map<number, { player: Player; matches: number; wins: number; losses: number }>();

    for (const tournament of tournaments) {
      const rounds = await DatabaseService.getTournamentRounds(tournament.id!);
      
      for (const round of rounds) {
        const roundMatches = await DatabaseService.getRoundMatches(round.id!);
        
        for (const match of roundMatches) {
          const results = await DatabaseService.getMatchResults(match.id!);
          const playerResult = results.find((r) => r.player_id === playerId);
          
          if (playerResult) {
            const opponents = results.filter((r) => r.player_id !== playerId);
            
            for (const opponentResult of opponents) {
              const opponentId = opponentResult.player_id;
              
              if (!opponentMap.has(opponentId)) {
                const opponent = await DatabaseService.getPlayerById(opponentId);
                if (opponent) {
                  opponentMap.set(opponentId, {
                    player: opponent,
                    matches: 0,
                    wins: 0,
                    losses: 0,
                  });
                }
              }

              const record = opponentMap.get(opponentId);
              if (record) {
                record.matches++;
                if (playerResult.position < opponentResult.position) {
                  record.wins++;
                } else if (opponentResult.position < playerResult.position) {
                  record.losses++;
                }
              }
            }
          }
        }
      }
    }

    return Array.from(opponentMap.values()).sort((a, b) => b.matches - a.matches);
  }
}


