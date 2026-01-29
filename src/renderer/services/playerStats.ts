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
  filterOptions?: {
    tournaments: Tournament[];
    circuits: Array<{ id: number; name: string }>;
  };
}

/** Single load: raw results per tournament. Filters applied client-side. */
export interface PlayerStatsRaw {
  player: Player;
  allTournamentResults: Array<{
    tournament: Tournament;
    position: number;
    points: number;
    matchesPlayed: number;
  }>;
  filterOptions: {
    tournaments: Tournament[];
    circuits: Array<{ id: number; name: string }>;
  };
}

export interface PlayerStatsFilters {
  tournamentIds?: number[];
  circuitIds?: (number | string)[];
  placeIds?: number[];
}

/** Compute full stats from raw results, optionally filtered (client-side). */
export function computeStatsFromResults(
  player: Player,
  raw: PlayerStatsRaw,
  filters?: PlayerStatsFilters
): PlayerStatistics {
  let results = raw.allTournamentResults;

  if (filters?.tournamentIds?.length) {
    results = results.filter((r) => r.tournament.id != null && filters!.tournamentIds!.includes(r.tournament.id));
  }
  if (filters?.circuitIds?.length) {
    const circuitIds = filters.circuitIds!;
    results = results.filter((r) => {
      if (r.tournament.type === 'qualifier' && circuitIds.includes('qualifier')) return true;
      if (r.tournament.circuit_id != null && circuitIds.includes(r.tournament.circuit_id)) return true;
      return false;
    });
  }
  if (filters?.placeIds?.length) {
    results = results.filter(
      (r) => r.tournament.place_id != null && filters!.placeIds!.includes(r.tournament.place_id)
    );
  }

  const totalTournaments = results.length;
  const totalWins = results.filter((r) => r.position === 1).length;
  const totalMatches = results.reduce((s, r) => s + r.matchesPlayed, 0);
  const totalPosition = results.reduce((s, r) => s + r.position, 0);
  const positions = results.map((r) => r.position);
  const bestPosition = positions.length ? Math.min(...positions) : 0;
  const worstPosition = positions.length ? Math.max(...positions) : 0;

  const qualifierResults = results.filter((r) => r.tournament.type === 'qualifier');
  const circuitResults = results.filter((r) => r.tournament.type !== 'qualifier');
  const qualifierPosition = qualifierResults.reduce((s, r) => s + r.position, 0);
  const circuitPosition = circuitResults.reduce((s, r) => s + r.position, 0);

  return {
    player,
    totalTournaments,
    totalWins,
    totalMatches,
    averagePosition: totalTournaments > 0 ? totalPosition / totalTournaments : 0,
    bestPosition,
    worstPosition,
    qualifierStats: {
      tournaments: qualifierResults.length,
      wins: qualifierResults.filter((r) => r.position === 1).length,
      averagePosition: qualifierResults.length > 0 ? qualifierPosition / qualifierResults.length : 0,
    },
    circuitStats: {
      tournaments: circuitResults.length,
      wins: circuitResults.filter((r) => r.position === 1).length,
      averagePosition: circuitResults.length > 0 ? circuitPosition / circuitResults.length : 0,
    },
    recentTournaments: [...results].reverse().slice(0, 10).map((r) => ({ tournament: r.tournament, position: r.position, points: r.points })),
    filterOptions: raw.filterOptions,
  };
}

export class PlayerStatsService {
  /** Load once: all tournaments the player participated in, with position/points/matches per tournament. No filters; filter client-side. */
  static async getPlayerStatisticsRaw(playerId: number): Promise<PlayerStatsRaw | null> {
    const player = await DatabaseService.getPlayerById(playerId);
    if (!player) return null;

    const tournamentIds = await DatabaseService.getTournamentIdsForPlayer(playerId);
    if (tournamentIds.length === 0) {
      return {
        player,
        allTournamentResults: [],
        filterOptions: { tournaments: [], circuits: [] },
      };
    }

    const allTournaments = await DatabaseService.getAllTournaments();
    const playerTournaments = allTournaments.filter((t) => t.id != null && tournamentIds.includes(t.id));
    const completed = playerTournaments.filter((t) => t.status === 'completed');

    const allTournamentResults: Array<{ tournament: Tournament; position: number; points: number; matchesPlayed: number }> = [];
    const { SwissPairingService } = await import('./swiss');

    for (const tournament of completed) {
      const tid = tournament.id!;
      const config = await DatabaseService.getTournamentConfig(tid);
      const tournamentStandings = await SwissPairingService.calculateStandings(
        tid,
        config?.tiebreak_criteria || [],
        undefined,
        config?.player_display_mode
      );
      const playerStanding = tournamentStandings.find((s) => s.player_id === playerId);
      if (!playerStanding) continue;

      const position = tournamentStandings.findIndex((s) => s.player_id === playerId) + 1;
      const points = playerStanding.total_points;

      let matchesPlayed = 0;
      const rounds = await DatabaseService.getTournamentRounds(tid);
      for (const round of rounds) {
        const matches = await DatabaseService.getRoundMatches(round.id!);
        for (const match of matches) {
          const results = await DatabaseService.getMatchResults(match.id!, tid);
          if (results.some((r) => r.player_id === playerId)) matchesPlayed++;
        }
      }

      allTournamentResults.push({ tournament, position, points, matchesPlayed });
    }

    const circuitIds = [...new Set(completed.filter((t) => t.circuit_id != null).map((t) => t.circuit_id!))];
    const circuits = await DatabaseService.getAllCircuits();
    const circuitNames = circuitIds
      .map((cid) => {
        const c = circuits.find((x) => x.id === cid);
        return c ? { id: c.id!, name: c.name } : null;
      })
      .filter(Boolean) as Array<{ id: number; name: string }>;

    return {
      player,
      allTournamentResults,
      filterOptions: {
        tournaments: completed,
        circuits: circuitNames,
      },
    };
  }

  /** Single load then compute; for backward compatibility. Prefer getPlayerStatisticsRaw + computeStatsFromResults in component. */
  static async getPlayerStatistics(playerId: number, filters?: PlayerStatsFilters): Promise<PlayerStatistics | null> {
    const raw = await this.getPlayerStatisticsRaw(playerId);
    if (!raw) return null;
    return computeStatsFromResults(raw.player, raw, filters);
  }
}
