import { DatabaseService } from './database';
import { TiebreakService } from './tiebreak';
import {
  Tournament,
  Round,
  Match,
  PlayerStanding,
  MatchResult,
  TiebreakCriterion,
} from '../types/tournament';
import { Player } from '../types/player';
import { calculateNumberOfRounds } from '../utils/tournament';
import { getPlayerDisplayName, type PlayerDisplayMode } from '../utils/playerDisplayName';
import i18n from '../i18n/config';

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
    const tournament = (await DatabaseService.getTournamentById(tournamentId)) as Tournament;
    const playersPerMatch = tournament.players_per_match;

    // Get players who have already received bye (should be empty for round 1, but keeps logic consistent)
    const byeHistory = await DatabaseService.getPlayerByes(tournamentId);
    const playersWithBye = new Set(byeHistory.map((b) => b.player_id));

    // Create matches
    let matchNumber = 1;
    for (let i = 0; i < shuffled.length; i += playersPerMatch) {
      const matchPlayers = shuffled.slice(i, i + playersPerMatch);

      // If odd number and last match has only 1 player, give bye
      if (matchPlayers.length === 1 && i === shuffled.length - 1) {
        // Enforce bye history even in random round 1 (for robustness)
        const byePlayerConfig = await DatabaseService.getTournamentConfig(tournamentId);
        const byeSelection = byePlayerConfig?.bye_selection || 'worst';

        // Map to PlayerStanding format to satisfy signature
        const standingInput = matchPlayers.map((p) => ({
          player_id: p.id!,
          player_name: p.name,
          total_points: 0,
          matches_played: 0,
          wins: 0,
          tiebreak_values: {},
          active: true,
          dropout_round: null,
          starts_count: 0,
        }));

        const byePlayer = this.selectByePlayer(standingInput, playersWithBye, byeSelection);

        // Create match with bye (player gets automatic win)
        const matchId = await DatabaseService.createMatch({
          round_id: roundId,
          match_number: matchNumber,
          status: 'completed',
        });

        const scoringSystem = byePlayerConfig?.scoring_system || { 1: 1, 2: 0 };

        await DatabaseService.createMatchResult({
          match_id: matchId,
          player_id: byePlayer.player_id || matchPlayers[0].id!,
          position: 1,
          points: 0,
          tournament_points: scoringSystem[1] || 1,
        });

        await DatabaseService.updateMatch(matchId, {
          status: 'completed',
          completed_at: new Date().toISOString(),
        });
      } else {
        // Randomly select start player for the first round
        const startPlayerIndex = Math.floor(Math.random() * matchPlayers.length);
        const startPlayerId = matchPlayers[startPlayerIndex].id!;

        const matchId = await DatabaseService.createMatch({
          round_id: roundId,
          match_number: matchNumber,
          status: 'pending',
          first_player_id: startPlayerId,
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

  static async previewFirstRound(tournamentId: number): Promise<{
    matches: Array<{
      player1: Player & { player_name: string; player_id: number };
      player2?: Player & { player_name: string; player_id: number };
      startPlayerId?: number;
      reason?: string;
    }>;
    warnings: string[];
    startStats: Record<number, { totalStarts: number; lastStartRound: number }>;
  }> {
    const players = await DatabaseService.getTournamentPlayers(tournamentId);

    if (players.length < 2) {
      throw new Error('Se necesitan al menos 2 jugadores para generar una ronda');
    }

    const shuffled = [...players].sort(() => Math.random() - 0.5);
    const tournament = (await DatabaseService.getTournamentById(tournamentId)) as Tournament;
    const playersPerMatch = tournament.players_per_match;

    const matches: Array<{
      player1: Player & { player_name: string; player_id: number };
      player2?: Player & { player_name: string; player_id: number };
      startPlayerId?: number;
      reason?: string;
    }> = [];
    const startStats: Record<number, { totalStarts: number; lastStartRound: number }> = {};

    // Initialize stats
    players.forEach((p) => {
      startStats[p.id!] = { totalStarts: 0, lastStartRound: 0 };
    });

    for (let i = 0; i < shuffled.length; i += playersPerMatch) {
      const matchPlayers = shuffled.slice(i, i + playersPerMatch);

      if (matchPlayers.length === 1 && i === shuffled.length - 1) {
        // Bye match
        matches.push({
          player1: {
            ...matchPlayers[0],
            player_name: matchPlayers[0].name,
            player_id: matchPlayers[0].id!,
          },
          reason: 'random',
        });
      } else {
        // Match with players
        // Random start player
        const startPlayerIndex = Math.floor(Math.random() * matchPlayers.length);
        const startPlayerId = matchPlayers[startPlayerIndex].id!;

        matches.push({
          player1: {
            ...matchPlayers[0],
            player_name: matchPlayers[0].name,
            player_id: matchPlayers[0].id!,
          },
          player2: {
            ...matchPlayers[1],
            player_name: matchPlayers[1].name,
            player_id: matchPlayers[1].id!,
          },
          startPlayerId,
          reason: 'random',
        });
      }
    }

    return { matches, warnings: [], startStats };
  }

  static async createRoundFromPairings(
    tournamentId: number,
    roundNumber: number,
    pairings: Array<{
      player1: { id?: number; player_id?: number };
      player2?: { id?: number; player_id?: number };
      startPlayerId?: number;
    }>
  ): Promise<void> {
    const roundId = await DatabaseService.createRound({
      tournament_id: tournamentId,
      round_number: roundNumber,
      status: 'pending',
    });

    const config = await DatabaseService.getTournamentConfig(tournamentId);
    const scoringSystem = config?.scoring_system || { 1: 1, 2: 0 };

    let matchNumber = 1;
    for (const pairing of pairings) {
      if (!pairing.player2) {
        // Bye match
        const matchId = await DatabaseService.createMatch({
          round_id: roundId,
          match_number: matchNumber,
          status: 'completed',
        });

        await DatabaseService.createMatchResult({
          match_id: matchId,
          player_id: (pairing.player1.player_id || pairing.player1.id) as number,
          position: 1,
          points: 0,
          tournament_points: scoringSystem[1] || 1,
        });

        await DatabaseService.updateMatch(matchId, {
          status: 'completed',
          completed_at: new Date().toISOString(),
        });

        // Add bye record
        // Note: In a real scenario we might need to know the *next* round to mark the bye properly in history,
        // but here we are just creating the current round.
        // Logic in generateNextRound handles historical bye checking.
        // If we really need to record the bye for history:
        await DatabaseService.addPlayerBye(
          tournamentId,
          (pairing.player1.player_id || pairing.player1.id) as number,
          roundNumber
        );
      } else {
        // Regular match
        const matchId = await DatabaseService.createMatch({
          round_id: roundId,
          match_number: matchNumber,
          status: 'pending',
          first_player_id: pairing.startPlayerId,
        });

        await DatabaseService.setMatchPlayers(matchId, [
          (pairing.player1.player_id || pairing.player1.id) as number,
          (pairing.player2.player_id || pairing.player2.id) as number,
        ]);
      }
      matchNumber++;
    }

    await DatabaseService.updateTournament(tournamentId, { status: 'in_progress' });
  }

  static async generateNextRound(tournamentId: number): Promise<{ standings: PlayerStanding[] }> {
    const [rounds, tournamentData, players, config, startStatsData] = await Promise.all([
      DatabaseService.getTournamentRounds(tournamentId),
      DatabaseService.getTournamentById(tournamentId),
      DatabaseService.getTournamentPlayers(tournamentId),
      DatabaseService.getTournamentConfig(tournamentId),
      DatabaseService.getPlayerStartStatistics(tournamentId),
    ]);
    const tournament = tournamentData as Tournament | null;
    if (!tournament) throw new Error('Torneo no encontrado');

    const startStats = startStatsData;

    const lastRound = rounds[rounds.length - 1];
    if (!lastRound || lastRound.status !== 'completed') {
      throw new Error('La ronda anterior debe estar completada');
    }

    const numberOfRounds = tournament.number_of_rounds || calculateNumberOfRounds(players.length);
    if (rounds.length >= numberOfRounds) {
      throw new Error(`Se ha alcanzado el número máximo de rondas (${numberOfRounds})`);
    }

    const roundMatches = await Promise.all(
      rounds.map((r) => DatabaseService.getRoundMatches(r.id!))
    );
    const allMatches = roundMatches.flat();
    const allResults = await Promise.all(
      allMatches.map((m) => DatabaseService.getMatchResults(m.id!))
    );
    const resultsByMatch: Record<number, MatchResult[]> = {};
    allMatches.forEach((m, i) => {
      resultsByMatch[m.id!] = allResults[i] || [];
    });

    const standings = await this.calculateStandings(
      tournamentId,
      config?.tiebreak_criteria || [],
      { players, rounds, roundMatches, resultsByMatch },
      config?.player_display_mode
    );
    const previousOpponents = this.getPreviousOpponentsFromData(
      rounds,
      roundMatches,
      resultsByMatch
    );

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

    // Group players using shared logic
    const { pointGroups, sortedPoints } = this.groupPlayersByPoints(standings);

    // Get bye selection method from config
    const byeSelection = config?.bye_selection || 'worst';

    // Get players who have already received bye
    const byeHistory = await DatabaseService.getPlayerByes(tournamentId);
    const playersWithBye = new Set(byeHistory.map((b) => b.player_id));

    // PROCESS PARTIALLY REFACTORED LOOP
    // Collect all players to be paired (after handling bye)
    let allAvailable = standings.filter((p) => p.active);

    // Handle bye IF total players is odd
    if (allAvailable.length % playersPerMatch !== 0) {
      const byePlayer = this.selectByePlayer(allAvailable, playersWithBye, byeSelection);

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
      paired.add(byePlayer.player_id);
      allAvailable = allAvailable.filter((p) => p.player_id !== byePlayer.player_id);
      matchNumber++;
    }

    const pairingAlgorithm = config?.pairing_algorithm || 'greedy';
    let backtrackingPairings: PlayerStanding[][] | null = null;

    if (pairingAlgorithm === 'backtracking' && playersPerMatch === 2) {
      // Sort allAvailable by points (descending) before backtracking
      const sortedAvailable = [...allAvailable].sort((a, b) => b.total_points - a.total_points);
      backtrackingPairings = this.findPairingsWithBacktracking(
        sortedAvailable,
        previousOpponents,
        playersPerMatch
      );
    }

    if (backtrackingPairings) {
      for (const matchPlayers of backtrackingPairings) {
        const { startPlayerId } = await this.determineStartPlayer(matchPlayers, startStats);

        const matchId = await DatabaseService.createMatch({
          round_id: roundId,
          match_number: matchNumber,
          status: 'pending',
          first_player_id: startPlayerId,
        });

        const playerIds = matchPlayers.map((p) => p.player_id);
        await DatabaseService.setMatchPlayers(matchId, playerIds);
        matchNumber++;
      }
    } else {
      // Fallback to Greedy Algorithm (original logic)
      while (true) {
        const remaining: PlayerStanding[] = [];
        for (const points of sortedPoints) {
          const group = pointGroups[points];
          const unpaired = group.filter((p) => !paired.has(p.player_id));
          remaining.push(...unpaired);
        }

        if (remaining.length === 0) break;

        const matchPlayers = remaining.slice(0, playersPerMatch);

        // Check for rematches if needed (only for 2-player matches)
        const avoidRematches = config?.avoid_rematches ?? true;
        if (avoidRematches && matchPlayers.length === 2) {
          const player1Opponents = previousOpponents[matchPlayers[0].player_id] || [];
          if (player1Opponents.includes(matchPlayers[1].player_id)) {
            const remainingUnpaired = remaining.filter(
              (p) =>
                p.player_id !== matchPlayers[0].player_id &&
                p.player_id !== matchPlayers[1].player_id &&
                !paired.has(p.player_id)
            );

            for (const altPlayer of remainingUnpaired) {
              const altOpponents = previousOpponents[matchPlayers[0].player_id] || [];
              if (!altOpponents.includes(altPlayer.player_id)) {
                matchPlayers[1] = altPlayer;
                break;
              }
            }
          }
        }

        const { startPlayerId } = await this.determineStartPlayer(matchPlayers, startStats);

        const matchId = await DatabaseService.createMatch({
          round_id: roundId,
          match_number: matchNumber,
          status: 'pending',
          first_player_id: startPlayerId,
        });

        const playerIds = matchPlayers.map((p) => p.player_id);
        await DatabaseService.setMatchPlayers(matchId, playerIds);

        matchPlayers.forEach((p) => paired.add(p.player_id));
        matchNumber++;
      }
    }

    return { standings };
  }

  static async previewNextRound(tournamentId: number): Promise<{
    matches: Array<{
      player1: PlayerStanding;
      player2?: PlayerStanding;
      startPlayerId?: number;
      reason?: string;
    }>;
    warnings: string[];
    startStats: Record<number, { totalStarts: number; lastStartRound: number }>;
  }> {
    const [rounds, tournamentData, players, config, startStatsData] = await Promise.all([
      DatabaseService.getTournamentRounds(tournamentId),
      DatabaseService.getTournamentById(tournamentId),
      DatabaseService.getTournamentPlayers(tournamentId),
      DatabaseService.getTournamentConfig(tournamentId),
      DatabaseService.getPlayerStartStatistics(tournamentId),
    ]);
    const tournament = tournamentData as Tournament | null;
    if (!tournament) throw new Error('Torneo no encontrado');
    const startStats = startStatsData;

    const roundMatches = await Promise.all(
      rounds.map((r) => DatabaseService.getRoundMatches(r.id!))
    );
    const allMatches = roundMatches.flat();
    const allResults = await Promise.all(
      allMatches.map((m) => DatabaseService.getMatchResults(m.id!))
    );
    const resultsByMatch: Record<number, MatchResult[]> = {};
    allMatches.forEach((m, i) => {
      resultsByMatch[m.id!] = allResults[i] || [];
    });

    const standings = await this.calculateStandings(
      tournamentId,
      config?.tiebreak_criteria || [],
      { players, rounds, roundMatches, resultsByMatch },
      config?.player_display_mode
    );
    const previousOpponents = this.getPreviousOpponentsFromData(
      rounds,
      roundMatches,
      resultsByMatch
    );

    const playersPerMatch = tournament.players_per_match;
    const paired = new Set<number>();
    const proposedMatches: Array<{
      player1: PlayerStanding;
      player2?: PlayerStanding;
      startPlayerId?: number;
      reason?: string;
    }> = [];
    const warnings: string[] = [];

    // Group players using shared logic
    const { pointGroups, sortedPoints } = this.groupPlayersByPoints(standings);

    const byeSelection = config?.bye_selection || 'worst';
    const byeHistory = await DatabaseService.getPlayerByes(tournamentId);
    const playersWithBye = new Set(byeHistory.map((b) => b.player_id));

    // Collect all players to be paired (after handling bye)
    let allAvailable = standings.filter((p) => p.active);

    if (allAvailable.length % playersPerMatch !== 0) {
      const byePlayer = this.selectByePlayer(allAvailable, playersWithBye, byeSelection);

      proposedMatches.push({
        player1: byePlayer,
      });

      playersWithBye.add(byePlayer.player_id);
      paired.add(byePlayer.player_id);
      allAvailable = allAvailable.filter((p) => p.player_id !== byePlayer.player_id);
    }

    const pairingAlgorithm = config?.pairing_algorithm || 'greedy';
    let backtrackingPairings: PlayerStanding[][] | null = null;

    if (pairingAlgorithm === 'backtracking' && playersPerMatch === 2) {
      const sortedAvailable = [...allAvailable].sort((a, b) => b.total_points - a.total_points);
      backtrackingPairings = this.findPairingsWithBacktracking(
        sortedAvailable,
        previousOpponents,
        playersPerMatch
      );
    }

    if (backtrackingPairings) {
      for (const matchPlayers of backtrackingPairings) {
        const { startPlayerId, reason } = await this.determineStartPlayer(matchPlayers, startStats);
        proposedMatches.push({
          player1: matchPlayers[0],
          player2: matchPlayers[1],
          startPlayerId,
          reason,
        });
      }
    } else {
      // Fallback
      while (true) {
        const remaining: PlayerStanding[] = [];
        for (const points of sortedPoints) {
          const group = pointGroups[points];
          const unpaired = group.filter((p) => !paired.has(p.player_id));
          remaining.push(...unpaired);
        }

        if (remaining.length === 0) break;

        const matchPlayers = remaining.slice(0, playersPerMatch);

        const avoidRematches = config?.avoid_rematches ?? true;

        if (avoidRematches && matchPlayers.length === 2) {
          const player1Opponents = previousOpponents[matchPlayers[0].player_id] || [];
          if (player1Opponents.includes(matchPlayers[1].player_id)) {
            let hasRematch = true;
            const remainingUnpaired = remaining.filter(
              (p) =>
                p.player_id !== matchPlayers[0].player_id &&
                p.player_id !== matchPlayers[1].player_id &&
                !paired.has(p.player_id)
            );

            for (const candidate of remainingUnpaired) {
              const candidateOpponents = previousOpponents[candidate.player_id] || [];
              if (
                !player1Opponents.includes(candidate.player_id) &&
                !candidateOpponents.includes(matchPlayers[0].player_id)
              ) {
                matchPlayers[1] = candidate;
                hasRematch = false;
                break;
              }
            }
            if (hasRematch) {
              warnings.push(
                i18n.t('tournaments.preview.rematch_inevitable', {
                  p1: matchPlayers[0].player_name,
                  p2: matchPlayers[1].player_name,
                  defaultValue: `Revancha inevitable: ${matchPlayers[0].player_name} vs ${matchPlayers[1].player_name}`,
                })
              );
            }
          }
        }

        const { startPlayerId, reason } = await this.determineStartPlayer(matchPlayers, startStats);

        proposedMatches.push({
          player1: matchPlayers[0],
          player2: matchPlayers[1],
          startPlayerId,
          reason,
        });

        matchPlayers.forEach((p) => paired.add(p.player_id));
      }
    }

    return { matches: proposedMatches, warnings, startStats };
  }

  private static findPairingsWithBacktracking(
    remaining: PlayerStanding[],
    previousOpponents: Record<number, number[]>,
    playersPerMatch: number
  ): PlayerStanding[][] | null {
    if (remaining.length === 0) return [];
    if (remaining.length < playersPerMatch) return null;

    const first = remaining[0];
    const rest = remaining.slice(1);

    if (playersPerMatch === 2) {
      for (let i = 0; i < rest.length; i++) {
        const second = rest[i];
        const opponents = previousOpponents[first.player_id] || [];

        if (!opponents.includes(second.player_id)) {
          const subRemaining = [...rest.slice(0, i), ...rest.slice(i + 1)];
          const result = this.findPairingsWithBacktracking(
            subRemaining,
            previousOpponents,
            playersPerMatch
          );
          if (result) {
            return [[first, second], ...result];
          }
        }
      }
    }

    return null;
  }

  /**
   * Selects the most appropriate player to receive a bye, enforcing the primary constraint
   * that a player should NOT receive more than one bye in a tournament.
   * If all candidates already had a bye, it falls back to the default rules.
   */
  private static selectByePlayer(
    remaining: PlayerStanding[],
    playersWithBye: Set<number>,
    byeSelection: string
  ): PlayerStanding {
    if (remaining.length === 0) throw new Error('No players available for bye');
    if (remaining.length === 1) return remaining[0];

    const candidatesWithoutBye = remaining.filter((p) => !playersWithBye.has(p.player_id));

    // Fallback: If ALL players already had a bye, we must pick from the pool of all remaining players
    const pool = candidatesWithoutBye.length > 0 ? candidatesWithoutBye : remaining;

    if (byeSelection === 'random') {
      return pool[Math.floor(Math.random() * pool.length)];
    } else {
      // Both 'worst' and 'round_robin' modes default to the worst player in the current pool.
      // Since `remaining` is sorted by points descending, the worst player is at the end.
      return pool[pool.length - 1];
    }
  }

  private static groupPlayersByPoints(standings: PlayerStanding[]): {
    pointGroups: { [points: number]: PlayerStanding[] };
    sortedPoints: number[];
  } {
    // Group players by similar points
    // For late entries (0 points), ensure they are included but not strictly forced into a bye if other options exist with 0 points
    const activeStandings = standings.filter((s) => s.active);

    const pointGroups: { [points: number]: PlayerStanding[] } = {};
    activeStandings.forEach((standing) => {
      const points = Math.floor(standing.total_points);
      if (!pointGroups[points]) {
        pointGroups[points] = [];
      }
      pointGroups[points].push(standing);
    });

    // Pair within groups
    // Optimization: If the last group (likely 0 points) has an odd number of players,
    // and the total number of remaining players is even (meaning a bye is NOT strictly necessary for the tournament),
    // we should try to merge the last two groups to avoid forcing a bye on the 0-point player.
    // This happens when late entries (0 points) are odd (e.g. 1 new player) but total players are even (odd previously + 1 new = even).

    const sortedPoints = Object.keys(pointGroups)
      .map(Number)
      .sort((a, b) => b - a);

    // Check if we need to merge the last group to avoid unnecessary bye
    const totalActivePlayers = activeStandings.length;
    if (totalActivePlayers % 2 === 0 && sortedPoints.length >= 2) {
      const lastPoints = sortedPoints[sortedPoints.length - 1];
      const lastGroup = pointGroups[lastPoints];
      if (lastGroup.length % 2 !== 0) {
        // Merge last group into the second to last group
        const secondLastPoints = sortedPoints[sortedPoints.length - 2];
        pointGroups[secondLastPoints] = [...pointGroups[secondLastPoints], ...lastGroup];
        delete pointGroups[lastPoints];
        sortedPoints.pop(); // Remove last points key
      }
    }

    return { pointGroups, sortedPoints };
  }

  private static async determineStartPlayer(
    players: { player_id: number; player_name?: string }[],
    stats: { [playerId: number]: { totalStarts: number; lastStartRound: number } }
  ): Promise<{ startPlayerId: number; reason: 'balance' | 'recency' | 'azar' }> {
    if (players.length === 0) return { startPlayerId: -1, reason: 'azar' };
    if (players.length === 1) return { startPlayerId: players[0].player_id, reason: 'balance' };

    // 1. Balance: Sort by total starts (ascending)
    const sortedByStarts = [...players].sort((a, b) => {
      const statsA = stats[a.player_id] || { totalStarts: 0, lastStartRound: 0 };
      const statsB = stats[b.player_id] || { totalStarts: 0, lastStartRound: 0 };
      return statsA.totalStarts - statsB.totalStarts;
    });

    const minStarts = (stats[sortedByStarts[0].player_id] || { totalStarts: 0 }).totalStarts;
    const candidatesByStarts = sortedByStarts.filter((p) => {
      const pStats = stats[p.player_id] || { totalStarts: 0 };
      return pStats.totalStarts === minStarts;
    });

    if (candidatesByStarts.length === 1) {
      return { startPlayerId: candidatesByStarts[0].player_id, reason: 'balance' };
    }

    // 2. Recency: Sort by last start round (ascending -> smaller round number means started longer ago)
    // 0 means never started
    const sortedByRecency = [...candidatesByStarts].sort((a, b) => {
      const statsA = stats[a.player_id] || { totalStarts: 0, lastStartRound: 0 };
      const statsB = stats[b.player_id] || { totalStarts: 0, lastStartRound: 0 };
      return statsA.lastStartRound - statsB.lastStartRound;
    });

    const minLastRound = (
      stats[sortedByRecency[0].player_id] || { totalStarts: 0, lastStartRound: 0 }
    ).lastStartRound;
    const candidatesByRecency = sortedByRecency.filter((p) => {
      const pStats = stats[p.player_id] || { totalStarts: 0, lastStartRound: 0 };
      return pStats.lastStartRound === minLastRound;
    });

    if (candidatesByRecency.length === 1) {
      return { startPlayerId: candidatesByRecency[0].player_id, reason: 'recency' };
    }

    // 3. Random
    const randomIndex = Math.floor(Math.random() * candidatesByRecency.length);
    return { startPlayerId: candidatesByRecency[randomIndex].player_id, reason: 'azar' };
  }

  static async calculateStandings(
    tournamentId: number,
    tiebreakCriteria: TiebreakCriterion[],
    preFetchedData?: {
      players?: Player[];
      rounds?: Round[];
      roundMatches?: Match[][];
      resultsByMatch?: Record<number, MatchResult[]>;
    },
    playerDisplayMode: PlayerDisplayMode = 'per_player'
  ): Promise<PlayerStanding[]> {
    // Use config order for tiebreak criteria
    const criteria = [...(tiebreakCriteria || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const players =
      preFetchedData?.players || (await DatabaseService.getTournamentPlayers(tournamentId));
    const rounds =
      preFetchedData?.rounds || (await DatabaseService.getTournamentRounds(tournamentId));

    let roundMatches: Match[] = [];
    let resultsByMatch: Record<number, MatchResult[]> = {};

    if (preFetchedData && preFetchedData.roundMatches && preFetchedData.resultsByMatch) {
      // Flatten matches if they are grouped by round
      roundMatches = preFetchedData.roundMatches.flat();
      resultsByMatch = preFetchedData.resultsByMatch;
    } else {
      const allRoundMatches = await Promise.all(
        rounds.map((r) => DatabaseService.getRoundMatches(r.id!))
      );
      roundMatches = allRoundMatches.flat();
      const allResults = await Promise.all(
        roundMatches.map((m) => DatabaseService.getMatchResults(m.id!))
      );
      resultsByMatch = {};
      roundMatches.forEach((m, i) => {
        resultsByMatch[m.id!] = (allResults[i] || []) as MatchResult[];
      });
    }

    // Initialize standings
    const standings: Record<number, PlayerStanding> = {};
    players.forEach((player: Player) => {
      const pid = player.id!;
      standings[pid] = {
        player_id: pid,
        player_name: getPlayerDisplayName(player, playerDisplayMode),
        total_points: 0,
        matches_played: 0,
        wins: 0,
        tiebreak_values: {},
        active: (player as unknown as { active: boolean }).active ?? true,
        dropout_round:
          (player as unknown as { dropout_round: number | null }).dropout_round ?? null,
        starts_count: 0,
      };
    });

    // Count first player starts
    roundMatches.forEach((match) => {
      if (match.first_player_id && standings[match.first_player_id]) {
        standings[match.first_player_id].starts_count =
          (standings[match.first_player_id].starts_count || 0) + 1;
      }
    });

    // Process all match results
    Object.values(resultsByMatch)
      .flat()
      .forEach((result: MatchResult) => {
        const pid = result.player_id;
        if (standings[pid]) {
          standings[pid].matches_played++;
          standings[pid].total_points += result.tournament_points;
          if (result.position === 1) {
            standings[pid].wins++;
          }
        }
      });

    // Calculate tiebreakers
    for (const criterion of criteria) {
      if (!criterion.enabled) continue;

      const calculatedInfo = await TiebreakService.calculate(
        criterion.id,
        Object.values(standings),
        roundMatches,
        resultsByMatch,
        players
      );

      Object.keys(calculatedInfo).forEach((playerId) => {
        const pid = Number(playerId);
        if (standings[pid]) {
          standings[pid].tiebreak_values[criterion.id] = calculatedInfo[pid];
        }
      });
    }

    // Sort standings
    // Priority: Active > Points > Tiebreakers
    return Object.values(standings).sort((a, b) => {
      // 0. Active Status (Active first)
      if (a.active !== b.active) {
        return a.active ? -1 : 1;
      }

      // 1. Total Points
      if (b.total_points !== a.total_points) {
        return b.total_points - a.total_points;
      }

      // 2. Tiebreakers
      // 2. Tiebreakers
      for (const criterion of criteria) {
        if (!criterion.enabled) continue;

        if (criterion.id === 'head_to_head') {
          // Check matches between a and b
          let winsA = 0;
          let winsB = 0;
          Object.values(resultsByMatch).forEach((results) => {
            const resA = results.find((r: MatchResult) => r.player_id === a.player_id);
            const resB = results.find((r: MatchResult) => r.player_id === b.player_id);
            if (resA && resB) {
              if (resA.position < resB.position) winsA++;
              else if (resB.position < resA.position) winsB++;
            }
          });

          if (winsA !== winsB) {
            return winsB - winsA;
          }
        } else {
          const valA = a.tiebreak_values[criterion.id] || 0;
          const valB = b.tiebreak_values[criterion.id] || 0;
          if (valA !== valB) {
            return valB - valA;
          }
        }
      }

      // 3. Random fallback (using ID)
      return a.player_id - b.player_id;
    });
  }

  private static getPreviousOpponentsFromData(
    rounds: Round[],
    roundMatches: Match[][],
    resultsByMatch: Record<number, MatchResult[]>
  ): { [playerId: number]: number[] } {
    const opponents: { [playerId: number]: number[] } = {};
    for (let r = 0; r < rounds.length; r++) {
      const matches = roundMatches[r] || [];
      for (const match of matches) {
        const results = resultsByMatch[match.id!] || [];
        const playerIds = results.map((res: MatchResult) => res.player_id);
        for (const playerId of playerIds) {
          if (!opponents[playerId]) opponents[playerId] = [];
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
