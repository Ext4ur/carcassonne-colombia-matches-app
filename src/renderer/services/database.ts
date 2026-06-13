/* eslint-disable @typescript-eslint/no-explicit-any */
// Database service for interacting with local SQLite database and syncing with Supabase
import { SqliteClient } from '../api/clients/SqliteClient';
import { DEFAULT_PLACE_NAME } from '../constants';
import { DELETE_BLOCKED_BY_TOURNAMENTS_MESSAGE } from '../constants/deleteGuards';
import * as dbCache from './dbCache';
import { getPlayerDisplayName } from '@utils/playerDisplayName';
import { SyncService } from './syncService';
import {
  MatchWithResults,
  TiebreakCriterion,
  ScoringSystem,
  BuchholzByeMode,
  normalizeBuchholzByeMode,
  Round,
  TournamentConfig,
  Tournament,
  Match,
  MatchResultWithPlayer,
  MatchResult,
  PlayerDisplayMode,
} from '../types/tournament';
import { Player } from '../types/player';
import { Circuit } from '../types/circuit';
import { City } from '../types/city';
import { Place } from '../types/place';
import { normalizeKnockoutSeriesStarterMode } from '../types/knockout';

export class DatabaseService {
  // Always use local SQLite client for read/write
  private static client = new SqliteClient();

  /**
   * Helper to get UUID from local ID.
   * Cached? Maybe not needed for low volume. Queries are fast in SQLite.
   */
  private static async getUuid(table: string, id: number): Promise<string | null> {
    const res = await this.client.query(`SELECT uuid FROM ${table} WHERE id = ?`, [id]);
    return res[0]?.uuid || null;
  }

