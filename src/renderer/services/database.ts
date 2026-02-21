/* eslint-disable @typescript-eslint/no-explicit-any */
// Database service for interacting with local SQLite database and syncing with Supabase
import { SqliteClient } from '../api/clients/SqliteClient';
import { DEFAULT_PLACE_NAME } from '../constants';
import * as dbCache from './dbCache';
import { getPlayerDisplayName } from '@utils/playerDisplayName';
import { SyncService } from './syncService';

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

  static async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    return this.client.query<T>(sql, params);
  }

  static async execute(
    sql: string,
    params?: any[]
  ): Promise<{ lastInsertRowid: number; changes: number }> {
    return this.client.execute(sql, params);
  }

  static async transaction(queries: Array<{ sql: string; params?: any[] }>): Promise<any[]> {
    return this.client.transaction(queries);
  }

  // ==========================================
  // Player operations
  // ==========================================
  static async getAllPlayers() {
    const cached = dbCache.get(dbCache.LIST_KEYS.players);
    if (cached !== undefined) return cached;
    const data = await this.query('SELECT * FROM players ORDER BY name');
    dbCache.set(dbCache.LIST_KEYS.players, data);
    return data;
  }

  static async getPlayerById(id: number) {
    const results = await this.query('SELECT * FROM players WHERE id = ?', [id]);
    return results[0] || null;
  }

  static async searchPlayers(searchTerm: string) {
    const term = `%${searchTerm}%`;
    return this.query(
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

    const result = await this.execute('DELETE FROM players WHERE id = ?', [id]);

    // Sync Queue
    await SyncService.addToQueue('players', 'DELETE', { uuid });

    dbCache.invalidate(dbCache.LIST_KEYS.players);
    return result;
  }

  // ==========================================
  // Circuit operations
  // ==========================================
  static async getAllCircuits() {
    const cached = dbCache.get(dbCache.LIST_KEYS.circuits);
    if (cached !== undefined) return cached;
    const data = await this.query('SELECT * FROM circuits ORDER BY created_at DESC');
    dbCache.set(dbCache.LIST_KEYS.circuits, data);
    return data;
  }

  static async getCircuitByName(name: string) {
    const results = await this.query('SELECT * FROM circuits WHERE name = ?', [name]);
    return results[0] || null;
  }

  static async getCircuitById(id: number) {
    const results = await this.query('SELECT * FROM circuits WHERE id = ?', [id]);
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
  static async getCircuitTournaments(circuitId: number) {
    return this.query(
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

    const result = await this.execute('DELETE FROM circuits WHERE id = ?', [id]);

    await SyncService.addToQueue('circuits', 'DELETE', { uuid });
    dbCache.invalidate(dbCache.LIST_KEYS.circuits);
    return result;
  }

  // ==========================================
  // City operations
  // ==========================================
  static async getAllCities() {
    const cached = dbCache.get(dbCache.LIST_KEYS.cities);
    if (cached !== undefined) return cached;
    const data = await this.query('SELECT * FROM cities ORDER BY name');
    dbCache.set(dbCache.LIST_KEYS.cities, data);
    return data;
  }

  static async getCityById(id: number) {
    const results = await this.query('SELECT * FROM cities WHERE id = ?', [id]);
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
  static async getAllPlaces() {
    const cached = dbCache.get(dbCache.LIST_KEYS.places);
    if (cached !== undefined) return cached;
    const data = await this.query(
      'SELECT p.*, c.name as city_name FROM places p LEFT JOIN cities c ON p.city_id = c.id ORDER BY p.name'
    );
    dbCache.set(dbCache.LIST_KEYS.places, data);
    return data;
  }

  static async getPlaceById(id: number) {
    const results = await this.query(
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
      throw new Error('No se puede eliminar el lugar: hay torneos que lo usan.');
    }
    await this.execute('DELETE FROM places WHERE id = ?', [id]);

    await SyncService.addToQueue('places', 'DELETE', { uuid });
    dbCache.invalidate(dbCache.LIST_KEYS.places);
  }

  // ==========================================
  // Tournament operations
  // ==========================================
  static async getAllTournaments() {
    const cached = dbCache.get(dbCache.LIST_KEYS.tournaments);
    if (cached !== undefined) return cached;

    const data = await this.query(`
        SELECT t.*, c.name as circuit_name, p.name as place_name 
        FROM tournaments t 
        LEFT JOIN circuits c ON t.circuit_id = c.id 
        LEFT JOIN places p ON t.place_id = p.id 
        ORDER BY t.date DESC, t.created_at DESC
      `);

    dbCache.set(dbCache.LIST_KEYS.tournaments, data);
    return data;
  }

  static async getTournamentByNameAndDate(name: string, date: string) {
    return this.query('SELECT * FROM tournaments WHERE name = ? AND date = ?', [name, date]);
  }

  static async getPlayerByBGAUsername(bgaUsername: string) {
    if (!bgaUsername) return [];
    return this.query('SELECT * FROM players WHERE bga_username = ?', [bgaUsername]);
  }

  static async getTournamentById(id: number) {
    const cached = dbCache.get(`tournament:${id}`);
    if (cached !== undefined) return cached;

    const results = await this.query(
      `
        SELECT t.*, c.name as circuit_name, p.name as place_name 
        FROM tournaments t 
        LEFT JOIN circuits c ON t.circuit_id = c.id 
        LEFT JOIN places p ON t.place_id = p.id 
        WHERE t.id = ?
      `,
      [id]
    );
    const result = results[0] || null;
    dbCache.set(`tournament:${id}`, result);
    return result;
  }

  static async createTournament(tournament: {
    name: string;
    type: 'qualifier' | 'circuit';
    circuit_id?: number;
    date: string;
    players_per_match: number;
    number_of_rounds?: number;
    place_id?: number;
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
      `INSERT INTO tournaments (uuid, name, type, circuit_id, date, players_per_match, number_of_rounds, place_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid,
        tournament.name,
        tournament.type,
        tournament.circuit_id || null,
        tournament.date,
        tournament.players_per_match,
        tournament.number_of_rounds || null,
        placeId,
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
    });

    dbCache.invalidate(dbCache.LIST_KEYS.tournaments);
    return result.lastInsertRowid;
  }

  static async updateTournament(
    id: number,
    tournament: {
      name?: string;
      date?: string;
      status?: 'draft' | 'in_progress' | 'completed';
      players_per_match?: number;
      number_of_rounds?: number;
      place_id?: number;
    }
  ) {
    const uuid = await this.getUuid('tournaments', id);
    if (!uuid) throw new Error(`Tournament ${id} has no UUID`);

    const updates: string[] = [];
    const params: any[] = [];
    const payload: any = {};

    Object.entries(tournament).forEach(([key, value]) => {
      if (value !== undefined) {
        updates.push(`${key} = ?`);
        params.push(value);
      }
    });

    if (updates.length === 0) return;

    // Resolve updated FKs
    if (tournament.place_id) {
      payload.place_uuid = await this.getUuid('places', tournament.place_id);
    }
    // Build payload without IDs
    if (tournament.name !== undefined) payload.name = tournament.name;
    if (tournament.date !== undefined) payload.date = tournament.date;
    if (tournament.status !== undefined) payload.status = tournament.status;
    if (tournament.players_per_match !== undefined)
      payload.players_per_match = tournament.players_per_match;
    if (tournament.number_of_rounds !== undefined)
      payload.number_of_rounds = tournament.number_of_rounds;

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    await this.execute(`UPDATE tournaments SET ${updates.join(', ')} WHERE id = ?`, params);

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
  static async getTournamentConfig(tournamentId: number) {
    const cached = dbCache.get(`tournament:${tournamentId}:config`);
    if (cached !== undefined) return cached;
    const results = await this.query('SELECT * FROM tournament_configs WHERE tournament_id = ?', [
      tournamentId,
    ]);
    let config: any = null;
    if (results[0]) {
      config = {
        ...results[0],
        tiebreak_criteria: JSON.parse(results[0].tiebreak_criteria),
        scoring_system: JSON.parse(results[0].scoring_system),
        avoid_rematches: Boolean(results[0].avoid_rematches),
        bye_selection: results[0].bye_selection || 'worst',
        player_display_mode: results[0].player_display_mode || 'per_player',
      };
    }
    dbCache.set(`tournament:${tournamentId}:config`, config);
    return config;
  }

  static async createTournamentConfig(config: {
    tournament_id: number;
    avoid_rematches: boolean;
    tiebreak_criteria: any[];
    scoring_system: any;
    bye_selection?: 'worst' | 'random' | 'round_robin';
    player_display_mode?: 'per_player' | 'names_only' | 'usernames_only';
  }) {
    const uuid = self.crypto.randomUUID();
    const tournamentUuid = await this.getUuid('tournaments', config.tournament_id);

    await this.execute(
      `INSERT INTO tournament_configs (uuid, tournament_id, avoid_rematches, tiebreak_criteria, scoring_system, bye_selection, player_display_mode) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid,
        config.tournament_id,
        config.avoid_rematches ? 1 : 0,
        JSON.stringify(config.tiebreak_criteria),
        JSON.stringify(config.scoring_system),
        config.bye_selection || 'worst',
        config.player_display_mode || 'per_player',
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
    });

    dbCache.invalidateTournament(config.tournament_id);
  }

  static async updateTournamentConfig(
    tournamentId: number,
    config: {
      avoid_rematches?: boolean;
      tiebreak_criteria?: any[];
      scoring_system?: any;
      bye_selection?: 'worst' | 'random' | 'round_robin';
      player_display_mode?: 'per_player' | 'names_only' | 'usernames_only';
    }
  ) {
    // Determine config UUID via tournament configs?
    // We added uuid to tournament_configs.
    // Query it first.
    const res = await this.query('SELECT uuid FROM tournament_configs WHERE tournament_id=?', [
      tournamentId,
    ]);
    const uuid = res[0]?.uuid;
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
  static async getTournamentRounds(tournamentId: number) {
    const cached = dbCache.get<any[]>(`tournament:${tournamentId}:rounds`);
    if (cached !== undefined) return cached;
    const data = await this.query(
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
  }) {
    const uuid = self.crypto.randomUUID();
    const tournamentUuid = await this.getUuid('tournaments', round.tournament_id);

    const result = await this.execute(
      `INSERT INTO rounds (uuid, tournament_id, round_number, status) 
       VALUES (?, ?, ?, ?)`,
      [uuid, round.tournament_id, round.round_number, round.status || 'pending']
    );

    await SyncService.addToQueue('rounds', 'INSERT', {
      uuid,
      round_number: round.round_number,
      status: round.status || 'pending',
      tournament_uuid: tournamentUuid,
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

  // ==========================================
  // Match operations
  // ==========================================
  static async getRoundMatches(roundId: number) {
    return this.query('SELECT * FROM matches WHERE round_id = ? ORDER BY match_number', [roundId]);
  }

  static async createMatch(match: {
    round_id: number;
    match_number: number;
    status?: 'pending' | 'completed';
    first_player_id?: number;
  }) {
    const uuid = self.crypto.randomUUID();
    const roundUuid = await this.getUuid('rounds', match.round_id);
    const firstPlayerUuid = match.first_player_id
      ? await this.getUuid('players', match.first_player_id)
      : null;

    const result = await this.execute(
      `INSERT INTO matches (uuid, round_id, match_number, status, first_player_id) 
       VALUES (?, ?, ?, ?, ?)`,
      [
        uuid,
        match.round_id,
        match.match_number,
        match.status || 'pending',
        match.first_player_id || null,
      ]
    );

    await SyncService.addToQueue('matches', 'INSERT', {
      uuid,
      match_number: match.match_number,
      status: match.status || 'pending',
      round_uuid: roundUuid,
      first_player_uuid: firstPlayerUuid,
    });

    return result.lastInsertRowid;
  }

  static async updateMatch(
    id: number,
    match: {
      status?: 'pending' | 'completed';
      completed_at?: string;
      first_player_id?: number;
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
      this.query<{ first_player_id: number }>(
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

  // ==========================================
  // Match Result operations
  // ==========================================
  static async getMatchResults(matchId: number, tournamentId?: number) {
    const mode =
      tournamentId != null
        ? ((await this.getTournamentConfig(tournamentId))?.player_display_mode ?? 'per_player')
        : null;

    if (mode == null) {
      return this.query(
        `
          SELECT mr.*, p.name as player_name
          FROM match_results mr
          JOIN players p ON mr.player_id = p.id
          WHERE mr.match_id = ?
          ORDER BY mr.position
        `,
        [matchId]
      );
    }
    const rows = await this.query<Record<string, unknown>>(
      `
        SELECT mr.*, p.name, p.bga_username, p.display_preference
        FROM match_results mr
        JOIN players p ON mr.player_id = p.id
        WHERE mr.match_id = ?
        ORDER BY mr.position
      `,
      [matchId]
    );
    return rows.map((r) => ({
      match_id: r.match_id,
      player_id: r.player_id,
      position: r.position,
      points: r.points,
      tournament_points: r.tournament_points,
      player_name: getPlayerDisplayName(
        {
          name: (r.name as string) ?? '',
          bga_username: (r.bga_username as string | null) ?? null,
          display_preference: (r.display_preference as 'name' | 'username' | null) ?? null,
        },
        mode
      ),
    }));
  }

  static async createMatchResult(result: {
    match_id: number;
    player_id: number;
    position: number;
    points: number;
    tournament_points: number;
  }) {
    const uuid = self.crypto.randomUUID();
    const matchUuid = await this.getUuid('matches', result.match_id);
    const playerUuid = await this.getUuid('players', result.player_id);

    const res = await this.execute(
      `INSERT INTO match_results (uuid, match_id, player_id, position, points, tournament_points) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        uuid,
        result.match_id,
        result.player_id,
        result.position,
        result.points,
        result.tournament_points,
      ]
    );

    await SyncService.addToQueue('match_results', 'INSERT', {
      uuid,
      match_uuid: matchUuid,
      player_uuid: playerUuid,
      position: result.position,
      points: result.points,
      tournament_points: result.tournament_points,
    });

    return res;
  }

  static async deleteMatchResults(matchId: number) {
    // We need UUIDs of deleted results to sync DELETE
    const results = await this.query('SELECT uuid FROM match_results WHERE match_id = ?', [
      matchId,
    ]);

    const res = await this.execute('DELETE FROM match_results WHERE match_id = ?', [matchId]);

    // Helper: Bulk deletes to queue? Loop is fine for small scale
    for (const r of results) {
      if (r.uuid) {
        await SyncService.addToQueue('match_results', 'DELETE', { uuid: r.uuid });
      }
    }
    return res;
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
  static async getTournamentPlayers(tournamentId: number) {
    return this.query(
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

  static async registerPlayerToTournament(tournamentId: number, playerId: number) {
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
    const row = await this.query(
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
    const row = await this.query(
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
  static async getMatchPlayers(matchId: number) {
    return this.query(
      `
        SELECT p.* 
        FROM match_players mp
        JOIN players p ON mp.player_id = p.id
        WHERE mp.match_id = ?
        ORDER BY p.name
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

    await SyncService.addToQueue('match_players', 'INSERT', {
      uuid,
      match_uuid: matchUuid,
      player_uuid: playerUuid,
    });
    return res;
  }

  static async removePlayerFromMatch(matchId: number, playerId: number) {
    const row = await this.query(
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
    const existing = await this.query<any>('SELECT uuid FROM match_players WHERE match_id = ?', [
      matchId,
    ]);
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

  // ==========================================
  // Player Byes
  // ==========================================
  static async getPlayerByes(tournamentId: number) {
    return this.query(
      `
      SELECT player_id, round_number
      FROM player_byes
      WHERE tournament_id = ?
    `,
      [tournamentId]
    );
  }

  static async addPlayerBye(tournamentId: number, playerId: number, roundNumber: number) {
    const uuid = self.crypto.randomUUID();
    const tournamentUuid = await this.getUuid('tournaments', tournamentId);
    const playerUuid = await this.getUuid('players', playerId);

    const res = await this.execute(
      'INSERT INTO player_byes (uuid, tournament_id, player_id, round_number) VALUES (?, ?, ?, ?)',
      [uuid, tournamentId, playerId, roundNumber]
    );

    await SyncService.addToQueue('player_byes', 'INSERT', {
      uuid,
      tournament_uuid: tournamentUuid,
      player_uuid: playerUuid,
      round_number: roundNumber,
    });
    return res;
  }

  static async hasPlayerReceivedBye(tournamentId: number, playerId: number): Promise<boolean> {
    const results = await this.query(
      'SELECT COUNT(*) as count FROM player_byes WHERE tournament_id = ? AND player_id = ?',
      [tournamentId, playerId]
    );
    return results[0]?.count > 0;
  }
}
