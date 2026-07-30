import { TiebreakCriterion } from '../types/tournament';
import { ScoringSystem } from '../types/tournament';

/**
 * Criterios de desempate por defecto
 */
export const DEFAULT_TIEBREAK_CRITERIA: TiebreakCriterion[] = [
  { id: 'wins', name: 'Número de victorias', enabled: true, order: 1 },
  {
    id: 'opponent_points_drop_worst',
    name: 'Suma de puntos de oponentes (quitando el peor)',
    enabled: true,
    order: 2,
  },
  {
    id: 'opponent_points_drop_best_worst',
    name: 'Suma de puntos de oponentes (quitando el mejor y el peor)',
    enabled: true,
    order: 3,
  },
  { id: 'head_to_head', name: 'Victoria en enfrentamiento directo', enabled: true, order: 4 },
  { id: 'point_difference', name: 'Suma de diferencia de puntos', enabled: true, order: 5 },
];

/** Si no hay criterios guardados (torneos antiguos), usar los por defecto para clasificación y columnas. */
export function getEffectiveTiebreakCriteria(
  stored: TiebreakCriterion[] | null | undefined
): TiebreakCriterion[] {
  if (stored != null && stored.length > 0) return stored;
  return DEFAULT_TIEBREAK_CRITERIA;
}

/**
 * Sistemas de puntuación por defecto según número de jugadores por partida
 */
export const DEFAULT_SCORING_SYSTEMS: Record<number, ScoringSystem> = {
  2: { 1: 1, 2: 0 },
  3: { 1: 3, 2: 1, 3: 0 },
  4: { 1: 6, 2: 4, 3: 2, 4: 0 },
};

/**
 * Obtener sistema de puntuación por defecto para un número de jugadores
 */
export function getDefaultScoringSystem(playersPerMatch: number): ScoringSystem {
  return DEFAULT_SCORING_SYSTEMS[playersPerMatch] || DEFAULT_SCORING_SYSTEMS[2];
}

/** Nombre del lugar por defecto creado por migración (no se puede eliminar). */
export const DEFAULT_PLACE_NAME = 'Online';

/** Ciudades del sistema (sembradas en migración; no editables). */
export const SYSTEM_CITY_UUIDS = {
  online: '00000000-0000-0000-0000-000000000001',
  offline: '00000000-0000-0000-0000-000000000002',
} as const;

export function isSystemCity(city: { uuid?: string | null; name?: string | null }): boolean {
  const uuid = city.uuid?.toLowerCase();
  if (uuid === SYSTEM_CITY_UUIDS.online || uuid === SYSTEM_CITY_UUIDS.offline) {
    return true;
  }
  const name = city.name?.trim();
  return name === 'Online' || name === 'Offline';
}
