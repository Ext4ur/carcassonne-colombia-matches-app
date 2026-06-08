import type { Match, MatchResult, PlayerStanding, Round } from '../types/tournament';
import type {
  KnockoutSeries,
  KnockoutSeriesStarterMode,
  KnockoutSize,
  KnockoutStage,
} from '../types/knockout';
import { normalizeKnockoutSeriesStarterMode } from '../types/knockout';
import {
  isKnockoutSize,
  knockoutStageForPlayerCount,
  resolveEffectiveKnockoutSize,
  seriesTargetWins,
  standardBracketFirstRoundPairs,
  topNStandingsForKnockout,
} from '../types/knockout';

export interface KnockoutPairing {
  player1Id: number;
  player2Id: number;
  bracketSlot: number;
  startPlayerId?: number;
}

export interface SeriesGameResult {
  gameNumber: number;
  player1Points: number;
  player2Points: number;
  starterId: number;
  winnerId: number;
}

export interface SeriesState {
  targetWins: number;
  games: SeriesGameResult[];
  winsByPlayer: Record<number, number>;
  isComplete: boolean;
  winnerId: number | null;
  nextGameNumber: number;
}

export function parseSeriesMeta(raw: string | null | undefined): {
  gameStarters: Record<number, number>;
} {
  if (!raw) return { gameStarters: {} };
  try {
    const parsed = JSON.parse(raw) as { gameStarters?: Record<number, number> };
    return { gameStarters: parsed.gameStarters ?? {} };
  } catch {
    return { gameStarters: {} };
  }
}

export function serializeSeriesMeta(meta: { gameStarters: Record<number, number> }): string {
  return JSON.stringify(meta);
}

/** Resuelve quién empezó un juego concreto (series_meta tiene prioridad sobre first_player_id). */
export function resolveGameStarter(match: Match, gameNumber = 1): number | undefined {
  const meta = parseSeriesMeta(
    typeof match.series_meta === 'string' ? match.series_meta : undefined
  );
  const fromMeta = meta.gameStarters[gameNumber];
  if (fromMeta != null) return fromMeta;
  if (gameNumber === 1 && match.first_player_id != null) return match.first_player_id;
  return undefined;
}

export function isSeriesMatch(match: Match): boolean {
  return (match.series_target_wins ?? 1) > 1;
}

/** Resultados de un solo juego dentro de una partida. */
export function resultsForGame(results: MatchResult[], gameNumber: number): MatchResult[] {
  return results.filter((r) => (r.game_number ?? 1) === gameNumber);
}

/** Resultados a mostrar en resumen: juego 1 para partidos simples; último juego con datos en series. */
export function resultsForDisplay(match: Match, results: MatchResult[]): MatchResult[] {
  if (!isSeriesMatch(match)) {
    return resultsForGame(results, 1);
  }
  const byGame = groupResultsByGame(results);
  const gameNumbers = [...byGame.keys()].sort((a, b) => b - a);
  for (const gn of gameNumbers) {
    const gameResults = byGame.get(gn)!;
    if (gameResults.length >= 2) return gameResults;
  }
  return resultsForGame(results, 1);
}

/** Agrupa resultados por game_number para partidos KO. */
export function groupResultsByGame(results: MatchResult[]): Map<number, MatchResult[]> {
  const map = new Map<number, MatchResult[]>();
  for (const r of results) {
    const gn = r.game_number ?? 1;
    const list = map.get(gn) ?? [];
    list.push(r);
    map.set(gn, list);
  }
  return map;
}

