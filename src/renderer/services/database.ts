// Database service for interacting with SQLite through Electron IPC

export class DatabaseService {
  static async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    if (!window.electronAPI) {
      throw new Error('Electron API not available');
    }
    return window.electronAPI.db.query(sql, params);
  }

  static async execute(sql: string, params?: any[]): Promise<{ lastInsertRowid: number; changes: number }> {
    if (!window.electronAPI) {
      throw new Error('Electron API not available');
    }
    return window.electronAPI.db.execute(sql, params);
  }

  static async transaction(queries: Array<{ sql: string; params?: any[] }>): Promise<any[]> {
    if (!window.electronAPI) {
      throw new Error('Electron API not available');
    }
    return window.electronAPI.db.transaction(queries);
  }

  // Player operations
  static async getAllPlayers() {
    return this.query('SELECT * FROM players ORDER BY name');
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
    phone?: string;
    email?: string;
    age?: number;
  }) {
    const result = await this.execute(
      `INSERT INTO players (name, bga_username, phone, email, age) 
       VALUES (?, ?, ?, ?, ?)`,
      [player.name, player.bga_username || null, player.phone || null, player.email || null, player.age || null]
    );
    return result.lastInsertRowid;
  }

  static async updatePlayer(id: number, player: {
    name?: string;
    bga_username?: string;
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
  }

  static async deletePlayer(id: number) {
    return this.execute('DELETE FROM players WHERE id = ?', [id]);
  }

  // Circuit operations
  static async getAllCircuits() {
    return this.query('SELECT * FROM circuits ORDER BY created_at DESC');
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
  }) {
    const result = await this.execute(
      `INSERT INTO circuits (name, description, start_date, end_date) 
       VALUES (?, ?, ?, ?)`,
      [circuit.name, circuit.description || null, circuit.start_date || null, circuit.end_date || null]
    );
    return result.lastInsertRowid;
  }

  static async updateCircuit(id: number, circuit: {
    name?: string;
    description?: string;
    start_date?: string;
    end_date?: string;
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

    if (updates.length === 0) return;

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    await this.execute(
      `UPDATE circuits SET ${updates.join(', ')} WHERE id = ?`,
      params
    );
  }

  static async deleteCircuit(id: number) {
    return this.execute('DELETE FROM circuits WHERE id = ?', [id]);
  }

  // Tournament operations
  static async getAllTournaments() {
    return this.query(`
      SELECT t.*, c.name as circuit_name 
      FROM tournaments t 
      LEFT JOIN circuits c ON t.circuit_id = c.id 
      ORDER BY t.date DESC, t.created_at DESC
    `);
  }

  static async getTournamentByNameAndDate(name: string, date: string) {
    return this.query('SELECT * FROM tournaments WHERE name = ? AND date = ?', [name, date]);
  }

  static async getPlayerByBGAUsername(bgaUsername: string) {
    if (!bgaUsername) return [];
    return this.query('SELECT * FROM players WHERE bga_username = ?', [bgaUsername]);
  }

  static async getTournamentById(id: number) {
    const results = await this.query(`
      SELECT t.*, c.name as circuit_name 
      FROM tournaments t 
      LEFT JOIN circuits c ON t.circuit_id = c.id 
      WHERE t.id = ?
    `, [id]);
    return results[0] || null;
  }

  static async createTournament(tournament: {
    name: string;
    type: 'qualifier' | 'circuit';
    circuit_id?: number;
    date: string;
    players_per_match: number;
    number_of_rounds?: number;
  }) {
    const result = await this.execute(
      `INSERT INTO tournaments (name, type, circuit_id, date, players_per_match, number_of_rounds) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [tournament.name, tournament.type, tournament.circuit_id || null, tournament.date, tournament.players_per_match, tournament.number_of_rounds || null]
    );
    return result.lastInsertRowid;
  }

  static async updateTournament(id: number, tournament: {
    name?: string;
    status?: 'draft' | 'in_progress' | 'completed';
    players_per_match?: number;
    number_of_rounds?: number;
  }) {
    const updates: string[] = [];
    const params: any[] = [];

    if (tournament.name !== undefined) {
      updates.push('name = ?');
      params.push(tournament.name);
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

    if (updates.length === 0) return;

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    await this.execute(
      `UPDATE tournaments SET ${updates.join(', ')} WHERE id = ?`,
      params
    );
  }

  static async deleteTournament(id: number) {
    return this.execute('DELETE FROM tournaments WHERE id = ?', [id]);
  }

  // Tournament config operations
  static async getTournamentConfig(tournamentId: number) {
    const results = await this.query('SELECT * FROM tournament_configs WHERE tournament_id = ?', [tournamentId]);
    if (results[0]) {
      const config = {
        ...results[0],
        tiebreak_criteria: JSON.parse(results[0].tiebreak_criteria),
        scoring_system: JSON.parse(results[0].scoring_system),
        avoid_rematches: Boolean(results[0].avoid_rematches),
      };
      // Add bye_selection if it exists in the config (stored as JSON or separate field)
      if (results[0].bye_selection) {
        (config as any).bye_selection = results[0].bye_selection;
      }
      return config;
    }
    return null;
  }

  static async createTournamentConfig(config: {
    tournament_id: number;
    avoid_rematches: boolean;
    tiebreak_criteria: any[];
    scoring_system: any;
    bye_selection?: 'worst' | 'random' | 'round_robin';
  }) {
    return this.execute(
      `INSERT INTO tournament_configs (tournament_id, avoid_rematches, tiebreak_criteria, scoring_system, bye_selection) 
       VALUES (?, ?, ?, ?, ?)`,
      [
        config.tournament_id,
        config.avoid_rematches ? 1 : 0,
        JSON.stringify(config.tiebreak_criteria),
        JSON.stringify(config.scoring_system),
        config.bye_selection || 'worst',
      ]
    );
  }

  static async updateTournamentConfig(tournamentId: number, config: {
    avoid_rematches?: boolean;
    tiebreak_criteria?: any[];
    scoring_system?: any;
    bye_selection?: 'worst' | 'random' | 'round_robin';
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

    if (updates.length === 0) return;

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(tournamentId);

    await this.execute(
      `UPDATE tournament_configs SET ${updates.join(', ')} WHERE tournament_id = ?`,
      params
    );
  }

  // Tournament player registration
  static async getTournamentPlayers(tournamentId: number) {
    return this.query(`
      SELECT p.*, tp.registered_at 
      FROM tournament_players tp 
      JOIN players p ON tp.player_id = p.id 
      WHERE tp.tournament_id = ? 
      ORDER BY tp.registered_at
    `, [tournamentId]);
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
    return this.query(
      'SELECT * FROM rounds WHERE tournament_id = ? ORDER BY round_number',
      [tournamentId]
    );
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

  // Match result operations
  static async getMatchResults(matchId: number) {
    return this.query(`
      SELECT mr.*, p.name as player_name 
      FROM match_results mr 
      JOIN players p ON mr.player_id = p.id 
      WHERE mr.match_id = ? 
      ORDER BY mr.position
    `, [matchId]);
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
    return this.query(`
      SELECT 
        p.id as player_id,
        p.name as player_name,
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
      GROUP BY p.id, p.name
      ORDER BY total_points DESC, wins DESC
    `, [circuitId]);
  }

  // Match players operations
  static async getMatchPlayers(matchId: number) {
    return this.query(`
      SELECT p.* 
      FROM match_players mp
      JOIN players p ON mp.player_id = p.id
      WHERE mp.match_id = ?
      ORDER BY p.name
    `, [matchId]);
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

