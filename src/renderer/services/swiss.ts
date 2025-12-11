import { DatabaseService } from './database';
import { Tournament, Round, Match, MatchResult, PlayerStanding } from '../types/tournament';
import { getTournamentPoints } from '../utils/scoring';
import { calculateNumberOfRounds } from '../utils/tournament';

interface PlayerWithPoints {
  player_id: number;
  player_name: string;
  total_points: number;
  previous_opponents: number[];
}

export class SwissPairingService {
  static async generateFirstRound(tournamentId: number): Promise<void> {
    // Get all registered players
    const players = await DatabaseService.getTournamentPlayers(tournamentId);
    
    if (players.length < 2) {
      throw new Error('Se necesitan al menos 2 jugadores para generar una ronda');
    }

    // Shuffle players randomly
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    
    // Create round
    const roundId = await DatabaseService.createRound({
      tournament_id: tournamentId,
      round_number: 1,
      status: 'pending',
    });

    // Get tournament config
    const tournament = await DatabaseService.getTournamentById(tournamentId) as Tournament;
    const playersPerMatch = tournament.players_per_match;

    // Create matches
    let matchNumber = 1;
    for (let i = 0; i < shuffled.length; i += playersPerMatch) {
      const matchPlayers = shuffled.slice(i, i + playersPerMatch);
      
      // If odd number and last match has only 1 player, give bye
      if (matchPlayers.length === 1 && i === shuffled.length - 1) {
        // Create match with bye (player gets automatic win)
        const matchId = await DatabaseService.createMatch({
          round_id: roundId,
          match_number: matchNumber,
          status: 'completed',
        });

        const config = await DatabaseService.getTournamentConfig(tournamentId);
        const scoringSystem = config?.scoring_system || { 1: 1, 2: 0 };
        
        await DatabaseService.createMatchResult({
          match_id: matchId,
          player_id: matchPlayers[0].id!,
          position: 1,
          points: 0,
          tournament_points: scoringSystem[1] || 1,
        });

        await DatabaseService.updateMatch(matchId, {
          status: 'completed',
          completed_at: new Date().toISOString(),
        });
      } else {
        const matchId = await DatabaseService.createMatch({
          round_id: roundId,
          match_number: matchNumber,
          status: 'pending',
        });
        
        // Assign players to match
        const playerIds = matchPlayers.map((p) => p.id!);
        await DatabaseService.setMatchPlayers(matchId, playerIds);
      }
      
      matchNumber++;
    }

    // Update tournament status
    await DatabaseService.updateTournament(tournamentId, { status: 'in_progress' });
  }

