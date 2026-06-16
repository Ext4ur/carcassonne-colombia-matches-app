import type { Player } from '../types/player';

/**
 * Align result rows with match_players seat order (mp.id), not DB result position or name.
 * Used so the result form shows players in the same order as the matches table.
 */
export function orderResultsByMatchPlayers(
  loadedResults: Array<{ player_id: number; points: number }>,
  matchPlayers: Array<Pick<Player, 'id'>>,
  count: number
): Array<{ player_id: number; points: number }> {
  const pointsByPlayer = new Map(loadedResults.map((r) => [r.player_id, r.points]));
  return matchPlayers.slice(0, count).map((p) => ({
    player_id: p.id!,
    points: pointsByPlayer.get(p.id!) ?? 0,
  }));
}

/**
 * Simulates legacy getMatchPlayers ORDER BY p.name — caused list vs form mismatch before AC-087.
 */
export function sortPlayersByName<T extends { id?: number; name: string }>(players: T[]): T[] {
  return [...players].sort((a, b) => a.name.localeCompare(b.name));
}
