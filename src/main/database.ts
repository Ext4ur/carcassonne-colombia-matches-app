import Database from 'better-sqlite3';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'tournament.db');

    // Ensure directory exists
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');

    // Initialize schema
    initializeSchema(db);
  }

  return db;
}

export async function initDatabase() {
  getDatabase();
}

function initializeSchema(database: Database.Database) {
  // Players table
  database.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      bga_username TEXT,
      phone TEXT,
      email TEXT,
      age INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Circuits table
  database.exec(`
    CREATE TABLE IF NOT EXISTS circuits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      start_date DATE,
      end_date DATE,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'finalized')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // Migration: add status column to existing circuits tables (no-op if already present)
  try {
    database.exec(`ALTER TABLE circuits ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`);
  } catch {
    // Column already exists
  }

  // Cities table
  database.exec(`
    CREATE TABLE IF NOT EXISTS cities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Places table (city_id added in migration 7)
  database.exec(`
    CREATE TABLE IF NOT EXISTS places (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tournaments table
  database.exec(`
    CREATE TABLE IF NOT EXISTS tournaments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('qualifier', 'circuit')),
      circuit_id INTEGER,
      date DATE NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'in_progress', 'completed')),
      players_per_match INTEGER NOT NULL DEFAULT 2,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (circuit_id) REFERENCES circuits(id)
    )
  `);

  // Tournament configs table
  database.exec(`
    CREATE TABLE IF NOT EXISTS tournament_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL UNIQUE,
      avoid_rematches INTEGER NOT NULL DEFAULT 1,
      tiebreak_criteria TEXT NOT NULL,
      scoring_system TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
    )
  `);

  // Tournament players (registrations)
  database.exec(`
    CREATE TABLE IF NOT EXISTS tournament_players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      player_id INTEGER NOT NULL,
      registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(tournament_id, player_id),
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
    )
  `);

  // Rounds table
  database.exec(`
    CREATE TABLE IF NOT EXISTS rounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      round_number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed')),
      started_at DATETIME,
      completed_at DATETIME,
      UNIQUE(tournament_id, round_number),
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
    )
  `);

  // Matches table
  database.exec(`
    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id INTEGER NOT NULL,
      match_number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'completed')),
      completed_at DATETIME,
      UNIQUE(round_id, match_number),
      FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE
    )
  `);

  // Match players table (jugadores asignados a cada partida)
  database.exec(`
    CREATE TABLE IF NOT EXISTS match_players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER NOT NULL,
      player_id INTEGER NOT NULL,
      UNIQUE(match_id, player_id),
      FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
    )
  `);

  // Match results table
  database.exec(`
    CREATE TABLE IF NOT EXISTS match_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER NOT NULL,
      player_id INTEGER NOT NULL,
      position INTEGER NOT NULL,
      points INTEGER NOT NULL,
      tournament_points REAL NOT NULL,
      UNIQUE(match_id, player_id),
      FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
    )
  `);

  // Player byes table (historial de byes por jugador)
  database.exec(`
    CREATE TABLE IF NOT EXISTS player_byes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      player_id INTEGER NOT NULL,
      round_number INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(tournament_id, player_id, round_number),
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
    )
  `);

  // Create indexes
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_tournament_players_tournament ON tournament_players(tournament_id);
    CREATE INDEX IF NOT EXISTS idx_tournament_players_player ON tournament_players(player_id);
    CREATE INDEX IF NOT EXISTS idx_rounds_tournament ON rounds(tournament_id);
    CREATE INDEX IF NOT EXISTS idx_rounds_tournament_round ON rounds(tournament_id, round_number);
    CREATE INDEX IF NOT EXISTS idx_matches_round ON matches(round_id);
    CREATE INDEX IF NOT EXISTS idx_match_results_match ON match_results(match_id);
    CREATE INDEX IF NOT EXISTS idx_match_results_player ON match_results(player_id);
    CREATE INDEX IF NOT EXISTS idx_tournaments_circuit ON tournaments(circuit_id);
    CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
    CREATE INDEX IF NOT EXISTS idx_match_players_match ON match_players(match_id);
    CREATE INDEX IF NOT EXISTS idx_match_players_player ON match_players(player_id);
    CREATE INDEX IF NOT EXISTS idx_player_byes_tournament ON player_byes(tournament_id);
    CREATE INDEX IF NOT EXISTS idx_player_byes_player ON player_byes(player_id);
  `);

  // Run migrations to add new columns to existing tables
  runMigrations(database);
}

