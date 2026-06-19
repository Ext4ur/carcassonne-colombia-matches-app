/**
 * Columnas persistidas en SQLite local (no incluye campos solo-remotos como series_winner_uuid).
 * Mantener alineado con src/main/database.ts y scripts/validate-schemas.js.
 */
export const LOCAL_SQLITE_COLUMNS: Record<string, readonly string[]> = {
  players: ['id', 'uuid', 'name', 'bga_username', 'phone', 'email', 'age', 'display_preference'],
  circuits: ['id', 'uuid', 'name', 'description', 'start_date', 'end_date', 'status'],
  cities: ['id', 'uuid', 'name'],
  places: ['id', 'uuid', 'name', 'city_id', 'city_uuid'],
  tournaments: [
    'id',
    'uuid',
    'name',
    'type',
    'circuit_id',
    'circuit_uuid',
    'date',
    'status',
    'players_per_match',
    'number_of_rounds',
    'place_id',
    'place_uuid',
    'competition_format',
    'knockout_phase_started_at',
  ],
  tournament_configs: [
    'id',
    'uuid',
    'tournament_id',
    'tournament_uuid',
    'avoid_rematches',
    'tiebreak_criteria',
    'scoring_system',
    'bye_selection',
    'player_display_mode',
    'pairing_algorithm',
    'buchholz_bye_mode',
    'knockout_size',
    'knockout_seeding',
    'knockout_series',
    'swiss_standings_snapshot',
    'knockout_play_bronze_match',
    'knockout_match_starter',
    'knockout_series_alternate_starter',
    'knockout_series_starter_mode',
    'swiss_match_starter',
  ],
  tournament_players: [
    'id',
    'uuid',
    'tournament_id',
    'tournament_uuid',
    'player_id',
    'player_uuid',
    'registered_at',
    'active',
    'dropout_round',
  ],
  tournament_knockout_seeds: ['id', 'uuid', 'tournament_id', 'player_id', 'seed'],
  rounds: [
    'id',
    'uuid',
    'tournament_id',
    'tournament_uuid',
    'round_number',
    'status',
    'started_at',
    'completed_at',
    'phase',
    'knockout_stage',
  ],
  matches: [
    'id',
    'uuid',
    'round_id',
    'round_uuid',
    'match_number',
    'status',
    'completed_at',
    'first_player_id',
    'first_player_uuid',
    'knockout_bracket_slot',
    'series_target_wins',
    'series_winner_id',
    'is_knockout',
    'series_meta',
    'knockout_match_stage',
  ],
  match_players: ['id', 'uuid', 'match_id', 'match_uuid', 'player_id', 'player_uuid'],
  match_results: [
    'id',
    'uuid',
    'match_id',
    'match_uuid',
    'player_id',
    'player_uuid',
    'position',
    'points',
    'tournament_points',
    'game_number',
  ],
  player_byes: [
    'id',
    'uuid',
    'tournament_id',
    'tournament_uuid',
    'player_id',
    'player_uuid',
    'round_number',
  ],
};

/** Quita columnas que Supabase tiene pero SQLite local no (p. ej. series_winner_uuid). */
export function filterRecordForLocalSQLite(
  table: string,
  data: Record<string, unknown>
): Record<string, unknown> {
  const allowed = LOCAL_SQLITE_COLUMNS[table];
  if (!allowed) return data;
  const set = new Set(allowed);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (set.has(key)) out[key] = value;
  }
  return out;
}
