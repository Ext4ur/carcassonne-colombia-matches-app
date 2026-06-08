import type { PlayerStanding } from './tournament';

export type CompetitionFormat = 'swiss' | 'swiss_knockout';

export type RoundPhase = 'swiss' | 'knockout';

export type KnockoutSeeding = 'standard_bracket';

export type KnockoutSeries = 'best_of_1' | 'best_of_3';

/** Etiqueta de ronda eliminatoria según jugadores que entran a esa ronda. */
export type KnockoutStage = 'round_of_16' | 'quarterfinal' | 'semifinal' | 'final' | 'third_place';

export type KnockoutMatchStage = 'final' | 'third_place';

export type KnockoutMatchStarter = 'random' | 'higher_swiss_seed';

/** Quién empieza cada partida en fase suiza. */
export type SwissMatchStarter = 'random' | 'higher_ranked';

/** Intercalación de inicio en juegos 2+ de series KO (best-of-3). */
export type KnockoutSeriesStarterMode = 'previous_loser' | 'alternate' | 'random';

export function normalizeKnockoutSeriesStarterMode(
  value: unknown,
  legacyAlternate?: boolean
): KnockoutSeriesStarterMode {
  if (value === 'previous_loser' || value === 'alternate' || value === 'random') {
    return value;
  }
  if (legacyAlternate === true) return 'previous_loser';
  return 'alternate';
}

export const KNOCKOUT_SIZE_OPTIONS = [2, 4, 8, 16] as const;
export type KnockoutSize = (typeof KNOCKOUT_SIZE_OPTIONS)[number];

export function isKnockoutSize(n: number): n is KnockoutSize {
  return (KNOCKOUT_SIZE_OPTIONS as readonly number[]).includes(n);
}

/**
 * Mayor potencia de 2 permitida por la config que quepa con los jugadores activos.
 * Ej.: config Top 8 con 6 activos → cuadro de 4; con 10 activos → 8.
 */
export function resolveEffectiveKnockoutSize(
  configuredSize: KnockoutSize,
  activePlayerCount: number
): KnockoutSize | null {
  const candidates = KNOCKOUT_SIZE_OPTIONS.filter((s) => s <= configuredSize).sort((a, b) => b - a);
  for (const size of candidates) {
    if (activePlayerCount >= size) return size;
  }
  return null;
}

export function knockoutStageForPlayerCount(n: number): KnockoutStage {
  if (n <= 2) return 'final';
  if (n <= 4) return 'semifinal';
  if (n <= 8) return 'quarterfinal';
  return 'round_of_16';
}

export function knockoutStageI18nKey(stage: KnockoutStage): string {
  return `knockout.stage.${stage}`;
}

/** Orden de semillas para bracket simple: [1,8,4,5,3,6,2,7] para n=8. */
export function standardBracketSeedOrder(size: KnockoutSize): number[] {
  if (size === 2) return [1, 2];
  let seeds = [1, 2];
  while (seeds.length < size) {
    const sum = seeds.length * 2 + 1;
    const next: number[] = [];
    for (const s of seeds) {
      next.push(s);
      next.push(sum - s);
    }
    seeds = next;
  }
  return seeds;
}

/** Parejas (índice de semilla en standings, 1-based) para la primera ronda KO. */
export function standardBracketFirstRoundPairs(size: KnockoutSize): [number, number][] {
  const order = standardBracketSeedOrder(size);
  const pairs: [number, number][] = [];
  for (let i = 0; i < order.length; i += 2) {
    pairs.push([order[i]!, order[i + 1]!]);
  }
  return pairs;
}

export function seriesTargetWins(series: KnockoutSeries): number {
  return series === 'best_of_3' ? 2 : 1;
}

export interface KnockoutSeedRow {
  tournament_id: number;
  player_id: number;
  seed: number;
  player_name?: string;
}

export function topNStandingsForKnockout(
  standings: PlayerStanding[],
  size: number
): PlayerStanding[] {
  const active = standings.filter((s) => s.active);
  return active.slice(0, size);
}