function runMigrations(database: Database.Database) {
  // Migration 1: Add number_of_rounds to tournaments
  try {
    database.exec(`ALTER TABLE tournaments ADD COLUMN number_of_rounds INTEGER`);
  } catch (error: any) {
    // Column might already exist, ignore error
    const errorMsg = error.message || '';
    if (!errorMsg.includes('duplicate column name') && !errorMsg.includes('duplicate column')) {
      console.warn('Migration 1 warning:', errorMsg);
    }
  }

  // Migration 2: Add first_player_id to matches
  try {
    database.exec(`ALTER TABLE matches ADD COLUMN first_player_id INTEGER REFERENCES players(id)`);
  } catch (error: any) {
    // Column might already exist, ignore error
    const errorMsg = error.message || '';
    if (!errorMsg.includes('duplicate column name') && !errorMsg.includes('duplicate column')) {
      console.warn('Migration 2 warning:', errorMsg);
    }
  }

  // Migration 3: Add bye_selection to tournament_configs
  try {
    database.exec(`ALTER TABLE tournament_configs ADD COLUMN bye_selection TEXT DEFAULT 'worst'`);
  } catch (error: any) {
    // Column might already exist, ignore error
    const errorMsg = error.message || '';
    if (!errorMsg.includes('duplicate column name') && !errorMsg.includes('duplicate column')) {
      console.warn('Migration 3 warning:', errorMsg);
    }
  }

  // Migration 4: Add display_preference to players
  try {
    database.exec(
      `ALTER TABLE players ADD COLUMN display_preference TEXT DEFAULT 'name' CHECK(display_preference IN ('name', 'username'))`
    );
  } catch (error: any) {
    const errorMsg = error.message || '';
    if (!errorMsg.includes('duplicate column name') && !errorMsg.includes('duplicate column')) {
      console.warn('Migration 4 warning:', errorMsg);
    }
  }

  // Migration 5: Add player_display_mode to tournament_configs
  try {
    database.exec(
      `ALTER TABLE tournament_configs ADD COLUMN player_display_mode TEXT DEFAULT 'per_player' CHECK(player_display_mode IN ('per_player', 'names_only', 'usernames_only'))`
    );
  } catch (error: any) {
    const errorMsg = error.message || '';
    if (!errorMsg.includes('duplicate column name') && !errorMsg.includes('duplicate column')) {
      console.warn('Migration 5 warning:', errorMsg);
    }
  }

  // Migration 6: Places and tournament place_id
  try {
    database.exec(
      `INSERT INTO places (name) SELECT 'Online' WHERE NOT EXISTS (SELECT 1 FROM places LIMIT 1)`
    );
    database.exec(`ALTER TABLE tournaments ADD COLUMN place_id INTEGER REFERENCES places(id)`);
    database.exec(
      `UPDATE tournaments SET place_id = (SELECT id FROM places WHERE name = 'Online' LIMIT 1) WHERE place_id IS NULL`
    );
    // SQLite does not support ALTER COLUMN to add NOT NULL; app will enforce place_id on create/update
  } catch (error: any) {
    const errorMsg = error.message || '';
    if (!errorMsg.includes('duplicate column name') && !errorMsg.includes('duplicate column')) {
      console.warn('Migration 6 warning:', errorMsg);
    }
  }

  // Migration 7: Cities and place city_id
  try {
    database.exec(
      `INSERT INTO cities (name) SELECT 'Bogotá' WHERE NOT EXISTS (SELECT 1 FROM cities WHERE name = 'Bogotá')`
    );
    database.exec(
      `INSERT INTO cities (name) SELECT 'Chía' WHERE NOT EXISTS (SELECT 1 FROM cities WHERE name = 'Chía')`
    );
    database.exec(
      `INSERT INTO cities (name) SELECT 'Medellín' WHERE NOT EXISTS (SELECT 1 FROM cities WHERE name = 'Medellín')`
    );
    database.exec(
      `INSERT INTO cities (name) SELECT 'Cali' WHERE NOT EXISTS (SELECT 1 FROM cities WHERE name = 'Cali')`
    );
    database.exec(
      `INSERT INTO cities (name) SELECT 'Ibagué' WHERE NOT EXISTS (SELECT 1 FROM cities WHERE name = 'Ibagué')`
    );
    database.exec(
      `INSERT INTO cities (name) SELECT 'Neiva' WHERE NOT EXISTS (SELECT 1 FROM cities WHERE name = 'Neiva')`
    );
    database.exec(`ALTER TABLE places ADD COLUMN city_id INTEGER REFERENCES cities(id)`);
    database.exec(
      `UPDATE places SET city_id = (SELECT id FROM cities WHERE name = 'Bogotá' LIMIT 1) WHERE city_id IS NULL`
    );
  } catch (error: any) {
    const errorMsg = error.message || '';
    if (!errorMsg.includes('duplicate column name') && !errorMsg.includes('duplicate column')) {
      console.warn('Migration 7 warning:', errorMsg);
    }
  }
}

export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}
