/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Caché en memoria para lecturas de torneo (getTournamentById, getTournamentRounds, getTournamentConfig)
 * y listados (getAllPlayers, getAllCircuits, getAllTournaments).
 * Se invalida al escribir para mantener coherencia.
 */

import { incrementCacheHitCount } from '../api/clients/queryCounter';

const cache = new Map<string, any>();

export function get<T = any>(key: string): T | undefined {
  if (!cache.has(key)) return undefined;
  incrementCacheHitCount();
  return cache.get(key) as T;
}

export function set(key: string, value: any): void {
  cache.set(key, value);
}

export function invalidate(key: string): void {
  cache.delete(key);
}

/** Invalida todas las entradas asociadas a un torneo (tournament, rounds, config). */
export function invalidateTournament(tournamentId: number): void {
  cache.delete(`tournament:${tournamentId}`);
  cache.delete(`tournament:${tournamentId}:rounds`);
  cache.delete(`tournament:${tournamentId}:config`);
}

/** Invalida todas las entradas de rondas (usado cuando se actualiza una ronda sin tener tournamentId a mano). */
export function invalidateAllRounds(): void {
  for (const key of cache.keys()) {
    if (key.endsWith(':rounds')) cache.delete(key);
  }
}

/** Claves de listados (para invalidar al crear/actualizar/eliminar). */
export const LIST_KEYS = {
  players: 'list:players',
  circuits: 'list:circuits',
  tournaments: 'list:tournaments',
  places: 'list:places',
  cities: 'list:cities',
} as const;