  static async generateNextRound(tournamentId: number): Promise<void> {
    // Get current rounds
    const rounds = await DatabaseService.getTournamentRounds(tournamentId);
    const lastRound = rounds[rounds.length - 1];

    if (!lastRound || lastRound.status !== 'completed') {
      throw new Error('La ronda anterior debe estar completada');
    }

    // Check if we've reached the maximum number of rounds
    const tournament = await DatabaseService.getTournamentById(tournamentId) as Tournament;
    const numberOfRounds = tournament.number_of_rounds || calculateNumberOfRounds(
      (await DatabaseService.getTournamentPlayers(tournamentId)).length
    );
    
    if (rounds.length >= numberOfRounds) {
      throw new Error(`Se ha alcanzado el número máximo de rondas (${numberOfRounds})`);
    }

    // Get tournament config
    const config = await DatabaseService.getTournamentConfig(tournamentId);
    const avoidRematches = config?.avoid_rematches ?? true;

    // Calculate standings
    const standings = await this.calculateStandings(tournamentId, config?.tiebreak_criteria || []);

    // Get previous opponents for each player
    const previousOpponents = await this.getPreviousOpponents(tournamentId);

    // Create new round
    const nextRoundNumber = rounds.length + 1;
    const roundId = await DatabaseService.createRound({
      tournament_id: tournamentId,
      round_number: nextRoundNumber,
      status: 'pending',
    });

    // Pair players
    const playersPerMatch = tournament.players_per_match;
    const paired = new Set<number>();
    let matchNumber = 1;

    // Group players by similar points
    const pointGroups: { [points: number]: PlayerStanding[] } = {};
    standings.forEach((standing) => {
      const points = Math.floor(standing.total_points);
      if (!pointGroups[points]) {
        pointGroups[points] = [];
      }
      pointGroups[points].push(standing);
    });

    // Pair within groups
    const sortedPoints = Object.keys(pointGroups).map(Number).sort((a, b) => b - a);

    // Get bye selection method from config
    const byeSelection = (config as any)?.bye_selection || 'worst';
    
    // Get players who have already received bye
    const byeHistory = await DatabaseService.getPlayerByes(tournamentId);
    const playersWithBye = new Set(byeHistory.map((b: any) => b.player_id));

    for (const points of sortedPoints) {
      const group = pointGroups[points];
      const unpaired = group.filter((p) => !paired.has(p.player_id));

      // Try to pair players avoiding rematches
      for (let i = 0; i < unpaired.length; i += playersPerMatch) {
        let matchPlayers = unpaired.slice(i, i + playersPerMatch);
        
        // Handle odd number of players
        if (matchPlayers.length === 1 && i === unpaired.length - 1) {
          // Bye needed - select player based on configuration
          let byePlayer = matchPlayers[0];
          
          if (byeSelection === 'round_robin') {
            // Select worst player who hasn't received bye
            const candidatesWithoutBye = unpaired.filter((p) => !playersWithBye.has(p.player_id));
            if (candidatesWithoutBye.length > 0) {
              byePlayer = candidatesWithoutBye[candidatesWithoutBye.length - 1];
            }
          } else if (byeSelection === 'random') {
            // Select random player
            const candidates = byeSelection === 'round_robin' 
              ? unpaired.filter((p) => !playersWithBye.has(p.player_id))
              : unpaired;
            if (candidates.length > 0) {
              byePlayer = candidates[Math.floor(Math.random() * candidates.length)];
            }
          } else {
            // 'worst' - select worst player (last in standings)
            byePlayer = unpaired[unpaired.length - 1];
          }
          
          const matchId = await DatabaseService.createMatch({
            round_id: roundId,
            match_number: matchNumber,
            status: 'completed',
          });

          const scoringSystem = config?.scoring_system || { 1: 1, 2: 0 };
          
          await DatabaseService.createMatchResult({
            match_id: matchId,
            player_id: byePlayer.player_id,
            position: 1,
            points: 0,
            tournament_points: scoringSystem[1] || 1,
          });

          await DatabaseService.updateMatch(matchId, {
            status: 'completed',
            completed_at: new Date().toISOString(),
          });

          // Record the bye
          await DatabaseService.addPlayerBye(tournamentId, byePlayer.player_id, nextRoundNumber);
          playersWithBye.add(byePlayer.player_id);

          paired.add(byePlayer.player_id);
        } else if (matchPlayers.length < playersPerMatch && i === unpaired.length - matchPlayers.length) {
          // Not enough players for a full match - need to handle bye
          let byePlayer = matchPlayers[matchPlayers.length - 1];
          
          if (byeSelection === 'round_robin') {
            // Select worst player who hasn't received bye
            const candidatesWithoutBye = matchPlayers.filter((p) => !playersWithBye.has(p.player_id));
            if (candidatesWithoutBye.length > 0) {
              byePlayer = candidatesWithoutBye[candidatesWithoutBye.length - 1];
            }
          } else if (byeSelection === 'random') {
            // Select random player
            const candidates = byeSelection === 'round_robin' 
              ? matchPlayers.filter((p) => !playersWithBye.has(p.player_id))
              : matchPlayers;
            if (candidates.length > 0) {
              byePlayer = candidates[Math.floor(Math.random() * candidates.length)];
            }
          } else {
            // 'worst' - select worst player (last in group)
            byePlayer = matchPlayers[matchPlayers.length - 1];
          }
          
          // Remove bye player from match
          matchPlayers = matchPlayers.filter((p) => p.player_id !== byePlayer.player_id);
          
          // Create bye match
          const byeMatchId = await DatabaseService.createMatch({
            round_id: roundId,
            match_number: matchNumber,
            status: 'completed',
          });

          const scoringSystem = config?.scoring_system || { 1: 1, 2: 0 };
          
          await DatabaseService.createMatchResult({
            match_id: byeMatchId,
            player_id: byePlayer.player_id,
            position: 1,
            points: 0,
            tournament_points: scoringSystem[1] || 1,
          });

          await DatabaseService.updateMatch(byeMatchId, {
            status: 'completed',
            completed_at: new Date().toISOString(),
          });

          await DatabaseService.addPlayerBye(tournamentId, byePlayer.player_id, nextRoundNumber);
          playersWithBye.add(byePlayer.player_id);
          paired.add(byePlayer.player_id);
          matchNumber++;

          // Continue with remaining players if any
          if (matchPlayers.length === 0) {
            continue;
          }
        }

        // Check for rematches if needed
        let validPairing = true;
        if (avoidRematches && matchPlayers.length === 2) {
          const player1Opponents = previousOpponents[matchPlayers[0].player_id] || [];
          if (player1Opponents.includes(matchPlayers[1].player_id)) {
            // Try to find alternative pairing
            validPairing = false;
            for (let j = i + matchPlayers.length; j < unpaired.length; j++) {
              const altOpponents = previousOpponents[matchPlayers[0].player_id] || [];
              if (!altOpponents.includes(unpaired[j].player_id)) {
                // Swap
                [matchPlayers[1], unpaired[j]] = [unpaired[j], matchPlayers[1]];
                validPairing = true;
                break;
              }
            }
          }
        }

        if (validPairing && matchPlayers.length > 0) {
          const matchId = await DatabaseService.createMatch({
            round_id: roundId,
            match_number: matchNumber,
            status: 'pending',
          });

          // Assign players to match
          const playerIds = matchPlayers.map((p) => p.player_id);
          await DatabaseService.setMatchPlayers(matchId, playerIds);

          matchPlayers.forEach((p) => paired.add(p.player_id));
          matchNumber++;
        }
      }
    }
  }

