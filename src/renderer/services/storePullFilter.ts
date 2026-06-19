import type { SqliteClient } from '../api/clients/SqliteClient';
import type { SupabaseClient } from '../api/clients/SupabaseClient';
import { getAssignedTournamentUuid } from './storeActivation';
import { isStoreMode } from '../utils/storeMode';

type RemoteRowCache = Map<string, Map<string, Record<string, unknown>>>;

const TOURNAMENT_SCOPED_TABLES = new Set([
  'tournament_configs',
  'tournament_players',
  'tournament_knockout_seeds',
  'rounds',
  'player_byes',
]);

/** Tablas de catálogo global: todas las tiendas las sincronizan y ven en UI (jugadores). */
export const GLOBAL_STORE_PULL_TABLES = new Set(['players', 'cities', 'places', 'circuits']);

/**
 * En build tienda: no aplicar pulls de torneos/datos ajenos al clasificatorio asignado.
 * Devuelve true si el log debe omitirse (sin persistir localmente).
 *
 * Catálogo global (jugadores, ciudades, lugares, circuitos): siempre se sincroniza;
 * todas las tiendas ven el listado completo de jugadores.
 */
export async function shouldSkipPullLogInStoreMode(
  sqlite: SqliteClient,
  supabase: SupabaseClient,
  table: string,
  remoteRecord: Record<string, unknown>,
  rowCache: RemoteRowCache
): Promise<boolean> {
  if (!isStoreMode()) return false;

  if (GLOBAL_STORE_PULL_TABLES.has(table)) return false;

  const assigned = getAssignedTournamentUuid();
  if (!assigned) return true;

  if (table === 'tournaments') {
    return String(remoteRecord.uuid ?? '') !== assigned;
  }

  if (TOURNAMENT_SCOPED_TABLES.has(table) && remoteRecord.tournament_uuid) {
    return String(remoteRecord.tournament_uuid) !== assigned;
  }

  if (table === 'matches' || table === 'match_players' || table === 'match_results') {
    const tournamentUuid = await resolveTournamentUuidForMatchScopedRow(
      sqlite,
      supabase,
      table,
      remoteRecord,
      rowCache
    );
    if (!tournamentUuid) return true;
    return tournamentUuid !== assigned;
  }

  return false;
}

async function resolveTournamentUuidForMatchScopedRow(
  sqlite: SqliteClient,
  supabase: SupabaseClient,
  table: string,
  remoteRecord: Record<string, unknown>,
  rowCache: RemoteRowCache
): Promise<string | null> {
  let matchUuid: string | null = null;
  if (table === 'matches') {
    const roundUuid = remoteRecord.round_uuid ? String(remoteRecord.round_uuid) : null;
    if (roundUuid) {
      return resolveTournamentUuidFromRoundUuid(sqlite, supabase, roundUuid, rowCache);
    }
    return null;
  }

  if (remoteRecord.match_uuid) {
    matchUuid = String(remoteRecord.match_uuid);
  }

  if (!matchUuid) return null;

  const cachedMatch = rowCache.get('matches')?.get(matchUuid);
  const roundUuid = cachedMatch?.round_uuid ? String(cachedMatch.round_uuid) : null;
  if (roundUuid) {
    return resolveTournamentUuidFromRoundUuid(sqlite, supabase, roundUuid, rowCache);
  }

  const localMatch = await sqlite.query<{ round_uuid: string | null }>(
    'SELECT r.uuid as round_uuid FROM matches m JOIN rounds r ON m.round_id = r.id WHERE m.uuid = ?',
    [matchUuid]
  );
  if (localMatch[0]?.round_uuid) {
    return resolveTournamentUuidFromRoundUuid(sqlite, supabase, localMatch[0].round_uuid, rowCache);
  }

  if (supabase.client) {
    const { data } = await supabase.client
      .from('matches')
      .select('round_uuid')
      .eq('uuid', matchUuid)
      .maybeSingle();
    if (data?.round_uuid) {
      return resolveTournamentUuidFromRoundUuid(
        sqlite,
        supabase,
        String(data.round_uuid),
        rowCache
      );
    }
  }

  return null;
}

async function resolveTournamentUuidFromRoundUuid(
  sqlite: SqliteClient,
  supabase: SupabaseClient,
  roundUuid: string,
  rowCache: RemoteRowCache
): Promise<string | null> {
  const cachedRound = rowCache.get('rounds')?.get(roundUuid);
  if (cachedRound?.tournament_uuid) {
    return String(cachedRound.tournament_uuid);
  }

  const localRound = await sqlite.query<{ tournament_uuid: string | null }>(
    `SELECT t.uuid as tournament_uuid
     FROM rounds r
     JOIN tournaments t ON r.tournament_id = t.id
     WHERE r.uuid = ?`,
    [roundUuid]
  );
  if (localRound[0]?.tournament_uuid) {
    return String(localRound[0].tournament_uuid);
  }

  if (supabase.client) {
    const { data } = await supabase.client
      .from('rounds')
      .select('tournament_uuid')
      .eq('uuid', roundUuid)
      .maybeSingle();
    if (data?.tournament_uuid) {
      return String(data.tournament_uuid);
    }
  }

  return null;
}
