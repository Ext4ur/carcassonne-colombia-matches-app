// Database service for interacting with database through API client
import { getApiClient } from '@api/clients/clientFactory';
import { DB_CONFIG, DEFAULT_PLACE_NAME } from '@constants';
import * as dbCache from './dbCache';
import { getPlayerDisplayName } from '@utils/playerDisplayName';

export class DatabaseService {
  private static getClient() {
    return getApiClient();
  }

  /** Cliente real (Supabase/SQLite); si hay wrapper de conteo, lo usa para acceder a .client en Supabase */
  private static getRawClient(): any {
    const client = this.getClient();
    return (client as any)._client ?? client;
  }

  static async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    const client = this.getClient();
    return client.query<T>(sql, params);
  }

  static async execute(sql: string, params?: any[]): Promise<{ lastInsertRowid: number; changes: number }> {
    const client = this.getClient();
    return client.execute(sql, params);
  }

  static async transaction(queries: Array<{ sql: string; params?: any[] }>): Promise<any[]> {
    const client = this.getClient();
    return client.transaction(queries);
  }

  // Player operations
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
    const result = await this.execute(
      `INSERT INTO players (name, bga_username, display_preference, phone, email, age) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [player.name, player.bga_username || null, player.display_preference || 'name', player.phone || null, player.email || null, player.age || null]
    );
    dbCache.invalidate(dbCache.LIST_KEYS.players);
    return result.lastInsertRowid;
  }

  static async updatePlayer(id: number, player: {
    name?: string;
    bga_username?: string;
    display_preference?: 'name' | 'username';
    phone?: string;
    email?: string;
    age?: number;
  }) {
    const updates: string[] = [];
    const params: any[] = [];

    if (player.name !== undefined) {
      updates.push('name = ?');
      params.push(player.name);
    }
    if (player.bga_username !== undefined) {
      updates.push('bga_username = ?');
      params.push(player.bga_username);
    }
    if (player.display_preference !== undefined) {
      updates.push('display_preference = ?');
      params.push(player.display_preference);
    }
    if (player.phone !== undefined) {
      updates.push('phone = ?');
      params.push(player.phone);
    }
    if (player.email !== undefined) {
      updates.push('email = ?');
      params.push(player.email);
    }
    if (player.age !== undefined) {
      updates.push('age = ?');
      params.push(player.age);
    }

    if (updates.length === 0) return;

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    await this.execute(
      `UPDATE players SET ${updates.join(', ')} WHERE id = ?`,
      params
    );
    dbCache.invalidate(dbCache.LIST_KEYS.players);
  }

  static async deletePlayer(id: number) {
    const result = await this.execute('DELETE FROM players WHERE id = ?', [id]);
    dbCache.invalidate(dbCache.LIST_KEYS.players);
    return result;
  }

  // Circuit operations
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
    const result = await this.execute(
      `INSERT INTO circuits (name, description, start_date, end_date, status) 
       VALUES (?, ?, ?, ?, ?)`,
      [circuit.name, circuit.description || null, circuit.start_date || null, circuit.end_date || null, circuit.status || 'active']
    );
    dbCache.invalidate(dbCache.LIST_KEYS.circuits);
    return result.lastInsertRowid;
  }

  static async updateCircuit(id: number, circuit: {
    name?: string;
    description?: string;
    start_date?: string;
    end_date?: string;
    status?: 'active' | 'finalized';
  }) {
    const updates: string[] = [];
    const params: any[] = [];

    if (circuit.name !== undefined) {
      updates.push('name = ?');
      params.push(circuit.name);
    }
    if (circuit.description !== undefined) {
      updates.push('description = ?');
      params.push(circuit.description);
    }
    if (circuit.start_date !== undefined) {
      updates.push('start_date = ?');
      params.push(circuit.start_date);
    }
    if (circuit.end_date !== undefined) {
      updates.push('end_date = ?');
      params.push(circuit.end_date);
    }
    if (circuit.status !== undefined) {
      updates.push('status = ?');
      params.push(circuit.status);
    }

    if (updates.length === 0) return;

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    await this.execute(
      `UPDATE circuits SET ${updates.join(', ')} WHERE id = ?`,
      params
    );
    dbCache.invalidate(dbCache.LIST_KEYS.circuits);
  }

  /** Tournaments of a circuit (completed only), ordered by date for "paradas" / stops. */
  static async getCircuitTournaments(circuitId: number) {
    const isSupabase = DB_CONFIG.mode === 'remote';
    if (isSupabase) {
      const tournaments = await this.query(
        `SELECT * FROM tournaments WHERE circuit_id = ? AND status = ? ORDER BY date ASC, id ASC`,
        [circuitId, 'completed']
      );
      if (tournaments.length === 0) return [];
      const placeIds = [...new Set((tournaments as any[]).map((t: any) => t.place_id).filter(Boolean))];
      const places = placeIds.length ? await this.query('SELECT * FROM places WHERE id IN (' + placeIds.map(() => '?').join(',') + ')', placeIds) : [];
      const placesMap = new Map((places as any[]).map((p: any) => [p.id, p]));
      return (tournaments as any[]).map((t: any) => ({ ...t, place_name: t.place_id ? (placesMap.get(t.place_id)?.name || null) : null }));
    }
    return this.query(
      `SELECT t.*, p.name as place_name FROM tournaments t LEFT JOIN places p ON t.place_id = p.id WHERE t.circuit_id = ? AND t.status = ? ORDER BY t.date ASC, t.id ASC`,
      [circuitId, 'completed']
    );
  }

  static async deleteCircuit(id: number) {
    const result = await this.execute('DELETE FROM circuits WHERE id = ?', [id]);
    dbCache.invalidate(dbCache.LIST_KEYS.circuits);
    return result;
  }

  // City operations
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
    const result = await this.execute(
      'INSERT INTO cities (name) VALUES (?)',
      [city.name.trim()]
    );
    dbCache.invalidate(dbCache.LIST_KEYS.cities);
    return result.lastInsertRowid;
  }

  static async updateCity(id: number, city: { name?: string }) {
    if (city.name === undefined) return;
    await this.execute('UPDATE cities SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [city.name.trim(), id]);
    dbCache.invalidate(dbCache.LIST_KEYS.cities);
    dbCache.invalidate(dbCache.LIST_KEYS.places);
  }

  static async deleteCity(id: number) {
    const inUse = await this.query<{ count: number }>('SELECT COUNT(*) as count FROM places WHERE city_id = ?', [id]);
    if (inUse[0]?.count && inUse[0].count > 0) {
      throw new Error('No se puede eliminar la ciudad: hay lugares que la usan.');
    }
    await this.execute('DELETE FROM cities WHERE id = ?', [id]);
    dbCache.invalidate(dbCache.LIST_KEYS.cities);
    dbCache.invalidate(dbCache.LIST_KEYS.places);
  }

  // Place operations
  static async getAllPlaces() {
    const cached = dbCache.get(dbCache.LIST_KEYS.places);
    if (cached !== undefined) return cached;
    const isSupabase = DB_CONFIG.mode === 'remote';
    let data: any[];
    if (isSupabase) {
      const places = await this.query('SELECT * FROM places ORDER BY name');
      const cities = await this.query('SELECT * FROM cities');
      const citiesMap = new Map(cities.map((c: any) => [c.id, c]));
      data = places.map((p: any) => ({
        ...p,
        city_name: p.city_id ? (citiesMap.get(p.city_id)?.name || null) : null,
      }));
    } else {
      data = await this.query(
        'SELECT p.*, c.name as city_name FROM places p LEFT JOIN cities c ON p.city_id = c.id ORDER BY p.name'
      );
    }
    dbCache.set(dbCache.LIST_KEYS.places, data);
    return data;
  }

  static async getPlaceById(id: number) {
    const isSupabase = DB_CONFIG.mode === 'remote';
    if (isSupabase) {
      const results = await this.query('SELECT * FROM places WHERE id = ?', [id]);
      const place = results[0] || null;
      if (!place) return null;
      if (place.city_id) {
        const cities = await this.query('SELECT * FROM cities WHERE id = ?', [place.city_id]);
        return { ...place, city_name: cities[0]?.name ?? null };
      }
      return { ...place, city_name: null };
    }
    const results = await this.query(
      'SELECT p.*, c.name as city_name FROM places p LEFT JOIN cities c ON p.city_id = c.id WHERE p.id = ?',
      [id]
    );
    return results[0] || null;
  }

  static async getDefaultPlaceId(): Promise<number> {
    const results = await this.query<{ id: number }>('SELECT id FROM places WHERE name = ? LIMIT 1', [DEFAULT_PLACE_NAME]);
    const row = results[0];
    if (!row) throw new Error(`Lugar por defecto "${DEFAULT_PLACE_NAME}" no encontrado. Ejecuta las migraciones.`);
    return row.id;
  }

  static async createPlace(place: { name: string; city_id: number }) {
    const result = await this.execute(
      'INSERT INTO places (name, city_id) VALUES (?, ?)',
      [place.name.trim(), place.city_id]
    );
    dbCache.invalidate(dbCache.LIST_KEYS.places);
    return result.lastInsertRowid;
  }

  static async updatePlace(id: number, place: { name?: string; city_id?: number }) {
    const updates: string[] = [];
    const params: any[] = [];
    if (place.name !== undefined) {
      updates.push('name = ?');
      params.push(place.name.trim());
    }
    if (place.city_id !== undefined) {
      updates.push('city_id = ?');
      params.push(place.city_id);
    }
    if (updates.length === 0) return;
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);
    await this.execute(`UPDATE places SET ${updates.join(', ')} WHERE id = ?`, params);
    dbCache.invalidate(dbCache.LIST_KEYS.places);
  }

  static async deletePlace(id: number) {
    const inUse = await this.query<{ count: number }>('SELECT COUNT(*) as count FROM tournaments WHERE place_id = ?', [id]);
    if (inUse[0]?.count && inUse[0].count > 0) {
      throw new Error('No se puede eliminar el lugar: hay torneos que lo usan.');
    }
    await this.execute('DELETE FROM places WHERE id = ?', [id]);
    dbCache.invalidate(dbCache.LIST_KEYS.places);
  }

  // Tournament operations
  static async getAllTournaments() {
    const cached = dbCache.get(dbCache.LIST_KEYS.tournaments);
    if (cached !== undefined) return cached;
    const isSupabase = DB_CONFIG.mode === 'remote';
    let data: any[];
    if (isSupabase) {
      const tournaments = await this.query(`
        SELECT * FROM tournaments 
        ORDER BY date DESC, created_at DESC
      `);
      const circuits = await this.query('SELECT * FROM circuits');
      const places = await this.query('SELECT * FROM places');
      const circuitsMap = new Map(circuits.map((c: any) => [c.id, c]));
      const placesMap = new Map(places.map((p: any) => [p.id, p]));
      data = tournaments.map((tournament: any) => ({
        ...tournament,
        circuit_name: tournament.circuit_id ? (circuitsMap.get(tournament.circuit_id)?.name || null) : null,
        place_name: tournament.place_id ? (placesMap.get(tournament.place_id)?.name || null) : null,
      }));
    } else {
      data = await this.query(`
        SELECT t.*, c.name as circuit_name, p.name as place_name 
        FROM tournaments t 
        LEFT JOIN circuits c ON t.circuit_id = c.id 
        LEFT JOIN places p ON t.place_id = p.id 
        ORDER BY t.date DESC, t.created_at DESC
      `);
    }
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

    const isSupabase = DB_CONFIG.mode === 'remote';
    let result: any;
    if (isSupabase) {
      const results = await this.query('SELECT * FROM tournaments WHERE id = ?', [id]);
      const tournament = results[0] || null;
      if (!tournament) {
        result = null;
      } else {
        const [circuits, places] = await Promise.all([
          tournament.circuit_id ? this.query('SELECT * FROM circuits WHERE id = ?', [tournament.circuit_id]) : Promise.resolve([]),
          tournament.place_id ? this.query('SELECT * FROM places WHERE id = ?', [tournament.place_id]) : Promise.resolve([]),
        ]);
        result = {
          ...tournament,
          circuit_name: circuits[0]?.name ?? null,
          place_name: places[0]?.name ?? null,
        };
      }
    } else {
      const results = await this.query(`
        SELECT t.*, c.name as circuit_name, p.name as place_name 
        FROM tournaments t 
        LEFT JOIN circuits c ON t.circuit_id = c.id 
        LEFT JOIN places p ON t.place_id = p.id 
        WHERE t.id = ?
      `, [id]);
      result = results[0] || null;
    }
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
    const placeId = tournament.place_id ?? await this.getDefaultPlaceId();
    const result = await this.execute(
      `INSERT INTO tournaments (name, type, circuit_id, date, players_per_match, number_of_rounds, place_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [tournament.name, tournament.type, tournament.circuit_id || null, tournament.date, tournament.players_per_match, tournament.number_of_rounds || null, placeId]
    );
    dbCache.invalidate(dbCache.LIST_KEYS.tournaments);
    return result.lastInsertRowid;
  }

  static async updateTournament(id: number, tournament: {
    name?: string;
    date?: string;
    status?: 'draft' | 'in_progress' | 'completed';
    players_per_match?: number;
    number_of_rounds?: number;
    place_id?: number;
  }) {
    const updates: string[] = [];
    const params: any[] = [];

    if (tournament.name !== undefined) {
      updates.push('name = ?');
      params.push(tournament.name);
    }
    if (tournament.date !== undefined) {
      updates.push('date = ?');
      params.push(tournament.date);
    }
    if (tournament.status !== undefined) {
      updates.push('status = ?');
      params.push(tournament.status);
    }
    if (tournament.players_per_match !== undefined) {
      updates.push('players_per_match = ?');
      params.push(tournament.players_per_match);
    }
    if (tournament.number_of_rounds !== undefined) {
      updates.push('number_of_rounds = ?');
      params.push(tournament.number_of_rounds);
    }
    if (tournament.place_id !== undefined) {
      updates.push('place_id = ?');
      params.push(tournament.place_id);
    }

    if (updates.length === 0) return;

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    await this.execute(
      `UPDATE tournaments SET ${updates.join(', ')} WHERE id = ?`,
      params
    );
    dbCache.invalidateTournament(id);
    dbCache.invalidate(dbCache.LIST_KEYS.tournaments);
  }

  static async deleteTournament(id: number) {
    await this.execute('DELETE FROM tournaments WHERE id = ?', [id]);
    dbCache.invalidateTournament(id);
    dbCache.invalidate(dbCache.LIST_KEYS.tournaments);
  }

  // Tournament config operations
  static async getTournamentConfig(tournamentId: number) {
    const cached = dbCache.get(`tournament:${tournamentId}:config`);
    if (cached !== undefined) return cached;
    const results = await this.query('SELECT * FROM tournament_configs WHERE tournament_id = ?', [tournamentId]);
    let config: any = null;
    if (results[0]) {
      config = {
        ...results[0],
        tiebreak_criteria: JSON.parse(results[0].tiebreak_criteria),
        scoring_system: JSON.parse(results[0].scoring_system),
        avoid_rematches: Boolean(results[0].avoid_rematches),
      };
      if (results[0].bye_selection) {
        (config as any).bye_selection = results[0].bye_selection;
      }
      if (results[0].player_display_mode) {
        (config as any).player_display_mode = results[0].player_display_mode;
      } else {
        (config as any).player_display_mode = 'per_player';
      }
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
    await this.execute(
      `INSERT INTO tournament_configs (tournament_id, avoid_rematches, tiebreak_criteria, scoring_system, bye_selection, player_display_mode) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        config.tournament_id,
        config.avoid_rematches ? 1 : 0,
        JSON.stringify(config.tiebreak_criteria),
        JSON.stringify(config.scoring_system),
        config.bye_selection || 'worst',
        config.player_display_mode || 'per_player',
      ]
    );
    dbCache.invalidateTournament(config.tournament_id);
  }

  static async updateTournamentConfig(tournamentId: number, config: {
    avoid_rematches?: boolean;
    tiebreak_criteria?: any[];
    scoring_system?: any;
    bye_selection?: 'worst' | 'random' | 'round_robin';
    player_display_mode?: 'per_player' | 'names_only' | 'usernames_only';
  }) {
    const updates: string[] = [];
    const params: any[] = [];

    if (config.avoid_rematches !== undefined) {
      updates.push('avoid_rematches = ?');
      params.push(config.avoid_rematches ? 1 : 0);
    }
    if (config.tiebreak_criteria !== undefined) {
      updates.push('tiebreak_criteria = ?');
      params.push(JSON.stringify(config.tiebreak_criteria));
    }
    if (config.scoring_system !== undefined) {
      updates.push('scoring_system = ?');
      params.push(JSON.stringify(config.scoring_system));
    }
    if (config.bye_selection !== undefined) {
      updates.push('bye_selection = ?');
      params.push(config.bye_selection);
    }
    if (config.player_display_mode !== undefined) {
      updates.push('player_display_mode = ?');
      params.push(config.player_display_mode);
    }

    if (updates.length === 0) return;

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(tournamentId);

    await this.execute(
      `UPDATE tournament_configs SET ${updates.join(', ')} WHERE tournament_id = ?`,
      params
    );
    dbCache.invalidateTournament(tournamentId);
  }

  /** Get tournament IDs where a player is registered (single query, for player stats). */
  static async getTournamentIdsForPlayer(playerId: number): Promise<number[]> {
    const rows = await this.query<{ tournament_id: number }>(
      'SELECT DISTINCT tournament_id FROM tournament_players WHERE player_id = ?',
      [playerId]
    );
    return [...new Set(rows.map((r) => r.tournament_id))];
  }

  // Tournament player registration
  static async getTournamentPlayers(tournamentId: number) {
    const isSupabase = DB_CONFIG.mode === 'remote';
    if (isSupabase) {
      const tournamentPlayers = await this.query(
        'SELECT * FROM tournament_players WHERE tournament_id = ? ORDER BY registered_at',
        [tournamentId]
      );
      if (tournamentPlayers.length === 0) return [];
      const playerIds = tournamentPlayers.map((tp: any) => tp.player_id);
      const raw = this.getRawClient() as any;
      if (playerIds.length > 0 && raw.client) {
        const { data: players, error } = await raw.client
          .from('players')
          .select('*')
          .in('id', playerIds);
        
        if (error) throw new Error(`Error fetching players: ${error.message}`);
        
        const playersMap = new Map((players || []).map((p: any) => [p.id, p]));
        
        return tournamentPlayers.map((tp: any) => {
          const player = playersMap.get(tp.player_id);
          return player
            ? { ...player, registered_at: tp.registered_at }
            : { id: tp.player_id, name: null, bga_username: null, phone: null, email: null, age: null, registered_at: tp.registered_at };
        });
      }
      // Fallback: return registration data with placeholder player fields (like getMatchResults)
      return tournamentPlayers.map((tp: any) => ({
        id: tp.player_id,
        name: null,
        bga_username: null,
        phone: null,
        email: null,
        age: null,
        registered_at: tp.registered_at,
      }));
    } else {
      // Para SQLite: usar la query original con JOIN
      return this.query(`
        SELECT p.*, tp.registered_at 
        FROM tournament_players tp 
        JOIN players p ON tp.player_id = p.id 
        WHERE tp.tournament_id = ? 
        ORDER BY tp.registered_at
      `, [tournamentId]);
    }
  }

  static async registerPlayerToTournament(tournamentId: number, playerId: number) {
    return this.execute(
      'INSERT INTO tournament_players (tournament_id, player_id) VALUES (?, ?)',
      [tournamentId, playerId]
    );
  }

  static async unregisterPlayerFromTournament(tournamentId: number, playerId: number) {
    return this.execute(
      'DELETE FROM tournament_players WHERE tournament_id = ? AND player_id = ?',
      [tournamentId, playerId]
    );
  }

  // Round operations
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
    const result = await this.execute(
      `INSERT INTO rounds (tournament_id, round_number, status) 
       VALUES (?, ?, ?)`,
      [round.tournament_id, round.round_number, round.status || 'pending']
    );
    dbCache.invalidateTournament(round.tournament_id);
    return result.lastInsertRowid;
  }

  static async updateRound(id: number, round: {
    status?: 'pending' | 'in_progress' | 'completed';
    started_at?: string;
    completed_at?: string;
  }) {
    const updates: string[] = [];
    const params: any[] = [];

    if (round.status !== undefined) {
      updates.push('status = ?');
      params.push(round.status);
    }
    if (round.started_at !== undefined) {
      updates.push('started_at = ?');
      params.push(round.started_at);
    }
    if (round.completed_at !== undefined) {
      updates.push('completed_at = ?');
      params.push(round.completed_at);
    }

    if (updates.length === 0) return;

    params.push(id);
    await this.execute(
      `UPDATE rounds SET ${updates.join(', ')} WHERE id = ?`,
      params
    );
    dbCache.invalidateAllRounds();
  }

  // Match operations
  static async getRoundMatches(roundId: number) {
    return this.query(
      'SELECT * FROM matches WHERE round_id = ? ORDER BY match_number',
      [roundId]
    );
  }

  static async createMatch(match: {
    round_id: number;
    match_number: number;
    status?: 'pending' | 'completed';
  }) {
    const result = await this.execute(
      `INSERT INTO matches (round_id, match_number, status) 
       VALUES (?, ?, ?)`,
      [match.round_id, match.match_number, match.status || 'pending']
    );
    return result.lastInsertRowid;
  }

  static async updateMatch(id: number, match: {
    status?: 'pending' | 'completed';
    completed_at?: string;
    first_player_id?: number;
  }) {
    const updates: string[] = [];
    const params: any[] = [];

    if (match.status !== undefined) {
      updates.push('status = ?');
      params.push(match.status);
    }
    if (match.completed_at !== undefined) {
      updates.push('completed_at = ?');
      params.push(match.completed_at);
    }
    if (match.first_player_id !== undefined) {
      updates.push('first_player_id = ?');
      params.push(match.first_player_id);
    }

    if (updates.length === 0) return;

    params.push(id);
    await this.execute(
      `UPDATE matches SET ${updates.join(', ')} WHERE id = ?`,
      params
    );
  }

  // Match result operations. When tournamentId is provided, player_name is resolved using tournament player_display_mode.
  static async getMatchResults(matchId: number, tournamentId?: number) {
    const mode = tournamentId != null ? (await this.getTournamentConfig(tournamentId))?.player_display_mode ?? 'per_player' : null;
    const isSupabase = DB_CONFIG.mode === 'remote';
    if (isSupabase) {
      const matchResults = await this.query(
        'SELECT * FROM match_results WHERE match_id = ? ORDER BY position',
        [matchId]
      );
      if (matchResults.length === 0) return [];
      const playerIds = [...new Set(matchResults.map((mr: any) => mr.player_id))];
      if (playerIds.length > 0) {
        let playersMap = new Map<number, any>();
        const raw = this.getRawClient() as any;
        if (raw?.client) {
          const { data: players, error } = await raw.client
            .from('players')
            .select('*')
            .in('id', playerIds);
          if (error) throw new Error(`Error fetching players: ${error.message}`);
          playersMap = new Map((players || []).map((p: any) => [p.id, p]));
        } else {
          for (const pid of playerIds) {
            const p = await this.getPlayerById(pid);
            if (p) playersMap.set(pid, p);
          }
        }
        return matchResults.map((mr: any) => {
          const player = playersMap.get(mr.player_id);
          const player_name = mode != null && player
            ? getPlayerDisplayName(
                { name: player.name, bga_username: player.bga_username, display_preference: player.display_preference },
                mode
              )
            : (player?.name ?? null);
          return { ...mr, player_name };
        });
      }
      return matchResults;
    } else {
      if (mode == null) {
        return this.query(`
          SELECT mr.*, p.name as player_name
          FROM match_results mr
          JOIN players p ON mr.player_id = p.id
          WHERE mr.match_id = ?
          ORDER BY mr.position
        `, [matchId]);
      }
      const rows = await this.query<Record<string, unknown>>(`
        SELECT mr.*, p.name, p.bga_username, p.display_preference
        FROM match_results mr
        JOIN players p ON mr.player_id = p.id
        WHERE mr.match_id = ?
        ORDER BY mr.position
      `, [matchId]);
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
  }

  static async createMatchResult(result: {
    match_id: number;
    player_id: number;
    position: number;
    points: number;
    tournament_points: number;
  }) {
    return this.execute(
      `INSERT INTO match_results (match_id, player_id, position, points, tournament_points) 
       VALUES (?, ?, ?, ?, ?)`,
      [result.match_id, result.player_id, result.position, result.points, result.tournament_points]
    );
  }

  static async deleteMatchResults(matchId: number) {
    return this.execute('DELETE FROM match_results WHERE match_id = ?', [matchId]);
  }

  // Circuit standings
  static async getCircuitStandings(circuitId: number) {
    const isSupabase = DB_CONFIG.mode === 'remote';
    if (isSupabase) {
      const tournaments = await this.query(
        'SELECT * FROM tournaments WHERE circuit_id = ? AND status = ?',
        [circuitId, 'completed']
      );
      if (tournaments.length === 0) return [];
      const tournamentIds = tournaments.map((t: any) => t.id);
      const raw = this.getRawClient() as any;
      if (!raw.client) {
        throw new Error('Supabase client not available');
      }
      const { data: tournamentPlayers, error: tpError } = await raw.client
        .from('tournament_players')
        .select('*')
        .in('tournament_id', tournamentIds);
      
      if (tpError) throw new Error(`Error fetching tournament players: ${tpError.message}`);
      
      const playerIds = [...new Set((tournamentPlayers || []).map((tp: any) => tp.player_id))];
      if (playerIds.length === 0) return [];
      
      // 3. Obtener todos los jugadores
      const { data: players, error: playersError } = await raw.client
        .from('players')
        .select('*')
        .in('id', playerIds);
      
      if (playersError) throw new Error(`Error fetching players: ${playersError.message}`);
      
      const playersMap = new Map((players || []).map((p: any) => [p.id, p]));
      
      // 4. Obtener todas las rondas de estos torneos
      const { data: rounds, error: roundsError } = await raw.client
        .from('rounds')
        .select('*')
        .in('tournament_id', tournamentIds);
      
      if (roundsError) throw new Error(`Error fetching rounds: ${roundsError.message}`);
      
      const roundIds = (rounds || []).map((r: any) => r.id);
      
      if (roundIds.length === 0) {
        // Si no hay rondas, retornar jugadores con estadísticas en 0
        return (players || []).map((p: any) => ({
          player_id: p.id,
          player_name: getPlayerDisplayName({ name: p.name, bga_username: p.bga_username, display_preference: p.display_preference }, 'per_player'),
          total_points: 0,
          tournaments_played: new Set((tournamentPlayers || []).filter((tp: any) => tp.player_id === p.id).map((tp: any) => tp.tournament_id)).size,
          wins: 0,
        }));
      }
      
      // 5. Obtener todos los matches de estas rondas
      const { data: matches, error: matchesError } = await raw.client
        .from('matches')
        .select('*')
        .in('round_id', roundIds);
      
      if (matchesError) throw new Error(`Error fetching matches: ${matchesError.message}`);
      
      const matchIds = (matches || []).map((m: any) => m.id);
      
      if (matchIds.length === 0) {
        return (players || []).map((p: any) => ({
          player_id: p.id,
          player_name: getPlayerDisplayName({ name: p.name, bga_username: p.bga_username, display_preference: p.display_preference }, 'per_player'),
          total_points: 0,
          tournaments_played: new Set((tournamentPlayers || []).filter((tp: any) => tp.player_id === p.id).map((tp: any) => tp.tournament_id)).size,
          wins: 0,
        }));
      }
      
      // 6. Obtener todos los resultados de estos matches
      const { data: matchResults, error: resultsError } = await raw.client
        .from('match_results')
        .select('*')
        .in('match_id', matchIds);
      
      if (resultsError) throw new Error(`Error fetching match results: ${resultsError.message}`);
      
      // 7. Calcular estadísticas por jugador
      const standingsMap = new Map<number, {
        player_id: number;
        player_name: string;
        total_points: number;
        tournaments_played: Set<number>;
        wins: Set<number>;
      }>();
      
      // Inicializar todos los jugadores
      playerIds.forEach((playerId: number) => {
        const player = playersMap.get(playerId);
        if (player) {
          standingsMap.set(playerId, {
            player_id: playerId,
            player_name: getPlayerDisplayName({ name: player.name, bga_username: player.bga_username, display_preference: player.display_preference }, 'per_player'),
            total_points: 0,
            tournaments_played: new Set(),
            wins: new Set(),
          });
        }
      });
      
      // Procesar resultados
      (matchResults || []).forEach((mr: any) => {
        const standing = standingsMap.get(mr.player_id);
        if (standing) {
          standing.total_points += mr.tournament_points || 0;
          
          // Encontrar el torneo de este match
          const match = (matches || []).find((m: any) => m.id === mr.match_id);
          if (match) {
            const round = (rounds || []).find((r: any) => r.id === match.round_id);
            if (round) {
              standing.tournaments_played.add(round.tournament_id);
              
              // Si ganó (position = 1), contar como win
              if (mr.position === 1) {
                standing.wins.add(mr.match_id);
              }
            }
          }
        }
      });
      
      // Convertir a array y ordenar
      const standings = Array.from(standingsMap.values()).map(standing => ({
        player_id: standing.player_id,
        player_name: standing.player_name,
        total_points: standing.total_points,
        tournaments_played: standing.tournaments_played.size,
        wins: standing.wins.size,
      }));
      
      // Ordenar por total_points DESC, wins DESC
      standings.sort((a, b) => {
        if (b.total_points !== a.total_points) {
          return b.total_points - a.total_points;
        }
        return b.wins - a.wins;
      });
      
      return standings;
    } else {
      // Para SQLite: JOINs y resolver player_name con preferencia del jugador
      const rows = await this.query<{ player_id: number; name: string; bga_username: string | null; display_preference: string | null; total_points: number; tournaments_played: number; wins: number }>(`
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
      `, [circuitId]);
      return rows.map((row) => ({
        player_id: row.player_id,
        player_name: getPlayerDisplayName(
          { name: row.name, bga_username: row.bga_username ?? undefined, display_preference: (row.display_preference as 'name' | 'username') ?? undefined },
          'per_player'
        ),
        total_points: row.total_points,
        tournaments_played: row.tournaments_played,
        wins: row.wins,
      }));
    }
  }

  // Match players operations
  static async getMatchPlayers(matchId: number) {
    const isSupabase = DB_CONFIG.mode === 'remote';
    if (isSupabase) {
      const matchPlayers = await this.query(
        'SELECT * FROM match_players WHERE match_id = ?',
        [matchId]
      );
      if (matchPlayers.length === 0) return [];
      const playerIds = [...new Set(matchPlayers.map((mp: any) => mp.player_id))];
      const raw = this.getRawClient() as any;
      if (playerIds.length > 0 && raw.client) {
        const { data: players, error } = await raw.client
          .from('players')
          .select('*')
          .in('id', playerIds)
          .order('name', { ascending: true });
        
        if (error) throw new Error(`Error fetching players: ${error.message}`);
        
        return players || [];
      }
      // Fallback: return match_players data as minimal player objects (like getMatchResults)
      return matchPlayers.map((mp: any) => ({
        id: mp.player_id,
        name: null,
        bga_username: null,
        phone: null,
        email: null,
        age: null,
      }));
    } else {
      // Para SQLite: usar la query original con JOIN
      return this.query(`
        SELECT p.* 
        FROM match_players mp
        JOIN players p ON mp.player_id = p.id
        WHERE mp.match_id = ?
        ORDER BY p.name
      `, [matchId]);
    }
  }

  static async addPlayerToMatch(matchId: number, playerId: number) {
    return this.execute(
      'INSERT INTO match_players (match_id, player_id) VALUES (?, ?)',
      [matchId, playerId]
    );
  }

  static async removePlayerFromMatch(matchId: number, playerId: number) {
    return this.execute(
      'DELETE FROM match_players WHERE match_id = ? AND player_id = ?',
      [matchId, playerId]
    );
  }

  static async setMatchPlayers(matchId: number, playerIds: number[]) {
    // Delete existing
    await this.execute('DELETE FROM match_players WHERE match_id = ?', [matchId]);
    // Add new ones
    for (const playerId of playerIds) {
      await this.addPlayerToMatch(matchId, playerId);
    }
  }

  // Player byes operations
  static async getPlayerByes(tournamentId: number) {
    return this.query(`
      SELECT player_id, round_number
      FROM player_byes
      WHERE tournament_id = ?
    `, [tournamentId]);
  }

  static async addPlayerBye(tournamentId: number, playerId: number, roundNumber: number) {
    return this.execute(
      'INSERT INTO player_byes (tournament_id, player_id, round_number) VALUES (?, ?, ?)',
      [tournamentId, playerId, roundNumber]
    );
  }

  static async hasPlayerReceivedBye(tournamentId: number, playerId: number): Promise<boolean> {
    const results = await this.query(
      'SELECT COUNT(*) as count FROM player_byes WHERE tournament_id = ? AND player_id = ?',
      [tournamentId, playerId]
    );
    return results[0]?.count > 0;
  }
}