export function computeSeriesState(
  match: Match,
  results: MatchResult[],
  playerIds: [number, number]
): SeriesState {
  const targetWins = match.series_target_wins ?? 1;
  const meta = parseSeriesMeta(
    typeof match.series_meta === 'string' ? match.series_meta : undefined
  );
  const winsByPlayer: Record<number, number> = { [playerIds[0]]: 0, [playerIds[1]]: 0 };
  const games: SeriesGameResult[] = [];
  const byGame = groupResultsByGame(results);

  const sortedGameNumbers = [...byGame.keys()].sort((a, b) => a - b);
  for (const gn of sortedGameNumbers) {
    const gameResults = byGame.get(gn)!;
    if (gameResults.length < 2) continue;
    const [p1, p2] = playerIds;
    const r1 = gameResults.find((r) => r.player_id === p1);
    const r2 = gameResults.find((r) => r.player_id === p2);
    if (!r1 || !r2) continue;
    const starterId = meta.gameStarters[gn] ?? match.first_player_id ?? p1;
    let winnerId: number;
    if (r1.position === 1) winnerId = p1;
    else if (r2.position === 1) winnerId = p2;
    else if (r1.points === r2.points) winnerId = starterId === p1 ? p2 : p1;
    else winnerId = r1.points > r2.points ? p1 : p2;

    winsByPlayer[winnerId] = (winsByPlayer[winnerId] ?? 0) + 1;
    games.push({
      gameNumber: gn,
      player1Points: r1.points,
      player2Points: r2.points,
      starterId,
      winnerId,
    });
  }

  const winnerId =
    Object.entries(winsByPlayer).find(([, w]) => w >= targetWins)?.[0] != null
      ? Number(Object.entries(winsByPlayer).find(([, w]) => w >= targetWins)![0])
      : (match.series_winner_id ?? null);

  const isComplete = winnerId != null;
  const nextGameNumber = games.length > 0 ? Math.max(...games.map((g) => g.gameNumber)) + 1 : 1;

  return {
    targetWins,
    games,
    winsByPlayer,
    isComplete,
    winnerId,
    nextGameNumber: isComplete ? nextGameNumber : nextGameNumber,
  };
}

export function isKnockoutMatchComplete(
  match: Match,
  results: MatchResult[],
  playerIds: number[]
): boolean {
  if (match.status === 'completed' && match.series_winner_id) return true;
  if (playerIds.length !== 2) return match.status === 'completed';
  return computeSeriesState(match, results, playerIds as [number, number]).isComplete;
}

export function countSwissRounds(rounds: Round[]): number {
  return rounds.filter((r) => (r.phase ?? 'swiss') === 'swiss').length;
}

export function isKnockoutPhaseActive(
  tournament: { competition_format?: string; knockout_phase_started_at?: string | null },
  rounds: Round[]
): boolean {
  if (tournament.knockout_phase_started_at) return true;
  return rounds.some((r) => r.phase === 'knockout');
}

export function canStartKnockoutPhase(
  tournament: {
    competition_format?: string;
    number_of_rounds?: number;
    knockout_phase_started_at?: string | null;
  },
  rounds: Round[],
  activePlayerCount: number,
  knockoutSize: number
): { ok: boolean; reason?: string; effectiveSize?: KnockoutSize } {
  if (tournament.competition_format !== 'swiss_knockout') {
    return { ok: false, reason: 'not_swiss_knockout' };
  }
  if (tournament.knockout_phase_started_at) {
    return { ok: false, reason: 'already_started' };
  }
  const swissCount = countSwissRounds(rounds);
  const maxSwiss = tournament.number_of_rounds ?? 1;
  if (swissCount < maxSwiss) return { ok: false, reason: 'swiss_incomplete' };
  const swissRounds = rounds.filter((r) => (r.phase ?? 'swiss') === 'swiss');
  if (!swissRounds.every((r) => r.status === 'completed')) {
    return { ok: false, reason: 'swiss_incomplete' };
  }
  if (!isKnockoutSize(knockoutSize)) {
    return { ok: false, reason: 'invalid_size' };
  }
  const effectiveSize = resolveEffectiveKnockoutSize(knockoutSize, activePlayerCount);
  if (effectiveSize == null) {
    return { ok: false, reason: 'not_enough_players' };
  }
  return { ok: true, effectiveSize };
}

export function buildFirstKnockoutPairings(
  standings: PlayerStanding[],
  knockoutSize: KnockoutSize,
  series: KnockoutSeries
): {
  pairings: KnockoutPairing[];
  stage: KnockoutStage;
  seeds: Array<{ player_id: number; seed: number }>;
} {
  void series;
  const top = topNStandingsForKnockout(standings, knockoutSize);
  const seedRows = top.map((s, i) => ({ player_id: s.player_id, seed: i + 1 }));
  const seedByRank = new Map(seedRows.map((r) => [r.seed, r.player_id]));
  const pairs = standardBracketFirstRoundPairs(knockoutSize);
  const pairings: KnockoutPairing[] = pairs.map(([a, b], idx) => ({
    player1Id: seedByRank.get(a)!,
    player2Id: seedByRank.get(b)!,
    bracketSlot: idx + 1,
  }));
  const stage = knockoutStageForPlayerCount(knockoutSize);
  return { pairings, stage, seeds: seedRows };
}