  static async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    return this.client.query<T>(sql, params);
  }

  static async execute(
    sql: string,
    params?: unknown[]
  ): Promise<{ lastInsertRowid: number; changes: number }> {
    return this.client.execute(sql, params);
  }

  static async transaction(
    queries: Array<{ sql: string; params?: unknown[] }>
  ): Promise<unknown[]> {
    return this.client.transaction(queries);
  }

  // ==========================================
  // Player operations
  // ==========================================
  static async getAllPlayers(): Promise<Player[]> {
    const cached = dbCache.get(dbCache.LIST_KEYS.players);
    if (cached !== undefined) return cached as Player[];
    const data = await this.query<Player>('SELECT * FROM players ORDER BY name');
    dbCache.set(dbCache.LIST_KEYS.players, data);
    return data;
  }

  static async getPlayerById(id: number): Promise<Player | null> {
    const results = await this.query<Player>('SELECT * FROM players WHERE id = ?', [id]);
    return results[0] || null;
  }

  static async searchPlayers(searchTerm: string): Promise<Player[]> {
    const term = `%${searchTerm}%`;
    return this.query<Player>(
      'SELECT * FROM players WHERE name LIKE ? OR bga_username LIKE ? ORDER BY name',
      [term, term]
    );
  }

  static async createPlayer(player: {
    name: string;
    bga_username?: string;
    display_preference?: 'name' | 'username';
    phone?: string;
    email?: string;
    age?: number;
  }) {
    const uuid = self.crypto.randomUUID();
    const result = await this.execute(
      `INSERT INTO players (uuid, name, bga_username, display_preference, phone, email, age) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid,
        player.name,
        player.bga_username || null,
        player.display_preference || 'name',
        player.phone || null,
        player.email || null,
        player.age || null,
      ]
    );

    // Sync Queue
    await SyncService.addToQueue('players', 'INSERT', {
      uuid,
      name: player.name,
      bga_username: player.bga_username || null,
      display_preference: player.display_preference || 'name',
      phone: player.phone || null,
      email: player.email || null,
      age: player.age || null,
    });

    dbCache.invalidate(dbCache.LIST_KEYS.players);
    return result.lastInsertRowid;
  }

  static async updatePlayer(
    id: number,
    player: {
      name?: string;
      bga_username?: string;
      display_preference?: 'name' | 'username';
      phone?: string;
      email?: string;
      age?: number;
    }
  ) {
    const uuid = await this.getUuid('players', id);
    if (!uuid) throw new Error(`Player ${id} has no UUID`);

    const updates: string[] = [];
    const params: any[] = [];

    // Build update query
    Object.entries(player).forEach(([key, value]) => {
      if (value !== undefined) {
        updates.push(`${key} = ?`);
        params.push(value);
      }
    });

    if (updates.length === 0) return;

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    await this.execute(`UPDATE players SET ${updates.join(', ')} WHERE id = ?`, params);

    // Sync Queue
    await SyncService.addToQueue('players', 'UPDATE', { uuid, ...player });

    dbCache.invalidate(dbCache.LIST_KEYS.players);
  }

  static async deletePlayer(id: number) {
    const uuid = await this.getUuid('players', id);
    if (!uuid) throw new Error(`Player ${id} has no UUID`);

    // Prevent deletion if the player is involved in tournaments or matches
    const references = await this.query<{ tournamentsCount: number; matchesCount: number }>(
      `
      SELECT 
        (SELECT COUNT(*) FROM tournament_players WHERE player_id = ?) as tournamentsCount,
        (
          SELECT COUNT(*) FROM (
            SELECT 1 FROM match_players WHERE player_id = ?
            UNION ALL
            SELECT 1 FROM matches WHERE first_player_id = ?
            UNION ALL
            SELECT 1 FROM match_results WHERE player_id = ?
            UNION ALL
            SELECT 1 FROM player_byes WHERE player_id = ?
          )
        ) as matchesCount
      `,
      [id, id, id, id, id]
    );

    if (references[0] && references[0].tournamentsCount > 0) {
      throw new Error(DELETE_BLOCKED_BY_TOURNAMENTS_MESSAGE);
    }
    if (references[0] && references[0].matchesCount > 0) {
      throw new Error(
        'No se puede eliminar el jugador porque tiene registros asociados (partidas, inicios o resultados). Considera cambiar su estado a inactivo en su lugar.'
      );
    }

    const result = await this.execute('DELETE FROM players WHERE id = ?', [id]);

    // Sync Queue
    await SyncService.addToQueue('players', 'DELETE', { uuid });

    dbCache.invalidate(dbCache.LIST_KEYS.players);
    return result;
  }

  // ==========================================
  // Circuit operations
  // ==========================================
  static async getAllCircuits(): Promise<Circuit[]> {
    const cached = dbCache.get(dbCache.LIST_KEYS.circuits);
    if (cached !== undefined) return cached as Circuit[];
    const data = await this.query<Circuit>('SELECT * FROM circuits ORDER BY created_at DESC');
    dbCache.set(dbCache.LIST_KEYS.circuits, data);
    return data;
  }

  static async getCircuitByName(name: string): Promise<Circuit | null> {
    const results = await this.query<Circuit>('SELECT * FROM circuits WHERE name = ?', [name]);
    return results[0] || null;
  }

  static async getCircuitById(id: number): Promise<Circuit | null> {
    const results = await this.query<Circuit>('SELECT * FROM circuits WHERE id = ?', [id]);
    return results[0] || null;
  }

  static async createCircuit(circuit: {
    name: string;
    description?: string;
    start_date?: string;
    end_date?: string;
    status?: 'active' | 'finalized';
  }) {
    const uuid = self.crypto.randomUUID();
    const result = await this.execute(
      `INSERT INTO circuits (uuid, name, description, start_date, end_date, status) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        uuid,
        circuit.name,
        circuit.description || null,
        circuit.start_date || null,
        circuit.end_date || null,
        circuit.status || 'active',
      ]
    );

    await SyncService.addToQueue('circuits', 'INSERT', {
      uuid,
      name: circuit.name,
      description: circuit.description || null,
      start_date: circuit.start_date || null,
      end_date: circuit.end_date || null,
      status: circuit.status || 'active',
    });
    dbCache.invalidate(dbCache.LIST_KEYS.circuits);
    return result.lastInsertRowid;
  }

  static async updateCircuit(
    id: number,
    circuit: {
      name?: string;
      description?: string;
      start_date?: string;
      end_date?: string;
      status?: 'active' | 'finalized';
    }
  ) {
    const uuid = await this.getUuid('circuits', id);
    if (!uuid) throw new Error(`Circuit ${id} has no UUID`);

    const updates: string[] = [];
    const params: any[] = [];

    Object.entries(circuit).forEach(([key, value]) => {
      if (value !== undefined) {
        updates.push(`${key} = ?`);
        params.push(value);
      }
    });

    if (updates.length === 0) return;

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    await this.execute(`UPDATE circuits SET ${updates.join(', ')} WHERE id = ?`, params);

    await SyncService.addToQueue('circuits', 'UPDATE', { uuid, ...circuit });
    dbCache.invalidate(dbCache.LIST_KEYS.circuits);
  }

  /** Tournaments of a circuit (completed only), ordered by date. */
  static async getCircuitTournaments(circuitId: number): Promise<Tournament[]> {
    return this.query<Tournament>(
      `SELECT t.*, p.name as place_name, c.name as city_name 
       FROM tournaments t 
       LEFT JOIN places p ON t.place_id = p.id 
       LEFT JOIN cities c ON p.city_id = c.id
       WHERE t.circuit_id = ? AND t.status = ? 
       ORDER BY t.date ASC, t.id ASC`,
      [circuitId, 'completed']
    );
  }

  static async deleteCircuit(id: number) {
    const uuid = await this.getUuid('circuits', id);
    if (!uuid) throw new Error(`Circuit ${id} has no UUID`);

    const tourUse = await this.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM tournaments WHERE circuit_id = ?',
      [id]
    );
    if (tourUse[0]?.count && tourUse[0].count > 0) {
      throw new Error(DELETE_BLOCKED_BY_TOURNAMENTS_MESSAGE);
    }

    const result = await this.execute('DELETE FROM circuits WHERE id = ?', [id]);

    await SyncService.addToQueue('circuits', 'DELETE', { uuid });
    dbCache.invalidate(dbCache.LIST_KEYS.circuits);
    return result;
  }

  // ==========================================
  // City operations
  // ==========================================
  static async getAllCities(): Promise<City[]> {
    const cached = dbCache.get(dbCache.LIST_KEYS.cities);
    if (cached !== undefined) return cached as City[];
    const data = await this.query<City>('SELECT * FROM cities ORDER BY name');
    dbCache.set(dbCache.LIST_KEYS.cities, data);
    return data;
  }

  static async getCityById(id: number): Promise<City | null> {
    const results = await this.query<City>('SELECT * FROM cities WHERE id = ?', [id]);
    return results[0] || null;
  }

  static async createCity(city: { name: string }) {
    const uuid = self.crypto.randomUUID();
    const result = await this.execute('INSERT INTO cities (uuid, name) VALUES (?, ?)', [
      uuid,
      city.name.trim(),
    ]);

    await SyncService.addToQueue('cities', 'INSERT', { uuid, name: city.name.trim() });
    dbCache.invalidate(dbCache.LIST_KEYS.cities);
    return result.lastInsertRowid;
  }

  static async updateCity(id: number, city: { name?: string }) {
    if (city.name === undefined) return;
    const uuid = await this.getUuid('cities', id);
    if (!uuid) throw new Error(`City ${id} has no UUID`);

    await this.execute('UPDATE cities SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
      city.name.trim(),
      id,
    ]);

    await SyncService.addToQueue('cities', 'UPDATE', { uuid, name: city.name.trim() });

    dbCache.invalidate(dbCache.LIST_KEYS.cities);
    dbCache.invalidate(dbCache.LIST_KEYS.places);
  }

  static async deleteCity(id: number) {
    const uuid = await this.getUuid('cities', id);
    if (!uuid) throw new Error(`City ${id} has no UUID`);

    const tourUse = await this.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM tournaments t
       INNER JOIN places p ON t.place_id = p.id
       WHERE p.city_id = ?`,
      [id]
    );
    if (tourUse[0]?.count && tourUse[0].count > 0) {
      throw new Error(DELETE_BLOCKED_BY_TOURNAMENTS_MESSAGE);
    }

    const inUse = await this.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM places WHERE city_id = ?',
      [id]
    );
    if (inUse[0]?.count && inUse[0].count > 0) {
      throw new Error('No se puede eliminar la ciudad: hay lugares que la usan.');
    }
    await this.execute('DELETE FROM cities WHERE id = ?', [id]);

    await SyncService.addToQueue('cities', 'DELETE', { uuid });
    dbCache.invalidate(dbCache.LIST_KEYS.cities);
    dbCache.invalidate(dbCache.LIST_KEYS.places);
  }

  // ==========================================
  // Place operations
  // ==========================================
  static async getAllPlaces(): Promise<Place[]> {
    const cached = dbCache.get(dbCache.LIST_KEYS.places);
    if (cached !== undefined) return cached as Place[];
    const data = await this.query<Place>(
      'SELECT p.*, c.name as city_name FROM places p LEFT JOIN cities c ON p.city_id = c.id ORDER BY p.name'
    );
    dbCache.set(dbCache.LIST_KEYS.places, data);
    return data;
  }

  static async getPlaceById(id: number): Promise<Place | null> {
    const results = await this.query<Place>(
      'SELECT p.*, c.name as city_name FROM places p LEFT JOIN cities c ON p.city_id = c.id WHERE p.id = ?',
      [id]
    );
    return results[0] || null;
  }

  static async getDefaultPlaceId(): Promise<number> {
    const results = await this.query<{ id: number }>(
      'SELECT id FROM places WHERE name = ? LIMIT 1',
      [DEFAULT_PLACE_NAME]
    );
    const row = results[0];
    if (!row)
      throw new Error(
        `Lugar por defecto "${DEFAULT_PLACE_NAME}" no encontrado. Ejecuta las migraciones.`
      );
    return row.id;
  }

  static async createPlace(place: { name: string; city_id: number }) {
    const uuid = self.crypto.randomUUID();
    const cityUuid = await this.getUuid('cities', place.city_id);

    const result = await this.execute('INSERT INTO places (uuid, name, city_id) VALUES (?, ?, ?)', [
      uuid,
      place.name.trim(),
      place.city_id,
    ]);

    await SyncService.addToQueue('places', 'INSERT', {
      uuid,
      name: place.name.trim(),
      city_uuid: cityUuid,
    });
    dbCache.invalidate(dbCache.LIST_KEYS.places);
    return result.lastInsertRowid;
  }

  static async updatePlace(id: number, place: { name?: string; city_id?: number }) {
    const uuid = await this.getUuid('places', id);
    if (!uuid) throw new Error(`Place ${id} has no UUID`);

    const updates: string[] = [];
    const params: any[] = [];
    const payload: any = {};

    if (place.name !== undefined) {
      updates.push('name = ?');
      params.push(place.name.trim());
      payload.name = place.name.trim();
    }
    if (place.city_id !== undefined) {
      updates.push('city_id = ?');
      params.push(place.city_id);
      payload.city_uuid = await this.getUuid('cities', place.city_id);
    }

    if (updates.length === 0) return;
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    await this.execute(`UPDATE places SET ${updates.join(', ')} WHERE id = ?`, params);

    await SyncService.addToQueue('places', 'UPDATE', { uuid, ...payload });
    dbCache.invalidate(dbCache.LIST_KEYS.places);
  }

  static async deletePlace(id: number) {
    const uuid = await this.getUuid('places', id);
    if (!uuid) throw new Error(`Place ${id} has no UUID`);

    const inUse = await this.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM tournaments WHERE place_id = ?',
      [id]
    );
    if (inUse[0]?.count && inUse[0].count > 0) {
      throw new Error(DELETE_BLOCKED_BY_TOURNAMENTS_MESSAGE);
    }
    await this.execute('DELETE FROM places WHERE id = ?', [id]);

    await SyncService.addToQueue('places', 'DELETE', { uuid });
    dbCache.invalidate(dbCache.LIST_KEYS.places);
  }

  // ==========================================
  // Tournament operations
  // ==========================================
  static async getAllTournaments(): Promise<Tournament[]> {
    const cached = dbCache.get(dbCache.LIST_KEYS.tournaments);
    if (cached !== undefined) return cached as Tournament[];

    const data = await this.query<Tournament>(`
        SELECT t.*, c.name as circuit_name, p.name as place_name 
        FROM tournaments t 
        LEFT JOIN circuits c ON t.circuit_id = c.id 
        LEFT JOIN places p ON t.place_id = p.id 
        ORDER BY t.date DESC, t.created_at DESC
      `);

    dbCache.set(dbCache.LIST_KEYS.tournaments, data);
    return data;
  }

  static async getTournamentByNameAndDate(name: string, date: string): Promise<Tournament[]> {
    return this.query<Tournament>('SELECT * FROM tournaments WHERE name = ? AND date = ?', [
      name,
      date,
    ]);
  }

  static async getTournamentByNameDateAndPlace(
    name: string,
    date: string,
    placeId: number
  ): Promise<Tournament[]> {
    return this.query<Tournament>(
      'SELECT * FROM tournaments WHERE name = ? AND date = ? AND place_id = ?',
      [name, date, placeId]
    );
  }

  static async getPlayersByExactName(name: string): Promise<Player[]> {
    const trimmed = name.trim();
    if (!trimmed) return [];
    return this.query<Player>('SELECT * FROM players WHERE TRIM(name) = ?', [trimmed]);
  }

  static async getPlayerByBGAUsername(bgaUsername: string): Promise<Player[]> {
    if (!bgaUsername) return [];
    return this.query<Player>('SELECT * FROM players WHERE bga_username = ?', [bgaUsername]);
  }

  static async getTournamentById(id: number): Promise<Tournament | null> {
    const cached = dbCache.get(`tournament:${id}`);
    if (cached !== undefined) return cached as Tournament;

    const results = await this.query<Tournament>(
      `
        SELECT t.*, c.name as circuit_name, p.name as place_name 
        FROM tournaments t 
        LEFT JOIN circuits c ON t.circuit_id = c.id 
        LEFT JOIN places p ON t.place_id = p.id 
        WHERE t.id = ?
      `,
      [id]
    );
    const tournament = results[0] || null;
    dbCache.set(`tournament:${id}`, tournament);
    return tournament;
  }

  static async createTournament(tournament: {
    name: string;
    type: 'qualifier' | 'circuit';
    circuit_id?: number;
    date: string;
    players_per_match: number;
    number_of_rounds?: number;
    place_id?: number;
    competition_format?: 'swiss' | 'swiss_knockout';
  }) {
    if (tournament.circuit_id) {
      const circuit = await this.getCircuitById(tournament.circuit_id);
      if (circuit?.status === 'finalized') {
        throw new Error('No se pueden agregar torneos a un circuito finalizado.');
      }
    }
    const placeId = tournament.place_id ?? (await this.getDefaultPlaceId());

    const uuid = self.crypto.randomUUID();
    const result = await this.execute(
      `INSERT INTO tournaments (uuid, name, type, circuit_id, date, players_per_match, number_of_rounds, place_id, competition_format) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid,
        tournament.name,
        tournament.type,
        tournament.circuit_id || null,
        tournament.date,
        tournament.players_per_match,
        tournament.number_of_rounds || null,
        placeId,
        tournament.competition_format || 'swiss',
      ]
    );

    // Convert FKs to UUIDs for Sync
    const circuitUuid = tournament.circuit_id
      ? await this.getUuid('circuits', tournament.circuit_id)
      : null;
    const placeUuid = await this.getUuid('places', placeId);

    await SyncService.addToQueue('tournaments', 'INSERT', {
      uuid,
      name: tournament.name,
      type: tournament.type,
      date: tournament.date,
      players_per_match: tournament.players_per_match,
      number_of_rounds: tournament.number_of_rounds,
      circuit_uuid: circuitUuid,
      place_uuid: placeUuid,
      competition_format: tournament.competition_format || 'swiss',
    });

    dbCache.invalidate(dbCache.LIST_KEYS.tournaments);
    return result.lastInsertRowid;
  }

  static async updateTournament(id: number, updates: Partial<Tournament>) {
    const row = await this.query<{ uuid: string }>('SELECT uuid FROM tournaments WHERE id = ?', [
      id,
    ]);
    const uuid = row[0]?.uuid;
    if (!uuid) throw new Error(`Tournament ${id} has no UUID`);

    const updateStatements: string[] = [];
    const params: any[] = [];
    const payload: any = {};

    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        updateStatements.push(`${key} = ?`);
        params.push(value);
      }
    });

    if (updateStatements.length === 0) return;

    // Resolve updated FKs for payload
    if (updates.place_id) {
      payload.place_uuid = await this.getUuid('places', updates.place_id);
    }
    // Build payload without IDs
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.date !== undefined) payload.date = updates.date;
    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.players_per_match !== undefined)
      payload.players_per_match = updates.players_per_match;
    if (updates.number_of_rounds !== undefined) payload.number_of_rounds = updates.number_of_rounds;
    if (updates.competition_format !== undefined)
      payload.competition_format = updates.competition_format;
    if (updates.knockout_phase_started_at !== undefined)
      payload.knockout_phase_started_at = updates.knockout_phase_started_at;

    updateStatements.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    await this.execute(
      `UPDATE tournaments SET ${updateStatements.join(', ')} WHERE id = ?`,
      params
    );
    await SyncService.addToQueue('tournaments', 'UPDATE', { uuid, ...payload });

    dbCache.invalidateTournament(id);
    dbCache.invalidate(dbCache.LIST_KEYS.tournaments);
  }

  static async deleteTournament(id: number) {
    const uuid = await this.getUuid('tournaments', id);
    if (!uuid) throw new Error(`Tournament ${id} has no UUID`);

    await this.execute('DELETE FROM tournaments WHERE id = ?', [id]);

    await SyncService.addToQueue('tournaments', 'DELETE', { uuid });

    dbCache.invalidateTournament(id);
    dbCache.invalidate(dbCache.LIST_KEYS.tournaments);
  }

  // ==========================================
  // Tournament config operations
  // ==========================================
  static async getTournamentConfig(
    tournamentId: number
  ): Promise<(TournamentConfig & { bye_selection?: string }) | null> {
    const cached = dbCache.get(`tournament:${tournamentId}:config`);
    if (cached !== undefined)
      return cached as
        | (TournamentConfig & { bye_selection?: string; pairing_algorithm?: string })
        | null;
    const results = await this.query<any>(
      'SELECT * FROM tournament_configs WHERE tournament_id = ?',
      [tournamentId]
    );
    let config: (TournamentConfig & { bye_selection?: string; pairing_algorithm?: string }) | null =
      null;
    if (results[0]) {
      config = {
        ...results[0],
        tiebreak_criteria: JSON.parse(results[0].tiebreak_criteria),
        scoring_system: JSON.parse(results[0].scoring_system),
        avoid_rematches: Boolean(results[0].avoid_rematches),
        bye_selection: results[0].bye_selection || 'worst',
        player_display_mode: results[0].player_display_mode || 'per_player',
        pairing_algorithm: results[0].pairing_algorithm || 'greedy',
        buchholz_bye_mode: normalizeBuchholzByeMode(results[0].buchholz_bye_mode),
        knockout_size: results[0].knockout_size ?? 8,
        knockout_seeding: results[0].knockout_seeding || 'standard_bracket',
        knockout_series: results[0].knockout_series || 'best_of_1',
        knockout_play_bronze_match: Boolean(results[0].knockout_play_bronze_match),
        knockout_match_starter: results[0].knockout_match_starter || 'higher_swiss_seed',
        knockout_series_alternate_starter: Boolean(results[0].knockout_series_alternate_starter),
        knockout_series_starter_mode: normalizeKnockoutSeriesStarterMode(
          results[0].knockout_series_starter_mode,
          Boolean(results[0].knockout_series_alternate_starter)
        ),
        swiss_match_starter: results[0].swiss_match_starter || 'higher_ranked',
        swiss_standings_snapshot: results[0].swiss_standings_snapshot ?? null,
      };
    }
    dbCache.set(`tournament:${tournamentId}:config`, config);
    return config;
  }

  static async createTournamentConfig(config: {
    tournament_id: number;
    avoid_rematches: boolean;
    tiebreak_criteria: TiebreakCriterion[];
    scoring_system: ScoringSystem;
    bye_selection?: 'worst' | 'random' | 'round_robin';
    player_display_mode?: 'per_player' | 'names_only' | 'usernames_only';
    pairing_algorithm?: 'greedy' | 'backtracking';
    buchholz_bye_mode?: BuchholzByeMode;
    knockout_size?: number;
    knockout_seeding?: string;
    knockout_series?: string;
    knockout_play_bronze_match?: boolean;
    knockout_match_starter?: string;
    knockout_series_alternate_starter?: boolean;
    knockout_series_starter_mode?: string;
    swiss_match_starter?: string;
    swiss_standings_snapshot?: string | null;
  }) {
    const uuid = self.crypto.randomUUID();
    const tournamentUuid = await this.getUuid('tournaments', config.tournament_id);
    const buchholzMode = normalizeBuchholzByeMode(config.buchholz_bye_mode);

    await this.execute(
      `INSERT INTO tournament_configs (uuid, tournament_id, avoid_rematches, tiebreak_criteria, scoring_system, bye_selection, player_display_mode, pairing_algorithm, buchholz_bye_mode, knockout_size, knockout_seeding, knockout_series, knockout_play_bronze_match, knockout_match_starter, knockout_series_alternate_starter, knockout_series_starter_mode, swiss_match_starter) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid,
        config.tournament_id,
        config.avoid_rematches ? 1 : 0,
        JSON.stringify(config.tiebreak_criteria),
        JSON.stringify(config.scoring_system),
        config.bye_selection || 'worst',
        config.player_display_mode || 'per_player',
        config.pairing_algorithm || 'greedy',
        buchholzMode,
        config.knockout_size ?? 8,
        config.knockout_seeding || 'standard_bracket',
        config.knockout_series || 'best_of_1',
        config.knockout_play_bronze_match ? 1 : 0,
        config.knockout_match_starter || 'higher_swiss_seed',
        config.knockout_series_alternate_starter ? 1 : 0,
        config.knockout_series_starter_mode ??
          normalizeKnockoutSeriesStarterMode(undefined, config.knockout_series_alternate_starter),
        config.swiss_match_starter || 'higher_ranked',
      ]
    );

    await SyncService.addToQueue('tournament_configs', 'INSERT', {
      uuid,
      tournament_uuid: tournamentUuid,
      avoid_rematches: config.avoid_rematches,
      tiebreak_criteria: config.tiebreak_criteria, // serialized handled by Supabase client or we send JSON
      scoring_system: config.scoring_system,
      bye_selection: config.bye_selection,
      player_display_mode: config.player_display_mode,
      pairing_algorithm: config.pairing_algorithm || 'greedy',
      buchholz_bye_mode: buchholzMode,
      knockout_size: config.knockout_size ?? 8,
      knockout_seeding: config.knockout_seeding || 'standard_bracket',
      knockout_series: config.knockout_series || 'best_of_1',
      knockout_play_bronze_match: Boolean(config.knockout_play_bronze_match),
      knockout_match_starter: config.knockout_match_starter || 'higher_swiss_seed',
      knockout_series_alternate_starter: Boolean(config.knockout_series_alternate_starter),
      knockout_series_starter_mode:
        config.knockout_series_starter_mode ??
        normalizeKnockoutSeriesStarterMode(undefined, config.knockout_series_alternate_starter),
      swiss_match_starter: config.swiss_match_starter || 'higher_ranked',
    });

    dbCache.invalidateTournament(config.tournament_id);
  }

  static async updateTournamentConfig(
    tournamentId: number,
    config: {
      avoid_rematches?: boolean;
      tiebreak_criteria?: TiebreakCriterion[];
      scoring_system?: ScoringSystem;
      bye_selection?: 'worst' | 'random' | 'round_robin';
      player_display_mode?: 'per_player' | 'names_only' | 'usernames_only';
      pairing_algorithm?: 'greedy' | 'backtracking';
      buchholz_bye_mode?: BuchholzByeMode;
      knockout_size?: number;
      knockout_seeding?: string;
      knockout_series?: string;
      knockout_play_bronze_match?: boolean;
      knockout_match_starter?: string;
      knockout_series_alternate_starter?: boolean;
      knockout_series_starter_mode?: string;
      swiss_match_starter?: string;
      swiss_standings_snapshot?: string | null;
    }
  ) {
    // Determine config UUID via tournament configs?
    // We added uuid to tournament_configs.
    // Query it first.
    const row = await this.query<{ uuid: string }>(
      'SELECT uuid FROM tournament_configs WHERE tournament_id=?',
      [tournamentId]
    );
    const uuid = row[0]?.uuid;
    // If not found, create? Should exist if tournament created offline mode.
    // If migration happened, it exists.

    const updates: string[] = [];
    const params: any[] = [];
    const payload: any = {};

    if (config.avoid_rematches !== undefined) {
      updates.push('avoid_rematches = ?');
      params.push(config.avoid_rematches ? 1 : 0);
      payload.avoid_rematches = config.avoid_rematches;
    }
    if (config.tiebreak_criteria !== undefined) {
      updates.push('tiebreak_criteria = ?');
      params.push(JSON.stringify(config.tiebreak_criteria));
      payload.tiebreak_criteria = config.tiebreak_criteria;
    }
    if (config.scoring_system !== undefined) {
      updates.push('scoring_system = ?');
      params.push(JSON.stringify(config.scoring_system));
      payload.scoring_system = config.scoring_system;
    }
    if (config.bye_selection !== undefined) {
      updates.push('bye_selection = ?');
      params.push(config.bye_selection);
      payload.bye_selection = config.bye_selection;
    }
    if (config.player_display_mode !== undefined) {
      updates.push('player_display_mode = ?');
      params.push(config.player_display_mode);
      payload.player_display_mode = config.player_display_mode;
    }
    if (config.pairing_algorithm !== undefined) {
      updates.push('pairing_algorithm = ?');
      params.push(config.pairing_algorithm);
      payload.pairing_algorithm = config.pairing_algorithm;
    }
    if (config.buchholz_bye_mode !== undefined) {
      const m = normalizeBuchholzByeMode(config.buchholz_bye_mode);
      updates.push('buchholz_bye_mode = ?');
      params.push(m);
      payload.buchholz_bye_mode = m;
    }
    if (config.knockout_size !== undefined) {
      updates.push('knockout_size = ?');
      params.push(config.knockout_size);
      payload.knockout_size = config.knockout_size;
    }
    if (config.knockout_seeding !== undefined) {
      updates.push('knockout_seeding = ?');
      params.push(config.knockout_seeding);
      payload.knockout_seeding = config.knockout_seeding;
    }
    if (config.knockout_series !== undefined) {
      updates.push('knockout_series = ?');
      params.push(config.knockout_series);
      payload.knockout_series = config.knockout_series;
    }
    if (config.knockout_play_bronze_match !== undefined) {
      updates.push('knockout_play_bronze_match = ?');
      params.push(config.knockout_play_bronze_match ? 1 : 0);
      payload.knockout_play_bronze_match = config.knockout_play_bronze_match;
    }
    if (config.knockout_match_starter !== undefined) {
      updates.push('knockout_match_starter = ?');
      params.push(config.knockout_match_starter);
      payload.knockout_match_starter = config.knockout_match_starter;
    }
    if (config.knockout_series_alternate_starter !== undefined) {
      updates.push('knockout_series_alternate_starter = ?');
      params.push(config.knockout_series_alternate_starter ? 1 : 0);
      payload.knockout_series_alternate_starter = config.knockout_series_alternate_starter;
    }
    if (config.knockout_series_starter_mode !== undefined) {
      updates.push('knockout_series_starter_mode = ?');
      params.push(config.knockout_series_starter_mode);
      payload.knockout_series_starter_mode = config.knockout_series_starter_mode;
      payload.knockout_series_alternate_starter =
        config.knockout_series_starter_mode === 'previous_loser';
    }
    if (config.swiss_match_starter !== undefined) {
      updates.push('swiss_match_starter = ?');
      params.push(config.swiss_match_starter);
      payload.swiss_match_starter = config.swiss_match_starter;
    }
    if (config.swiss_standings_snapshot !== undefined) {
      updates.push('swiss_standings_snapshot = ?');
      params.push(config.swiss_standings_snapshot);
      payload.swiss_standings_snapshot = config.swiss_standings_snapshot;
    }

    if (updates.length === 0) return;

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(tournamentId);

    await this.execute(
      `UPDATE tournament_configs SET ${updates.join(', ')} WHERE tournament_id = ?`,
      params
    );

    if (uuid) {
      await SyncService.addToQueue('tournament_configs', 'UPDATE', { uuid, ...payload });
    }

    dbCache.invalidateTournament(tournamentId);
  }

  static async getTournamentIdsForPlayer(playerId: number): Promise<number[]> {
    const rows = await this.query<{ tournament_id: number }>(
      'SELECT DISTINCT tournament_id FROM tournament_players WHERE player_id = ?',
      [playerId]
    );
    return [...new Set(rows.map((r) => r.tournament_id))];
  }

  // ==========================================
  // Round operations
  // ==========================================
  static async getTournamentRounds(tournamentId: number): Promise<Round[]> {
    const cached = dbCache.get<Round[]>(`tournament:${tournamentId}:rounds`);
    if (cached !== undefined) return cached;
    const data = await this.query<Round>(
      'SELECT * FROM rounds WHERE tournament_id = ? ORDER BY round_number',
      [tournamentId]
    );
    dbCache.set(`tournament:${tournamentId}:rounds`, data);
    return data;
  }

  static async createRound(round: {
    tournament_id: number;
    round_number: number;
    status?: 'pending' | 'in_progress' | 'completed';
    phase?: 'swiss' | 'knockout';
    knockout_stage?: string | null;
  }) {
    const uuid = self.crypto.randomUUID();
    const tournamentUuid = await this.getUuid('tournaments', round.tournament_id);

    const result = await this.execute(
      `INSERT INTO rounds (uuid, tournament_id, round_number, status, phase, knockout_stage) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        uuid,
        round.tournament_id,
        round.round_number,
        round.status || 'pending',
        round.phase || 'swiss',
        round.knockout_stage ?? null,
      ]
    );

    await SyncService.addToQueue('rounds', 'INSERT', {
      uuid,
      round_number: round.round_number,
      status: round.status || 'pending',
      tournament_uuid: tournamentUuid,
      phase: round.phase || 'swiss',
      knockout_stage: round.knockout_stage ?? null,
    });

    dbCache.invalidateTournament(round.tournament_id);
    return result.lastInsertRowid;
  }

  static async updateRound(
    id: number,
    round: {
      status?: 'pending' | 'in_progress' | 'completed';
      started_at?: string;
      completed_at?: string;
    }
  ) {
    const uuid = await this.getUuid('rounds', id);
    if (!uuid) throw new Error(`Round ${id} has no UUID`);

    const updates: string[] = [];
    const params: any[] = [];
    const payload: any = {};

    Object.entries(round).forEach(([key, value]) => {
      if (value !== undefined) {
        updates.push(`${key} = ?`);
        params.push(value);
        payload[key] = value;
      }
    });

    if (updates.length === 0) return;

    params.push(id);
    await this.execute(`UPDATE rounds SET ${updates.join(', ')} WHERE id = ?`, params);

    await SyncService.addToQueue('rounds', 'UPDATE', { uuid, ...payload });
    dbCache.invalidateAllRounds();
  }

  /** Borra partido y filas relacionadas encolando DELETE para sync (Supabase). */
  private static async deleteMatchWithDependentsSync(matchId: number): Promise<void> {
    await this.deleteMatchResults(matchId);
    const mps = await this.query<{ uuid: string }>(
      'SELECT uuid FROM match_players WHERE match_id = ?',
      [matchId]
    );
    await this.execute('DELETE FROM match_players WHERE match_id = ?', [matchId]);
    for (const r of mps) {
      if (r.uuid) {
        await SyncService.addToQueue('match_players', 'DELETE', { uuid: r.uuid });
      }
    }
    await this.deleteMatch(matchId);
  }

  /**
   * Elimina la ronda solo si es la de mayor número, está pending y no hay resultados de partidas “reales”.
   * Los bye generan una sola fila en match_results (victoria automática); eso no bloquea el borrado.
   */
  static async deleteLastPendingRoundWithoutResults(
    roundId: number,
    tournamentId: number
  ): Promise<
    | { deleted: true }
    | { deleted: false; reason: 'not_last' | 'not_pending' | 'has_results' | 'not_found' }
  > {
    const rows = await this.query<{
      id: number;
      round_number: number;
      status: string;
      tournament_id: number;
      max_rn: number;
    }>(
      `SELECT r.id, r.round_number, r.status, r.tournament_id,
        (SELECT MAX(round_number) FROM rounds WHERE tournament_id = r.tournament_id) AS max_rn
       FROM rounds r WHERE r.id = ? AND r.tournament_id = ?`,
      [roundId, tournamentId]
    );
    const row = rows[0];
    if (!row) return { deleted: false, reason: 'not_found' };
    if (row.status !== 'pending') return { deleted: false, reason: 'not_pending' };
    if (row.round_number !== row.max_rn) return { deleted: false, reason: 'not_last' };

    const cntRows = await this.query<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM matches m
       WHERE m.round_id = ?
         AND (SELECT COUNT(*) FROM match_results mr WHERE mr.match_id = m.id) >= 2`,
      [roundId]
    );
    if ((cntRows[0]?.cnt ?? 0) > 0) return { deleted: false, reason: 'has_results' };

    const matches = await this.getRoundMatches(roundId);
    for (const m of matches) {
      if (m.id) await this.deleteMatchWithDependentsSync(m.id);
    }

    const ru = await this.query<{ uuid: string }>('SELECT uuid FROM rounds WHERE id = ?', [
      roundId,
    ]);
    const roundUuid = ru[0]?.uuid;
    await this.execute('DELETE FROM rounds WHERE id = ?', [roundId]);
    if (roundUuid) {
      await SyncService.addToQueue('rounds', 'DELETE', { uuid: roundUuid });
    }

    dbCache.invalidateTournament(tournamentId);
    dbCache.invalidateAllRounds();

    const remaining = await this.query<{ c: number }>(
      'SELECT COUNT(*) AS c FROM rounds WHERE tournament_id = ?',
      [tournamentId]
    );
    if ((remaining[0]?.c ?? 0) === 0) {
      const trow = await this.query<{ status: string }>(
        'SELECT status FROM tournaments WHERE id = ?',
        [tournamentId]
      );
      if (trow[0]?.status === 'in_progress') {
        await this.updateTournament(tournamentId, { status: 'draft' });
      }
    }

    return { deleted: true };
  }

  // ==========================================
  // Match operations
  // ==========================================
  static async getRoundMatches(roundId: number): Promise<Match[]> {
    return this.query<Match>('SELECT * FROM matches WHERE round_id = ? ORDER BY match_number', [
      roundId,
    ]);
  }

  static async createMatch(match: {
    round_id: number;
    match_number: number;
    status?: 'pending' | 'completed';
    first_player_id?: number;
    knockout_bracket_slot?: number;
    series_target_wins?: number;
    is_knockout?: boolean;
    series_meta?: string;
    knockout_match_stage?: string | null;
  }) {
    const uuid = self.crypto.randomUUID();
    const roundUuid = await this.getUuid('rounds', match.round_id);
    const firstPlayerUuid = match.first_player_id
      ? await this.getUuid('players', match.first_player_id)
      : null;

    const result = await this.execute(
      `INSERT INTO matches (uuid, round_id, match_number, status, first_player_id, knockout_bracket_slot, series_target_wins, is_knockout, series_meta, knockout_match_stage) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid,
        match.round_id,
        match.match_number,
        match.status || 'pending',
        match.first_player_id || null,
        match.knockout_bracket_slot ?? null,
        match.series_target_wins ?? 1,
        match.is_knockout ? 1 : 0,
        match.series_meta ?? null,
        match.knockout_match_stage ?? null,
      ]
    );

    await SyncService.addToQueue('matches', 'INSERT', {
      uuid,
      match_number: match.match_number,
      status: match.status || 'pending',
      round_uuid: roundUuid,
      first_player_uuid: firstPlayerUuid,
      knockout_bracket_slot: match.knockout_bracket_slot ?? null,
      series_target_wins: match.series_target_wins ?? 1,
      is_knockout: Boolean(match.is_knockout),
      series_meta: match.series_meta ?? null,
      knockout_match_stage: match.knockout_match_stage ?? null,
    });

    return result.lastInsertRowid;
  }

  static async updateMatch(
    id: number,
    match: {
      status?: 'pending' | 'completed';
      completed_at?: string;
      first_player_id?: number;
      series_winner_id?: number | null;
      series_meta?: string | null;
    }
  ) {
    const uuid = await this.getUuid('matches', id);
    if (!uuid) throw new Error(`Match ${id} has no UUID`);

    const updates: string[] = [];
    const params: any[] = [];
    const payload: any = {};

    if (match.status !== undefined) {
      updates.push('status = ?');
      params.push(match.status);
      payload.status = match.status;
    }
    if (match.completed_at !== undefined) {
      updates.push('completed_at = ?');
      params.push(match.completed_at);
      payload.completed_at = match.completed_at;
    }
    if (match.first_player_id !== undefined) {
      updates.push('first_player_id = ?');
      params.push(match.first_player_id);
      payload.first_player_uuid = await this.getUuid('players', match.first_player_id);
    }
    if (match.series_winner_id !== undefined) {
      updates.push('series_winner_id = ?');
      params.push(match.series_winner_id);
      payload.series_winner_uuid = match.series_winner_id
        ? await this.getUuid('players', match.series_winner_id)
        : null;
    }
    if (match.series_meta !== undefined) {
      updates.push('series_meta = ?');
      params.push(match.series_meta);
      payload.series_meta = match.series_meta;
    }

    if (updates.length === 0) return;

    params.push(id);
    await this.execute(`UPDATE matches SET ${updates.join(', ')} WHERE id = ?`, params);

    await SyncService.addToQueue('matches', 'UPDATE', { uuid, ...payload });
  }

  static async getPlayerStartStatistics(tournamentId: number): Promise<{
    [playerId: number]: { totalStarts: number; lastStartRound: number };
  }> {
    const rounds = await this.query<{ id: number; round_number: number }>(
      'SELECT id, round_number FROM rounds WHERE tournament_id = ?',
      [tournamentId]
    );

    if (rounds.length === 0) return {};

    const roundMap = new Map<number, number>();
    rounds.forEach((r) => roundMap.set(r.id!, r.round_number));
    const roundIds = rounds.map((r) => r.id!);

    const matchesPromises = roundIds.map((roundId) =>
      this.query<{ first_player_id: number | null }>(
        'SELECT first_player_id FROM matches WHERE round_id = ?',
        [roundId]
      )
    );

    const roundsMatches = await Promise.all(matchesPromises);

    const stats: { [playerId: number]: { totalStarts: number; lastStartRound: number } } = {};

    roundsMatches.forEach((matches, index) => {
      const roundNumber = roundMap.get(roundIds[index]) || 0;
      matches.forEach((m) => {
        if (m.first_player_id) {
          if (!stats[m.first_player_id]) {
            stats[m.first_player_id] = { totalStarts: 0, lastStartRound: 0 };
          }
          stats[m.first_player_id].totalStarts += 1;
          if (roundNumber > stats[m.first_player_id].lastStartRound) {
            stats[m.first_player_id].lastStartRound = roundNumber;
          }
        }
      });
    });

    return stats;
  }

  static async getMatchPlayersBatch(matchIds: number[]): Promise<Record<number, Player[]>> {
    if (matchIds.length === 0) return {};

    const placeholders = matchIds.map(() => '?').join(',');
    const rows = await this.query<any>(
      `
        SELECT mp.match_id, p.*
        FROM match_players mp
        JOIN players p ON mp.player_id = p.id
        WHERE mp.match_id IN (${placeholders})
        ORDER BY mp.match_id, mp.id
      `,
      matchIds
    );

    const map: Record<number, Player[]> = {};
    rows.forEach((r) => {
      const matchId = r.match_id;
      if (!map[matchId]) map[matchId] = [];
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { match_id, ...player } = r;
      map[matchId].push(player as Player);
    });
    return map;
  }

  // ==========================================
  // Match Result operations
  // ==========================================
  static async getMatchResults(
    matchId: number,
    tournamentId?: number
  ): Promise<MatchResultWithPlayer[]> {
    const mode =
      tournamentId != null
        ? ((await this.getTournamentConfig(tournamentId))?.player_display_mode ?? 'per_player')
        : null;

    if (mode == null) {
      return this.query<MatchResultWithPlayer>(
        `
          SELECT mr.*, p.name as player_name
          FROM match_results mr
          JOIN players p ON mr.player_id = p.id
          WHERE mr.match_id = ?
          ORDER BY COALESCE(mr.game_number, 1), mr.position
        `,
        [matchId]
      );
    }
    const rows = await this.query<any>(
      `
        SELECT mr.*, p.name, p.bga_username, p.display_preference
        FROM match_results mr
        JOIN players p ON mr.player_id = p.id
        WHERE mr.match_id = ?
        ORDER BY COALESCE(mr.game_number, 1), mr.position
      `,
      [matchId]
    );
    return rows.map((r) => ({
      ...r,
      player_name: getPlayerDisplayName(
        {
          name: r.name ?? '',
          bga_username: r.bga_username ?? null,
          display_preference: r.display_preference ?? null,
        },
        mode
      ),
    }));
  }

  static async getMatchResultsBatch(
    matchIds: number[],
    tournamentId?: number,
    mode?: PlayerDisplayMode
  ): Promise<Record<number, MatchResult[]>> {
    if (matchIds.length === 0) return {};

    const resolvedMode =
      mode ??
      (tournamentId != null
        ? ((await this.getTournamentConfig(tournamentId))?.player_display_mode ?? 'per_player')
        : 'per_player');

    const placeholders = matchIds.map(() => '?').join(',');
    const rows = await this.query<any>(
      `
        SELECT mr.*, p.name, p.bga_username, p.display_preference
        FROM match_results mr
        JOIN players p ON mr.player_id = p.id
        WHERE mr.match_id IN (${placeholders})
        ORDER BY mr.match_id, COALESCE(mr.game_number, 1), mr.position
      `,
      matchIds
    );

    const map: Record<number, MatchResult[]> = {};
    rows.forEach((r) => {
      const matchId = r.match_id;
      if (!map[matchId]) map[matchId] = [];
      map[matchId].push({
        ...r,
        player_name: getPlayerDisplayName(
          {
            name: r.name ?? '',
            bga_username: r.bga_username ?? null,
            display_preference: r.display_preference ?? null,
          },
          resolvedMode
        ),
      });
    });
    return map;
  }

  static async createMatchResult(result: {
    match_id: number;
    player_id: number;
    position: number;
    points: number;
    tournament_points: number;
    game_number?: number;
  }) {
    const uuid = self.crypto.randomUUID();
    const matchUuid = await this.getUuid('matches', result.match_id);
    const playerUuid = await this.getUuid('players', result.player_id);
    const gameNumber = result.game_number ?? 1;

    const res = await this.execute(
      `INSERT INTO match_results (uuid, match_id, player_id, position, points, tournament_points, game_number) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid,
        result.match_id,
        result.player_id,
        result.position,
        result.points,
        result.tournament_points,
        gameNumber,
      ]
    );

    // Auto-enroll if missing
    const match = await this.query<{ tournament_id: number }>(
      'SELECT r.tournament_id FROM matches m JOIN rounds r ON m.round_id = r.id WHERE m.id = ?',
      [result.match_id]
    );
    if (match[0]?.tournament_id) {
      await this.registerPlayerToTournament(match[0].tournament_id, result.player_id);
    }

    await SyncService.addToQueue('match_results', 'INSERT', {
      uuid,
      match_uuid: matchUuid,
      player_uuid: playerUuid,
      position: result.position,
      points: result.points,
      tournament_points: result.tournament_points,
      game_number: gameNumber,
    });

    return res;
  }

  static async deleteMatchResult(resultId: number) {
    const row = await this.query<{ uuid: string }>('SELECT uuid FROM match_results WHERE id = ?', [
      resultId,
    ]);
    const uuid = row[0]?.uuid;

    const res = await this.execute('DELETE FROM match_results WHERE id = ?', [resultId]);

    if (uuid) {
      await SyncService.addToQueue('match_results', 'DELETE', { uuid });
    }
    return res;
  }

  static async deleteMatchResults(matchId: number) {
    // We need UUIDs of deleted results to sync DELETE
    const results = await this.query<{ uuid: string }>(
      'SELECT uuid FROM match_results WHERE match_id = ?',
      [matchId]
    );

    const res = await this.execute('DELETE FROM match_results WHERE match_id = ?', [matchId]);

    // Helper: Bulk deletes to queue? Loop is fine for small scale
    for (const r of results) {
      if (r.uuid) {
        await SyncService.addToQueue('match_results', 'DELETE', { uuid: r.uuid });
      }
    }
    return res;
  }

  static async deleteMatchResultsForGame(matchId: number, gameNumber: number) {
    const results = await this.query<{ uuid: string }>(
      'SELECT uuid FROM match_results WHERE match_id = ? AND game_number = ?',
      [matchId, gameNumber]
    );
    await this.execute('DELETE FROM match_results WHERE match_id = ? AND game_number = ?', [
      matchId,
      gameNumber,
    ]);
    for (const r of results) {
      if (r.uuid) {
        await SyncService.addToQueue('match_results', 'DELETE', { uuid: r.uuid });
      }
    }
  }

  // ==========================================
  // Knockout seeds
  // ==========================================
  static async getKnockoutSeeds(tournamentId: number) {
    return this.query<{ player_id: number; seed: number; name: string }>(
      `SELECT ks.player_id, ks.seed, p.name
       FROM tournament_knockout_seeds ks
       JOIN players p ON p.id = ks.player_id
       WHERE ks.tournament_id = ?
       ORDER BY ks.seed`,
      [tournamentId]
    );
  }

  static async addKnockoutSeed(tournamentId: number, playerId: number, seed: number) {
    const uuid = self.crypto.randomUUID();
    const tournamentUuid = await this.getUuid('tournaments', tournamentId);
    const playerUuid = await this.getUuid('players', playerId);
    await this.execute(
      `INSERT INTO tournament_knockout_seeds (uuid, tournament_id, player_id, seed) VALUES (?, ?, ?, ?)`,
      [uuid, tournamentId, playerId, seed]
    );
    await SyncService.addToQueue('tournament_knockout_seeds', 'INSERT', {
      uuid,
      tournament_uuid: tournamentUuid,
      player_uuid: playerUuid,
      seed,
    });
    dbCache.invalidateTournament(tournamentId);
  }

  static async clearKnockoutSeeds(tournamentId: number) {
    const rows = await this.query<{ uuid: string }>(
      'SELECT uuid FROM tournament_knockout_seeds WHERE tournament_id = ?',
      [tournamentId]
    );
    await this.execute('DELETE FROM tournament_knockout_seeds WHERE tournament_id = ?', [
      tournamentId,
    ]);
    for (const r of rows) {
      if (r.uuid) {
        await SyncService.addToQueue('tournament_knockout_seeds', 'DELETE', { uuid: r.uuid });
      }
    }
    dbCache.invalidateTournament(tournamentId);
  }

  // ==========================================
  // Circuit Standings - SQLite Optimized
  // ==========================================
  static async getCircuitStandings(circuitId: number) {
    // Logic identical to previous SQLite path
    const rows = await this.query<{
      player_id: number;
      name: string;
      bga_username: string | null;
      display_preference: string | null;
      total_points: number;
      tournaments_played: number;
      wins: number;
    }>(
      `
        SELECT 
          p.id as player_id,
          p.name,
          p.bga_username,
          p.display_preference,
          SUM(mr.tournament_points) as total_points,
          COUNT(DISTINCT t.id) as tournaments_played,
          COUNT(DISTINCT CASE WHEN mr.position = 1 THEN mr.match_id END) as wins
        FROM players p
        JOIN tournament_players tp ON p.id = tp.player_id
        JOIN tournaments t ON tp.tournament_id = t.id
        JOIN rounds r ON t.id = r.tournament_id
        JOIN matches m ON r.id = m.round_id
        JOIN match_results mr ON m.id = mr.match_id AND mr.player_id = p.id
        WHERE t.circuit_id = ? AND t.status = 'completed'
        GROUP BY p.id
        ORDER BY total_points DESC, wins DESC
      `,
      [circuitId]
    );
    return rows.map((row) => ({
      player_id: row.player_id,
      player_name: getPlayerDisplayName(
        {
          name: row.name,
          bga_username: row.bga_username ?? undefined,
          display_preference: (row.display_preference as 'name' | 'username') ?? undefined,
        },
        'per_player'
      ),
      total_points: row.total_points,
      tournaments_played: row.tournaments_played,
      wins: row.wins,
    }));
  }

  // ==========================================
  // Tournament Players
  // ==========================================
  static async getTournamentPlayers(
    tournamentId: number
  ): Promise<(Player & { active: boolean; dropout_round: number | null })[]> {
    await this.ensureTournamentPlayersSync(tournamentId);

    return this.query<Player & { active: boolean; dropout_round: number | null }>(
      `
        SELECT p.*, tp.active, tp.dropout_round
        FROM tournament_players tp
        JOIN players p ON tp.player_id = p.id
        WHERE tp.tournament_id = ?
        ORDER BY p.name ASC
      `,
      [tournamentId]
    );
  }

  static async ensureTournamentPlayersSync(tournamentId: number) {
    const rows = await this.query<{ player_id: number }>(
      `
      SELECT DISTINCT mp.player_id
      FROM match_players mp
      JOIN matches m ON mp.match_id = m.id
      JOIN rounds r ON m.round_id = r.id
      WHERE r.tournament_id = ?
        AND NOT EXISTS (
          SELECT 1 FROM tournament_players tp 
          WHERE tp.tournament_id = ? AND tp.player_id = mp.player_id
        )
    `,
      [tournamentId, tournamentId]
    );

    for (const row of rows) {
      await this.registerPlayerToTournament(tournamentId, row.player_id);
    }
  }

  static async registerPlayerToTournament(tournamentId: number, playerId: number) {
    const existing = await this.query<{ id: number }>(
      'SELECT id FROM tournament_players WHERE tournament_id = ? AND player_id = ?',
      [tournamentId, playerId]
    );
    if (existing.length > 0) return;

    const uuid = self.crypto.randomUUID();
    const tournamentUuid = await this.getUuid('tournaments', tournamentId);
    const playerUuid = await this.getUuid('players', playerId);

    const res = await this.execute(
      'INSERT INTO tournament_players (uuid, tournament_id, player_id, active) VALUES (?, ?, ?, ?)',
      [
        uuid,
        tournamentId,
        playerId,
        1, // active default (true)
      ]
    );

    await SyncService.addToQueue('tournament_players', 'INSERT', {
      uuid,
      tournament_uuid: tournamentUuid,
      player_uuid: playerUuid,
      active: true,
    });
    return res;
  }

  static async removePlayerFromTournament(tournamentId: number, playerId: number) {
    // Get UUID before delete to sync
    // BUT wait, unique key is (tournament_id, player_id)
    const row = await this.query<{ uuid: string }>(
      'SELECT uuid FROM tournament_players WHERE tournament_id=? AND player_id=?',
      [tournamentId, playerId]
    );
    const uuid = row[0]?.uuid;

    const res = await this.execute(
      'DELETE FROM tournament_players WHERE tournament_id = ? AND player_id = ?',
      [tournamentId, playerId]
    );

    if (uuid) {
      await SyncService.addToQueue('tournament_players', 'DELETE', { uuid });
    }
    return res;
  }

  static async updateTournamentPlayerStatus(
    tournamentId: number,
    playerId: number,
    updates: { active?: boolean; dropout_round?: number | null }
  ) {
    const row = await this.query<{ uuid: string }>(
      'SELECT uuid FROM tournament_players WHERE tournament_id=? AND player_id=?',
      [tournamentId, playerId]
    );
    const uuid = row[0]?.uuid;
    if (!uuid) throw new Error('Tournament Player UUID not found');

    const setClause = [];
    const params = [];
    const payload: any = {};

    if (updates.active !== undefined) {
      setClause.push('active = ?');
      params.push(updates.active ? 1 : 0);
      payload.active = updates.active;
    }
    if (updates.dropout_round !== undefined) {
      setClause.push('dropout_round = ?');
      params.push(updates.dropout_round);
      payload.dropout_round = updates.dropout_round;
    }

    if (setClause.length === 0) return;

    params.push(tournamentId, playerId);

    const res = await this.execute(
      `UPDATE tournament_players SET ${setClause.join(', ')} WHERE tournament_id = ? AND player_id = ?`,
      params
    );

    await SyncService.addToQueue('tournament_players', 'UPDATE', { uuid, ...payload });
    return res;
  }

  // ==========================================
  // Match Players
  // ==========================================
  static async getMatchPlayers(matchId: number): Promise<Player[]> {
    return this.query<Player>(
      `
        SELECT p.* 
        FROM match_players mp
        JOIN players p ON mp.player_id = p.id
        WHERE mp.match_id = ?
        ORDER BY mp.id
      `,
      [matchId]
    );
  }

  static async addPlayerToMatch(matchId: number, playerId: number) {
    const uuid = self.crypto.randomUUID();
    const matchUuid = await this.getUuid('matches', matchId);
    const playerUuid = await this.getUuid('players', playerId);

    const res = await this.execute(
      'INSERT INTO match_players (uuid, match_id, player_id) VALUES (?, ?, ?)',
      [uuid, matchId, playerId]
    );

    // Auto-enroll if missing
    const match = await this.query<{ tournament_id: number }>(
      'SELECT r.tournament_id FROM matches m JOIN rounds r ON m.round_id = r.id WHERE m.id = ?',
      [matchId]
    );
    if (match[0]?.tournament_id) {
      await this.registerPlayerToTournament(match[0].tournament_id, playerId);
    }

    await SyncService.addToQueue('match_players', 'INSERT', {
      uuid,
      match_uuid: matchUuid,
      player_uuid: playerUuid,
    });
    return res;
  }

  static async removePlayerFromMatch(matchId: number, playerId: number) {
    const row = await this.query<{ uuid: string }>(
      'SELECT uuid FROM match_players WHERE match_id=? AND player_id=?',
      [matchId, playerId]
    );
    const uuid = row[0]?.uuid;

    const res = await this.execute(
      'DELETE FROM match_players WHERE match_id = ? AND player_id = ?',
      [matchId, playerId]
    );

    if (uuid) {
      await SyncService.addToQueue('match_players', 'DELETE', { uuid });
    }
    return res;
  }

  static async setMatchPlayers(matchId: number, playerIds: number[]) {
    // Get existing UUIDs for delete sync
    const existing = await this.query<{ uuid: string }>(
      'SELECT uuid FROM match_players WHERE match_id = ?',
      [matchId]
    );
    for (const row of existing) {
      if (row.uuid) await SyncService.addToQueue('match_players', 'DELETE', { uuid: row.uuid });
    }

    // Delete existing
    await this.execute('DELETE FROM match_players WHERE match_id = ?', [matchId]);

    // Add new ones
    for (const playerId of playerIds) {
      await this.addPlayerToMatch(matchId, playerId);
    }
  }

  static async deleteMatch(matchId: number) {
    const row = await this.query<{ uuid: string }>('SELECT uuid FROM matches WHERE id = ?', [
      matchId,
    ]);
    const uuid = row[0]?.uuid;

    await this.execute('DELETE FROM matches WHERE id = ?', [matchId]);

    if (uuid) {
      await SyncService.addToQueue('matches', 'DELETE', { uuid });
    }
  }

  static async getMatchWithResults(matchId: number): Promise<MatchWithResults | null> {
    const rows = await this.query<Match>(`SELECT * FROM matches WHERE id = ?`, [matchId]);
    if (rows.length === 0 || !rows[0]) return null;
    const results = await this.getMatchResults(matchId);
    return { ...rows[0], results };
  }

  /**
   * Returns a map of player IDs to a set of their historical opponents in the tournament.
   * This is more robust as it uses the match_players table (which is populated on generation)
   * rather than match_results (which is populated on completion).
   */
  static async getTournamentOpponents(tournamentId: number): Promise<Record<number, number[]>> {
    const rows = await this.query<{ match_id: number; player_id: number }>(
      `
      SELECT mp.match_id, mp.player_id
      FROM match_players mp
      JOIN matches m ON mp.match_id = m.id
      JOIN rounds r ON m.round_id = r.id
      WHERE r.tournament_id = ?
      `,
      [tournamentId]
    );

    const matchGroups: Record<number, number[]> = {};
    rows.forEach((row) => {
      if (!matchGroups[row.match_id]) matchGroups[row.match_id] = [];
      matchGroups[row.match_id].push(row.player_id);
    });

    const opponents: Record<number, number[]> = {};
    Object.values(matchGroups).forEach((playerIds) => {
      if (playerIds.length < 2) return; // Bye or single player match

      playerIds.forEach((pid) => {
        if (!opponents[pid]) opponents[pid] = [];
        playerIds.forEach((oppId) => {
          if (pid !== oppId && !opponents[pid].includes(oppId)) {
            opponents[pid].push(oppId);
          }
        });
      });
    });

    return opponents;
  }

  // ==========================================
  // Player Byes (Derived from match_results)
  // ==========================================
  static async getPlayerByes(
    tournamentId: number
  ): Promise<{ player_id: number; round_number: number }[]> {
    return this.query<{ player_id: number; round_number: number }>(
      `
        SELECT mr.player_id, r.round_number
        FROM match_results mr
        JOIN matches m ON mr.match_id = m.id
        JOIN rounds r ON m.round_id = r.id
        WHERE r.tournament_id = ?
          AND m.id IN (
            SELECT match_id FROM match_results
            GROUP BY match_id HAVING COUNT(*) = 1
          )
        ORDER BY r.round_number ASC
      `,
      [tournamentId]
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static async addPlayerBye(_tournamentId: number, _playerId: number, _roundNumber: number) {
    // No-op: Bye is implicitly recorded via createMatchResult for a solo match.
    return { lastInsertRowid: 0, changes: 0 };
  }

  static async hasPlayerReceivedBye(tournamentId: number, playerId: number): Promise<boolean> {
    const byes = await this.getPlayerByes(tournamentId);
    return byes.some((b) => b.player_id === playerId);
  }

  static async getTournamentPlayerCount(tournamentId: number): Promise<number> {
    const rows = await this.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM tournament_players WHERE tournament_id = ? AND active = 1',
      [tournamentId]
    );
    return rows[0]?.count || 0;
  }
}
