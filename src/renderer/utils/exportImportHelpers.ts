/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Player } from '../types/player';

/**
 * Recorrido único por un snapshot de torneo exportado:
 * registra cada `player_id` con fila opcional embebida (inscripción / mesa) o sólo resultado.
 */
export function traverseTournamentPlayerRefs(
  tournament: any,
  fn: (playerId: number, inlineRow?: Record<string, unknown>) => void
): void {
  for (const p of tournament.players || []) {
    if (p?.id != null) fn(p.id as number, p as Record<string, unknown>);
  }
  for (const r of tournament.rounds || []) {
    for (const m of r.matches || []) {
      if (m.first_player_id != null) {
        fn(m.first_player_id as number, undefined);
      }
      for (const pl of m.players || []) {
        if (pl?.id != null) fn(pl.id as number, pl as Record<string, unknown>);
      }
      for (const res of m.results || []) {
        const pid = res.player_id as number | undefined;
        if (pid != null) fn(pid, undefined);
      }
    }
  }
}

/** IDs únicos referenciados en uno o más torneos snapshot. */
export function collectPlayerIdsFromTournamentSnapshots(tournaments: any[]): Set<number> {
  const ids = new Set<number>();
  for (const t of tournaments) {
    traverseTournamentPlayerRefs(t, (id) => ids.add(id));
  }
  return ids;
}

/**
 * Jugadores necesarios sólo desde árboles torneo:
 * primera aparición gana si ya hay fila inline; resultado sin mesa ⇒ stub `{ id, name }`.
 * Si el id ya estaba desde `priorFromGlobal`, no se reemplaza por filas thinner (misma semántica que import antiguo).
 */
export function collectPlayersOnlyFromSnapshots(
  tournaments: any[],
  priorFromGlobal: Map<number, Player>
): Map<number, Player> {
  const byId = new Map<number, Player>(priorFromGlobal);
  for (const tournament of tournaments) {
    traverseTournamentPlayerRefs(tournament, (id, inline) => {
      if (byId.has(id)) return;
      if (inline && typeof inline === 'object') {
        byId.set(id, inline as unknown as Player);
      } else {
        byId.set(id, { id, name: `Player ${id}` } as Player);
      }
    });
  }
  return byId;
}
