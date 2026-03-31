import Database from 'better-sqlite3';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    const env = (process.env.APP_ENV || 'colombia').toLowerCase();
    const dbName = env === 'international' ? 'tournament_int.db' : 'tournament_co.db';
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, dbName);
    console.log(`[DB] Environment: ${env}`);
    console.log(`[DB] Database filename: ${dbName}`);
    console.log(`[DB] Full database path: ${dbPath}`);

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
  try {
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
      bye_selection TEXT DEFAULT 'worst',
      player_display_mode TEXT DEFAULT 'per_player',
      pairing_algorithm TEXT DEFAULT 'greedy' CHECK(pairing_algorithm IN ('greedy', 'backtracking')),
      buchholz_bye_mode TEXT DEFAULT 'legacy',
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

    // Sync Meta table (for tracking last sync position)
    database.exec(`
    CREATE TABLE IF NOT EXISTS sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
  } catch (error: any) {
    console.error('Error in initializeSchema:', error);
  }
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
    database.exec(`ALTER TABLE tournaments ADD COLUMN place_id INTEGER REFERENCES places(id)`);
  } catch (error: any) {
    const errorMsg = error.message || '';
    if (!errorMsg.includes('duplicate column name') && !errorMsg.includes('duplicate column')) {
      console.warn('Migration 6.1 warning:', errorMsg);
    }
  }

  // Migration 7: Cities, Places and city_id
  try {
    let hasCityId = false;
    try {
      const columns = database.pragma(`table_info(places)`) as any[];
      if (columns.some((col) => col.name === 'city_id')) {
        hasCityId = true;
      }
    } catch {
      /* ignore */
    }

    if (!hasCityId) {
      database.exec(`ALTER TABLE places ADD COLUMN city_id INTEGER REFERENCES cities(id)`);
    }

    // Migration 7 just ensures city_id exists in places
    console.log(`[DB] Migration 7: Ensuring city_id exists in places`);
  } catch (error: any) {
    const errorMsg = error.message || '';
    console.warn('Migration 7 warning:', errorMsg);
  }

  // Migration 8: Offline Mode - Sync Queue and UUIDs
  try {
    // 1. Create Sync Queue Table
    database.exec(`
      CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL,
        operation TEXT NOT NULL CHECK(operation IN ('INSERT', 'UPDATE', 'DELETE')),
        payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'failed')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        retry_count INTEGER DEFAULT 0,
        last_error TEXT
      )
    `);

    // 2. Add UUID columns to synchronize tables
    const syncTables = [
      'players',
      'tournaments',
      'rounds',
      'matches',
      'circuits',
      'places',
      'cities',
      'match_results',
      'match_players',
      'tournament_players',
      'tournament_configs',
      'player_byes',
    ];

    for (const table of syncTables) {
      let hasUuid = false;
      try {
        const columns = database.pragma(`table_info(${table})`) as any[];
        if (columns.some((col) => col.name === 'uuid')) {
          hasUuid = true;
        }
      } catch {
        /* ignore */
      }

      if (!hasUuid) {
        try {
          database.exec(`ALTER TABLE ${table} ADD COLUMN uuid TEXT`);
          database.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_${table}_uuid ON ${table}(uuid)`);

          // 3. Backfill UUIDs for existing records
          const rows = database.prepare(`SELECT id FROM ${table} WHERE uuid IS NULL`).all() as {
            id: number;
          }[];
          if (rows.length > 0) {
            const updateStmt = database.prepare(`UPDATE ${table} SET uuid = ? WHERE id = ?`);
            const updateTransaction = database.transaction((items: { id: number }[]) => {
              for (const item of items) {
                updateStmt.run(randomUUID(), item.id);
              }
            });
            updateTransaction(rows);
            console.log(`Migration 8: Added UUIDs to ${rows.length} rows in ${table}`);
          }
        } catch (error: any) {
          console.warn(`Migration 8 warning (${table}):`, error.message);
        }
      }
    }
  } catch (error: any) {
    console.warn('Migration 8 critical warning:', error.message);
  }

  // Migration 9: Add active and dropout_round to tournament_players
  try {
    database.exec(`ALTER TABLE tournament_players ADD COLUMN active INTEGER DEFAULT 1`);
  } catch (error: any) {
    const errorMsg = error.message || '';
    if (!errorMsg.includes('duplicate column name') && !errorMsg.includes('duplicate column')) {
      console.warn('Migration 9.1 warning:', errorMsg);
    }
  }

  try {
    database.exec(`ALTER TABLE tournament_players ADD COLUMN dropout_round INTEGER`);
  } catch (error: any) {
    const errorMsg = error.message || '';
    if (!errorMsg.includes('duplicate column name') && !errorMsg.includes('duplicate column')) {
      console.warn('Migration 9.2 warning:', errorMsg);
    }
  }

  // Migration 10: Add UUID Foreign Keys for Sync
  const fkUuidColumns = [
    { table: 'places', column: 'city_uuid' },
    { table: 'tournaments', column: 'circuit_uuid' },
    { table: 'tournaments', column: 'place_uuid' },
    { table: 'rounds', column: 'tournament_uuid' },
    { table: 'matches', column: 'round_uuid' },
    { table: 'matches', column: 'first_player_uuid' },
    { table: 'tournament_players', column: 'tournament_uuid' },
    { table: 'tournament_players', column: 'player_uuid' },
    { table: 'match_players', column: 'match_uuid' },
    { table: 'match_players', column: 'player_uuid' },
    { table: 'match_results', column: 'match_uuid' },
    { table: 'match_results', column: 'player_uuid' },
    { table: 'player_byes', column: 'tournament_uuid' },
    { table: 'player_byes', column: 'player_uuid' },
    { table: 'tournament_configs', column: 'tournament_uuid' },
  ];

  console.log('🔄 Running Migrations (including #10)...');
  let addedColumns = 0;

  for (const item of fkUuidColumns) {
    try {
      database.exec(`ALTER TABLE ${item.table} ADD COLUMN ${item.column} TEXT`);
      console.log(`✅ [Migration 10] Added column ${item.table}.${item.column}`);
      addedColumns++;
    } catch (error: any) {
      const errorMsg = error.message || '';
      if (!errorMsg.includes('duplicate column name') && !errorMsg.includes('duplicate column')) {
        console.warn(`⚠️ [Migration 10] Warning (${item.table}.${item.column}):`, errorMsg);
      }
    }
  }

  if (addedColumns > 0) {
    console.log(`🎉 Migration 10 complete: Added ${addedColumns} missing UUID columns.`);
  } else {
    console.log('ℹ️ Migration 10: All columns already exist.');
  }

  // Migration 11: Add pairing_algorithm to tournament_configs
  try {
    database.exec(
      `ALTER TABLE tournament_configs ADD COLUMN pairing_algorithm TEXT DEFAULT 'greedy' CHECK(pairing_algorithm IN ('greedy', 'backtracking'))`
    );
    console.log('✅ [Migration 11] Added pairing_algorithm to tournament_configs');
  } catch (error: any) {
    const errorMsg = error.message || '';
    if (!errorMsg.includes('duplicate column name') && !errorMsg.includes('duplicate column')) {
      console.warn('⚠️ [Migration 11] Warning:', errorMsg);
    }
  }

  // Migration 12: Buchholz / bye handling mode
  try {
    database.exec(
      `ALTER TABLE tournament_configs ADD COLUMN buchholz_bye_mode TEXT DEFAULT 'legacy' CHECK(buchholz_bye_mode IN ('legacy', 'n_minus_1', 'legacy_virtual_avg', 'n_minus_1_virtual_avg'))`
    );
    console.log('✅ [Migration 12] Added buchholz_bye_mode to tournament_configs');
  } catch (error: any) {
    const errorMsg = error.message || '';
    if (!errorMsg.includes('duplicate column name') && !errorMsg.includes('duplicate column')) {
      console.warn('⚠️ [Migration 12] Warning:', errorMsg);
    }
  }

  // Migration 13: Relax buchholz_bye_mode CHECK (add virtual_worst modes; SQLite cannot widen CHECK in place)
  try {
    const applied = database
      .prepare(`SELECT 1 FROM sync_meta WHERE key = 'migration_13_buchholz_bye_mode'`)
      .get() as { 1: number } | undefined;
    if (applied) {
      console.log('ℹ️ Migration 13: buchholz_bye_mode already relaxed');
    } else {
      const cols = database.pragma('table_info(tournament_configs)') as {
        cid: number;
        name: string;
        type: string;
        notnull: number;
        dflt_value: string | null;
        pk: number;
      }[];
      if (cols.length === 0) {
        console.warn('⚠️ Migration 13: tournament_configs missing, skip');
      } else {
        const sorted = [...cols].sort((a, b) => a.cid - b.cid);
        const colDefs = sorted
          .map((c) => {
            if (c.name === 'buchholz_bye_mode') {
              return `"buchholz_bye_mode" TEXT DEFAULT 'legacy'`;
            }
            if (c.name === 'tournament_id') {
              return `"tournament_id" INTEGER NOT NULL UNIQUE`;
            }
            let line = `"${c.name}" ${c.type || 'TEXT'}`;
            if (c.pk) line += ' PRIMARY KEY AUTOINCREMENT';
            else if (c.notnull) line += ' NOT NULL';
            if (c.dflt_value != null && c.dflt_value !== undefined && String(c.dflt_value) !== '') {
              line += ` DEFAULT ${c.dflt_value}`;
            }
            return line;
          })
          .join(',\n');
        const colNames = sorted.map((c) => `"${c.name}"`).join(', ');
        database.exec('BEGIN IMMEDIATE');
        database.exec(`
          CREATE TABLE tournament_configs__m13 (
            ${colDefs},
            FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
          )
        `);
        database.exec(
          `INSERT INTO tournament_configs__m13 (${colNames}) SELECT ${colNames} FROM tournament_configs`
        );
        database.exec('DROP TABLE tournament_configs');
        database.exec('ALTER TABLE tournament_configs__m13 RENAME TO tournament_configs');
        database.exec(
          `CREATE UNIQUE INDEX IF NOT EXISTS idx_tournament_configs_uuid ON tournament_configs(uuid)`
        );
        database
          .prepare(
            `INSERT OR REPLACE INTO sync_meta (key, value, updated_at) VALUES ('migration_13_buchholz_bye_mode', '1', CURRENT_TIMESTAMP)`
          )
          .run();
        database.exec('COMMIT');
        console.log('✅ [Migration 13] Relaxed buchholz_bye_mode (virtual_worst supported)');
      }
    }
  } catch (error: any) {
    try {
      database.exec('ROLLBACK');
    } catch {
      /* ignore */
    }
    console.warn('⚠️ [Migration 13] Warning:', error?.message || error);
  }

  // Final Step: Default Data Initialization (Ensuring all columns exist)
  try {
    console.log(`[DB] Configuring final default cities and places (Online/Offline)`);

    // Cleanup: Remove any other cities/places if they exist (to ensure a fresh state)
    // We do this at the very end to be sure columns exist
    database.exec(`DELETE FROM places WHERE name NOT IN ('Online', 'Offline')`);
    database.exec(`DELETE FROM cities WHERE name NOT IN ('Online', 'Offline')`);

    const defaultCities = [
      { name: 'Online', uuid: '00000000-0000-0000-0000-000000000001' },
      { name: 'Offline', uuid: '00000000-0000-0000-0000-000000000002' },
    ];
    for (const city of defaultCities) {
      database.exec(
        `INSERT INTO cities (name, uuid) SELECT '${city.name}', '${city.uuid}' WHERE NOT EXISTS (SELECT 1 FROM cities WHERE uuid = '${city.uuid}')`
      );
    }

    // Insert Places linked to those Cities with fixed UUIDs
    database.exec(
      `INSERT INTO places (name, city_id, uuid, city_uuid) 
       SELECT 'Online', id, '00000000-0000-0000-0000-100000000001', '00000000-0000-0000-0000-000000000001' 
       FROM cities WHERE uuid = '00000000-0000-0000-0000-000000000001' 
       AND NOT EXISTS (SELECT 1 FROM places WHERE uuid = '00000000-0000-0000-0000-100000000001')`
    );
    database.exec(
      `INSERT INTO places (name, city_id, uuid, city_uuid) 
       SELECT 'Offline', id, '00000000-0000-0000-0000-100000000002', '00000000-0000-0000-0000-000000000002' 
       FROM cities WHERE uuid = '00000000-0000-0000-0000-000000000002' 
       AND NOT EXISTS (SELECT 1 FROM places WHERE uuid = '00000000-0000-0000-0000-100000000002')`
    );

    // Final fix for loose tournaments
    database.exec(
      `UPDATE tournaments SET place_id = (SELECT id FROM places WHERE name = 'Online' LIMIT 1) WHERE place_id IS NULL`
    );
  } catch (error: any) {
    console.error('❌ Final Initialization failed:', error.message);
  }

  // Force wal checkpoint to ensure changes are written
  try {
    database.pragma('wal_checkpoint(RESTART)');
  } catch (e) {
    console.warn('Could not checkpoint WAL:', e);
  }
}

export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}
