import type { KnockoutSize } from '../types/knockout';
import { resolveEffectiveKnockoutSize } from '../types/knockout';
import type { Match, MatchResult, PlayerStanding, Round } from '../types/tournament';
import { DatabaseService } from './database';
import { computeSeriesState, isKnockoutMatchComplete, isKnockoutPhaseActive } from './knockout';

type PlacementTier =
  | 'active'
  | 'champion'
  | 'runner_up'
  | 'third'
  | 'fourth'
  | 'semifinal'
  | 'quarterfinal'
  | 'round_of_16'
  | 'outside_ko';

const TIER_ORDER: PlacementTier[] = [
  'champion',
  'runner_up',
  'third',
  'fourth',
  'active',
  'semifinal',
  'quarterfinal',
  'round_of_16',
  'outside_ko',
];

function tierIndex(tier: PlacementTier): number {
  return TIER_ORDER.indexOf(tier);
}

function swissRankMap(snapshot: PlayerStanding[]): Map<number, number> {
  const map = new Map<number, number>();
  snapshot.forEach((s, i) => map.set(s.player_id, i));
  return map;
}

function sortBySwissRank(ids: number[], ranks: Map<number, number>): number[] {
  return [...ids].sort(
    (a, b) => (ranks.get(a) ?? Number.MAX_SAFE_INTEGER) - (ranks.get(b) ?? Number.MAX_SAFE_INTEGER)
  );
}

function getMatchWinnerId(
  match: Match,
  results: MatchResult[],
  playerIds: number[]
): number | null {
  if (playerIds.length !== 2) return match.series_winner_id ?? null;
  if (!isKnockoutMatchComplete(match, results, playerIds)) return null;
  if (match.series_winner_id) return match.series_winner_id;
  return computeSeriesState(match, results, playerIds as [number, number]).winnerId;
}

export interface KnockoutStandingsInput {
  snapshot: PlayerStanding[];
  knockoutSize: number;
  playBronzeMatch: boolean;
  koRounds: Round[];
  matchesByRound: Map<number, Match[]>;
  resultsByMatch: Record<number, MatchResult[]>;
  playersByMatch: Record<number, number[]>;
}

/** Clasificación final (o provisional) mezclando cuadro KO y suizo congelado. */
export function computeKnockoutFinalStandings(input: KnockoutStandingsInput): PlayerStanding[] {
  const {
    snapshot,
    knockoutSize,
    playBronzeMatch,
    koRounds,
    matchesByRound,
    resultsByMatch,
    playersByMatch,
  } = input;

  if (snapshot.length === 0) return [];

  const ranks = swissRankMap(snapshot);
  const standingById = new Map(snapshot.map((s) => [s.player_id, s]));
  const topNIds = snapshot.slice(0, knockoutSize).map((s) => s.player_id);
  const topNSet = new Set(topNIds);

  const tierByPlayer = new Map<number, PlacementTier>();
  for (const id of topNIds) tierByPlayer.set(id, 'active');
  for (const s of snapshot) {
    if (!topNSet.has(s.player_id)) tierByPlayer.set(s.player_id, 'outside_ko');
  }

  const assignEliminationTier = (playerId: number, tier: PlacementTier) => {
    const current = tierByPlayer.get(playerId);
    if (current == null) return;
    if (tierIndex(tier) > tierIndex(current)) {
      tierByPlayer.set(playerId, tier);
    }
  };

  const appearedInKo = new Set<number>();

  for (const round of koRounds) {
    if (!round.id) continue;
    const matches = matchesByRound.get(round.id) ?? [];
    for (const match of matches) {
      const playerIds = playersByMatch[match.id!] ?? [];
      for (const pid of playerIds) appearedInKo.add(pid);
      if (playerIds.length !== 2) continue;
      const results = resultsByMatch[match.id!] ?? [];
      const winnerId = getMatchWinnerId(match, results, playerIds);
      if (winnerId == null) continue;
      const loserId = playerIds.find((id) => id !== winnerId);
      if (loserId == null) continue;

      if (match.knockout_match_stage === 'third_place') {
        tierByPlayer.set(winnerId, 'third');
        tierByPlayer.set(loserId, 'fourth');
        continue;
      }

      if (round.knockout_stage === 'final' || match.knockout_match_stage === 'final') {
        tierByPlayer.set(winnerId, 'champion');
        tierByPlayer.set(loserId, 'runner_up');
        continue;
      }

      const stage = round.knockout_stage;
      if (stage === 'semifinal') assignEliminationTier(loserId, 'semifinal');
      else if (stage === 'quarterfinal') assignEliminationTier(loserId, 'quarterfinal');
      else if (stage === 'round_of_16') assignEliminationTier(loserId, 'round_of_16');
    }
  }

  for (const id of topNIds) {
    if (tierByPlayer.get(id) === 'active' && !appearedInKo.has(id)) {
      tierByPlayer.set(id, 'outside_ko');
    }
  }

  const grouped = new Map<PlacementTier, number[]>();
  for (const tier of TIER_ORDER) grouped.set(tier, []);

  for (const s of snapshot) {
    const tier = tierByPlayer.get(s.player_id) ?? 'outside_ko';
    grouped.get(tier)!.push(s.player_id);
  }

  for (const [tier, ids] of grouped) {
    grouped.set(tier, sortBySwissRank(ids, ranks));
  }

  const orderedIds: number[] = [];
  for (const tier of TIER_ORDER) {
    orderedIds.push(...(grouped.get(tier) ?? []));
  }

  void playBronzeMatch;

  return orderedIds.map((playerId, index) => {
    const base = standingById.get(playerId);
    if (!base) {
      return {
        player_id: playerId,
        player_name: `#${playerId}`,
        total_points: 0,
        wins: 0,
        tiebreak_values: {},
        matches_played: 0,
        active: true,
        dropout_round: null,
        rank: index + 1,
      };
    }
    return { ...base, rank: index + 1 };
  });
}

