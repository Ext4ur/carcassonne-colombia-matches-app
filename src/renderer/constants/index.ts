import { TiebreakCriterion } from '@types/tournament';
import { ScoringSystem } from '@types/tournament';

/**
 * Criterios de desempate por defecto
 */
export const DEFAULT_TIEBREAK_CRITERIA: TiebreakCriterion[] = [
  { id: 'wins', name: 'Número de victorias', enabled: true, order: 1 },
  { id: 'opponent_points_drop_worst', name: 'Suma de puntos de oponentes (quitando el peor)', enabled: true, order: 2 },
  { id: 'opponent_points_drop_best_worst', name: 'Suma de puntos de oponentes (quitando el mejor y el peor)', enabled: true, order: 3 },
  { id: 'head_to_head', name: 'Victoria en enfrentamiento directo', enabled: true, order: 4 },
  { id: 'point_difference', name: 'Suma de diferencia de puntos', enabled: true, order: 5 },
];

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

/**
 * Estados posibles de un torneo
 */
export const TOURNAMENT_STATUSES = ['draft', 'in_progress', 'completed'] as const;
export type TournamentStatus = typeof TOURNAMENT_STATUSES[number];

/**
 * Estados posibles de una ronda
 */
export const ROUND_STATUSES = ['pending', 'in_progress', 'completed'] as const;
export type RoundStatus = typeof ROUND_STATUSES[number];

/**
 * Estados posibles de una partida
 */
export const MATCH_STATUSES = ['pending', 'completed'] as const;
export type MatchStatus = typeof MATCH_STATUSES[number];

/**
 * Tipos de torneo
 */
export const TOURNAMENT_TYPES = ['qualifier', 'circuit'] as const;
export type TournamentType = typeof TOURNAMENT_TYPES[number];

/**
 * Opciones de selección de bye
 */
export const BYE_SELECTION_OPTIONS = ['worst', 'random', 'round_robin'] as const;
export type ByeSelection = typeof BYE_SELECTION_OPTIONS[number];

/**
 * Configuración de base de datos
 */
export const DB_CONFIG = {
  mode: 'dual' as 'local' | 'remote' | 'dual',
  syncOnStartup: true,
  syncInterval: 30000, // 30 segundos
  conflictResolution: 'last-write-wins' as 'last-write-wins' | 'manual',
} as const;
