import { TiebreakCriterion } from '@types/tournament';
import { ScoringSystem } from '@types/tournament';
import { isSupabaseConfigured } from '@api/clients/supabaseConfig';

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
 *
 * Modos disponibles:
 * - 'local': Solo SQLite local (fallback cuando Supabase no está configurado)
 * - 'remote': Solo Supabase remoto (cuando VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY están configurados)
 * - 'dual': SQLite + Supabase con sincronización (pendiente Sprint 3)
 *
 * El modo se deriva automáticamente de la configuración: si Supabase está configurado, usa 'remote';
 * si no, usa 'local' para degradar correctamente a SQLite sin fallos en runtime.
 */
export const DB_CONFIG = {
  get mode(): 'local' | 'remote' | 'dual' {
    return isSupabaseConfigured() ? 'remote' : 'local';
  },
  syncOnStartup: true,
  syncInterval: 30000, // 30 segundos
  conflictResolution: 'last-write-wins' as 'last-write-wins' | 'manual',
} as const;
