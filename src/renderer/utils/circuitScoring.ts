/**
 * Utilería para el sistema de puntuación dinámica de los circuitos.
 * Los puntos se otorgan según el ranking final del torneo y el número total de participantes.
 */

/**
 * Obtiene la puntuación de circuito para una posición específica basada en el número de jugadores.
 *
 * REGLAS:
 * - Hasta 6 jugadores: 1°: 6, 2°: 4, 3°: 3, Resto: 1
 * - De 7 a 16 jugadores: 1°: 7, 2°: 5, 3°: 4, 4°: 3, Resto: 1
 * - 17 en adelante: 1°: 8, 2°: 6, 3°: 5, 4°: 4, 5°: 3, Resto: 1
 *
 * @param position Posición final del jugador (1-based)
 * @param totalPlayers Número total de participantes en el torneo
 * @returns Puntos para el circuito
 */
export function getCircuitPointsByRank(position: number, totalPlayers: number): number {
  if (totalPlayers <= 6) {
    if (position === 1) return 6;
    if (position === 2) return 4;
    if (position === 3) return 3;
    return 1;
  }

  if (totalPlayers >= 7 && totalPlayers <= 16) {
    if (position === 1) return 7;
    if (position === 2) return 5;
    if (position === 3) return 4;
    if (position === 4) return 3;
    return 1;
  }

  // 17 en adelante
  if (position === 1) return 8;
  if (position === 2) return 6;
  if (position === 3) return 5;
  if (position === 4) return 4;
  if (position === 5) return 3;
  return 1;
}