  static async calculateStandings(
    tournamentId: number,
    tiebreakCriteria: any[]
  ): Promise<PlayerStanding[]> {
    // Get all players and their results
    const players = await DatabaseService.getTournamentPlayers(tournamentId);
    const rounds = await DatabaseService.getTournamentRounds(tournamentId);
    
    const standings: PlayerStanding[] = [];

    for (const player of players) {
      if (!player.id) continue;

      let totalPoints = 0;
      let wins = 0;
      const tiebreakValues: { [key: string]: number } = {};

      // Get all match results for this player
      for (const round of rounds) {
        const matches = await DatabaseService.getRoundMatches(round.id!);
        for (const match of matches) {
          const results = await DatabaseService.getMatchResults(match.id!);
          const playerResult = results.find((r) => r.player_id === player.id);
          
          if (playerResult) {
            totalPoints += playerResult.tournament_points;
            if (playerResult.position === 1) {
              wins++;
            }
          }
        }
      }

      // Calculate tiebreak values
      for (const criterion of tiebreakCriteria) {
        if (!criterion.enabled) continue;

        switch (criterion.id) {
          case 'wins':
            tiebreakValues[criterion.id] = wins;
            break;
          case 'opponent_points_drop_worst':
          case 'opponent_points_drop_best_worst':
          case 'head_to_head':
          case 'point_difference':
            // These require more complex calculations
            tiebreakValues[criterion.id] = await this.calculateTiebreakValue(
              tournamentId,
              player.id,
              criterion.id,
              rounds
            );
            break;
        }
      }

      standings.push({
        player_id: player.id,
        player_name: player.name,
        total_points: totalPoints,
        wins,
        tiebreak_values: tiebreakValues,
      });
    }

    // Sort by criteria
    const sorted = this.sortByTiebreak(standings, tiebreakCriteria);
    return sorted;
  }

  private static async calculateTiebreakValue(
    tournamentId: number,
    playerId: number,
    criterionId: string,
    rounds: Round[]
  ): Promise<number> {
    const { TiebreakService } = await import('./tiebreak');
    
    switch (criterionId) {
      case 'opponent_points_drop_worst':
        return await TiebreakService.calculateOpponentPoints(tournamentId, playerId, true, false);
      case 'opponent_points_drop_best_worst':
        return await TiebreakService.calculateOpponentPoints(tournamentId, playerId, true, true);
      case 'point_difference':
        return await TiebreakService.calculatePointDifference(tournamentId, playerId);
      default:
        return 0;
    }
  }

  private static sortByTiebreak(
    standings: PlayerStanding[],
    criteria: any[]
  ): PlayerStanding[] {
    const sorted = [...standings].sort((a, b) => {
      // First by total points
      if (b.total_points !== a.total_points) {
        return b.total_points - a.total_points;
      }

      // Then by tiebreak criteria in order
      for (const criterion of criteria) {
        if (!criterion.enabled) continue;

        const aValue = a.tiebreak_values[criterion.id] || 0;
        const bValue = b.tiebreak_values[criterion.id] || 0;

        if (bValue !== aValue) {
          return bValue - aValue;
        }
      }

      return 0;
    });

    return sorted;
  }

  private static async getPreviousOpponents(tournamentId: number): Promise<{ [playerId: number]: number[] }> {
    const opponents: { [playerId: number]: number[] } = {};
    const rounds = await DatabaseService.getTournamentRounds(tournamentId);

    for (const round of rounds) {
      const matches = await DatabaseService.getRoundMatches(round.id!);
      for (const match of matches) {
        const results = await DatabaseService.getMatchResults(match.id!);
        const playerIds = results.map((r) => r.player_id);
        
        // Each player played against all others in the match
        for (const playerId of playerIds) {
          if (!opponents[playerId]) {
            opponents[playerId] = [];
          }
          for (const opponentId of playerIds) {
            if (opponentId !== playerId && !opponents[playerId].includes(opponentId)) {
              opponents[playerId].push(opponentId);
            }
          }
        }
      }
    }

    return opponents;
  }
}