/** Carga datos del torneo y devuelve clasificación KO (o suizo si KO no iniciado). */
export async function computeKnockoutFinalStandingsForTournament(
  tournamentId: number
): Promise<PlayerStanding[]> {
  const [tournament, config, rounds] = await Promise.all([
    DatabaseService.getTournamentById(tournamentId),
    DatabaseService.getTournamentConfig(tournamentId),
    DatabaseService.getTournamentRounds(tournamentId),
  ]);
  if (!tournament || !config) return [];

  const snapshotRaw = config.swiss_standings_snapshot;
  let snapshot: PlayerStanding[] = [];
  if (snapshotRaw) {
    try {
      snapshot = JSON.parse(snapshotRaw) as PlayerStanding[];
    } catch {
      snapshot = [];
    }
  }

  if (
    tournament.competition_format !== 'swiss_knockout' ||
    !isKnockoutPhaseActive(tournament, rounds) ||
    snapshot.length === 0
  ) {
    const { SwissPairingService } = await import('./swiss');
    const { getEffectiveTiebreakCriteria } = await import('../constants');
    return SwissPairingService.calculateStandings(
      tournamentId,
      getEffectiveTiebreakCriteria(config.tiebreak_criteria),
      undefined,
      config.player_display_mode
    );
  }

  const koRounds = rounds.filter((r) => r.phase === 'knockout');
  const roundMatches = await Promise.all(
    koRounds.map((r) => DatabaseService.getRoundMatches(r.id!))
  );
  const matchesByRound = new Map<number, Match[]>();
  koRounds.forEach((r, i) => {
    if (r.id) matchesByRound.set(r.id, roundMatches[i] ?? []);
  });

  const allMatches = roundMatches.flat();
  const allResults = await Promise.all(
    allMatches.map((m) => DatabaseService.getMatchResults(m.id!))
  );
  const resultsByMatch: Record<number, MatchResult[]> = {};
  const playersByMatch: Record<number, number[]> = {};
  allMatches.forEach((m, i) => {
    resultsByMatch[m.id!] = allResults[i] ?? [];
  });
  await Promise.all(
    allMatches.map(async (m) => {
      playersByMatch[m.id!] = (await DatabaseService.getMatchPlayers(m.id!)).map((p) => p.id!);
    })
  );

  const configuredSize = (config.knockout_size ?? 8) as KnockoutSize;
  const seeds = await DatabaseService.getKnockoutSeeds(tournamentId);
  const activeInSnapshot = snapshot.filter((s) => s.active).length;
  const knockoutSize =
    seeds.length > 0
      ? seeds.length
      : (resolveEffectiveKnockoutSize(configuredSize, activeInSnapshot) ?? configuredSize);

  return computeKnockoutFinalStandings({
    snapshot,
    knockoutSize,
    playBronzeMatch: Boolean(config.knockout_play_bronze_match),
    koRounds,
    matchesByRound,
    resultsByMatch,
    playersByMatch,
  });
}