/** Empareja ganadores de la ronda KO anterior (slots impares con pares adyacentes). */
export function buildNextKnockoutPairings(
  previousMatches: Array<{
    bracketSlot: number;
    winnerId: number;
  }>,
  playerCountEnteringRound: number
): { pairings: KnockoutPairing[]; stage: KnockoutStage } {
  const sorted = [...previousMatches].sort((a, b) => a.bracketSlot - b.bracketSlot);
  const pairings: KnockoutPairing[] = [];
  for (let i = 0; i < sorted.length; i += 2) {
    const m1 = sorted[i]!;
    const m2 = sorted[i + 1]!;
    pairings.push({
      player1Id: m1.winnerId,
      player2Id: m2.winnerId,
      bracketSlot: i / 2 + 1,
    });
  }
  const stage = knockoutStageForPlayerCount(playerCountEnteringRound);
  return { pairings, stage };
}

export function seriesTargetForConfig(series: KnockoutSeries): number {
  return seriesTargetWins(series);
}

export function resolveKnockoutGameStarter(
  gameNumber: number,
  playerIds: [number, number],
  options: {
    matchStarter: 'random' | 'higher_swiss_seed';
    seriesStarterMode?: KnockoutSeriesStarterMode;
    /** @deprecated Usar seriesStarterMode */
    alternateStarter?: boolean;
    seedByPlayer: Map<number, number>;
    seriesState: SeriesState;
    existingStarters: Record<number, number>;
  }
): number {
  const { existingStarters } = options;
  if (existingStarters[gameNumber] != null) return existingStarters[gameNumber]!;

  const seriesMode = normalizeKnockoutSeriesStarterMode(
    options.seriesStarterMode,
    options.alternateStarter
  );

  if (gameNumber === 1) {
    if (options.matchStarter === 'random') {
      return playerIds[Math.floor(Math.random() * 2)]!;
    }
    const s0 = options.seedByPlayer.get(playerIds[0]) ?? Number.MAX_SAFE_INTEGER;
    const s1 = options.seedByPlayer.get(playerIds[1]) ?? Number.MAX_SAFE_INTEGER;
    return s0 <= s1 ? playerIds[0] : playerIds[1];
  }

  const prev = options.seriesState.games.find((g) => g.gameNumber === gameNumber - 1);
  const game1Starter = existingStarters[1];

  if (seriesMode === 'previous_loser' && prev) {
    return prev.winnerId === playerIds[0] ? playerIds[1] : playerIds[0];
  }

  if (seriesMode === 'alternate') {
    const lastStarter =
      options.seriesState.games.find((g) => g.gameNumber === gameNumber - 1)?.starterId ??
      game1Starter;
    if (lastStarter != null) {
      return lastStarter === playerIds[0] ? playerIds[1] : playerIds[0];
    }
  }

  if (seriesMode === 'random') {
    return playerIds[Math.floor(Math.random() * 2)]!;
  }

  return game1Starter ?? playerIds[0];
}

export function tournamentHasKnockoutChampion(
  rounds: Round[],
  matchesByRound: Map<number, Match[]>,
  resultsByMatch: Record<number, MatchResult[]>,
  playersByMatch: Record<number, number[]>,
  playBronzeMatch = false
): boolean {
  const koRounds = rounds.filter((r) => r.phase === 'knockout');
  if (koRounds.length === 0) return false;
  const finalRound = koRounds.find((r) => r.knockout_stage === 'final');
  if (!finalRound?.id) return false;
  const matches = matchesByRound.get(finalRound.id) ?? [];
  const finalMatch = matches.find((m) => m.knockout_match_stage !== 'third_place') ?? matches[0];
  if (!finalMatch) return false;
  const pids = playersByMatch[finalMatch.id!] ?? [];
  if (pids.length !== 2) return !!finalMatch.series_winner_id;
  if (!isKnockoutMatchComplete(finalMatch, resultsByMatch[finalMatch.id!] ?? [], pids)) {
    return false;
  }

  if (playBronzeMatch) {
    const bronzeMatch = matches.find((m) => m.knockout_match_stage === 'third_place');
    if (bronzeMatch) {
      const bpids = playersByMatch[bronzeMatch.id!] ?? [];
      if (!isKnockoutMatchComplete(bronzeMatch, resultsByMatch[bronzeMatch.id!] ?? [], bpids)) {
        return false;
      }
    }
  }
  return true;
}
