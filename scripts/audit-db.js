import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

// This script can be run via node or electron
// We resolve paths manually to avoid ESM/Electron import issues

async function runAudit() {
  const projectRoot = process.cwd();
  console.log(`[AUDIT] Project root: ${projectRoot}`);
  
  // Resolve AppData path manually (like in fix-db.js)
  const appData = process.env.APPDATA || 
    (process.platform === 'darwin' ? 
      path.join(process.env.HOME || '', 'Library/Application Support') : 
      path.join(process.env.HOME || '', '.config'));
  
  // Must mirror src/main/main.ts: in development Electron uses `${userData}-dev`
  const userDataProd = path.join(appData, 'carcassonne-tournament-manager');
  const userDataDev = `${userDataProd}-dev`;
  console.log(`[AUDIT] Electron dev userData (npm run dev): ${userDataDev}`);
  console.log(`[AUDIT] Packaged/prod userData: ${userDataProd}`);

  const envs = [
    { name: 'colombia', db: 'tournament_co.db', dir: 'supabase/colombia' },
    { name: 'international', db: 'tournament_int.db', dir: 'supabase/international' },
  ];

  for (const env of envs) {
    const devDb = path.join(userDataDev, env.db);
    const prodDb = path.join(userDataProd, env.db);
    let dbPath = null;
    if (fs.existsSync(devDb)) {
      dbPath = devDb;
    } else if (fs.existsSync(prodDb)) {
      dbPath = prodDb;
    }

    if (!dbPath) {
      console.log(`[${env.name}] Skipping - DB not found. Tried:\n  ${devDb}\n  ${prodDb}`);
      continue;
    }

    console.log(`[${env.name}] Using SQLite: ${dbPath}`);

    console.log(`[${env.name}] Auditing...`);
    const db = new Database(dbPath);
    
    // ENSURE LATEST MIGRATIONS ARE APPLIED (mirror src/main/database.ts)
    const tryExec = (sql, label) => {
      try {
        db.exec(sql);
        console.log(`[${env.name}] Applied missing migration: ${label}`);
      } catch {
        // Column probably already exists
      }
    };

    tryExec(
      `ALTER TABLE tournament_configs ADD COLUMN pairing_algorithm TEXT DEFAULT 'greedy' CHECK(pairing_algorithm IN ('greedy', 'backtracking'))`,
      'pairing_algorithm'
    );
    // Migration 14 (knockout phase)
    tryExec(
      `ALTER TABLE tournaments ADD COLUMN competition_format TEXT NOT NULL DEFAULT 'swiss'`,
      'competition_format'
    );
    tryExec(`ALTER TABLE tournaments ADD COLUMN knockout_phase_started_at TEXT`, 'knockout_phase_started_at');
    tryExec(`ALTER TABLE tournament_configs ADD COLUMN knockout_size INTEGER DEFAULT 8`, 'knockout_size');
    tryExec(
      `ALTER TABLE tournament_configs ADD COLUMN knockout_seeding TEXT DEFAULT 'standard_bracket'`,
      'knockout_seeding'
    );
    tryExec(
      `ALTER TABLE tournament_configs ADD COLUMN knockout_series TEXT DEFAULT 'best_of_1'`,
      'knockout_series'
    );
    tryExec(
      `ALTER TABLE tournament_configs ADD COLUMN swiss_standings_snapshot TEXT`,
      'swiss_standings_snapshot'
    );
    tryExec(`ALTER TABLE rounds ADD COLUMN phase TEXT NOT NULL DEFAULT 'swiss'`, 'phase');
    tryExec(`ALTER TABLE rounds ADD COLUMN knockout_stage TEXT`, 'knockout_stage');
    tryExec(`ALTER TABLE matches ADD COLUMN knockout_bracket_slot INTEGER`, 'knockout_bracket_slot');
    tryExec(`ALTER TABLE matches ADD COLUMN series_target_wins INTEGER DEFAULT 1`, 'series_target_wins');
    tryExec(
      `ALTER TABLE matches ADD COLUMN series_winner_id INTEGER REFERENCES players(id)`,
      'series_winner_id'
    );
    tryExec(`ALTER TABLE matches ADD COLUMN is_knockout INTEGER NOT NULL DEFAULT 0`, 'is_knockout');
    tryExec(`ALTER TABLE matches ADD COLUMN series_meta TEXT`, 'series_meta');
    tryExec(`ALTER TABLE match_results ADD COLUMN game_number INTEGER NOT NULL DEFAULT 1`, 'game_number');
    tryExec(
      `CREATE TABLE IF NOT EXISTS tournament_knockout_seeds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT,
        tournament_id INTEGER NOT NULL,
        player_id INTEGER NOT NULL,
        seed INTEGER NOT NULL,
        UNIQUE(tournament_id, player_id),
        UNIQUE(tournament_id, seed)
      )`,
      'tournament_knockout_seeds'
    );
    // Migration 15 (KO config + match stage)
    tryExec(
      `ALTER TABLE tournament_configs ADD COLUMN knockout_play_bronze_match INTEGER NOT NULL DEFAULT 0`,
      'knockout_play_bronze_match'
    );
    tryExec(
      `ALTER TABLE tournament_configs ADD COLUMN knockout_match_starter TEXT NOT NULL DEFAULT 'higher_swiss_seed'`,
      'knockout_match_starter'
    );
    tryExec(
      `ALTER TABLE tournament_configs ADD COLUMN knockout_series_alternate_starter INTEGER NOT NULL DEFAULT 0`,
      'knockout_series_alternate_starter'
    );
    tryExec(`ALTER TABLE matches ADD COLUMN knockout_match_stage TEXT`, 'knockout_match_stage');
    // Migration 16 (Swiss/KO starter config)
    tryExec(
      `ALTER TABLE tournament_configs ADD COLUMN swiss_match_starter TEXT NOT NULL DEFAULT 'higher_ranked'`,
      'swiss_match_starter'
    );
    tryExec(
      `ALTER TABLE tournament_configs ADD COLUMN knockout_series_starter_mode TEXT NOT NULL DEFAULT 'alternate'`,
      'knockout_series_starter_mode'
    );

    // Ensure output directory exists
    const outDir = path.join(process.cwd(), env.dir);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    // 1. Schema Dump
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
    const schema = {};
    for (const table of tables) {
      schema[table.name] = db.pragma(`table_info(${table.name})`);
    }
    fs.writeFileSync(path.join(outDir, 'schema_dump.json'), JSON.stringify(schema, null, 2));
    console.log(`[${env.name}] Wrote schema_dump.json`);

    // Keep remote_schema.json in sync with local columns (expected after Supabase migrations)
    const remoteFile = path.join(outDir, 'remote_schema.json');
    if (fs.existsSync(remoteFile)) {
      const remote = JSON.parse(fs.readFileSync(remoteFile, 'utf8'));
      const remoteKeys = new Set(
        remote.map((row) => `${row.table_name}.${row.column_name}`)
      );
      let added = 0;
      for (const [table, cols] of Object.entries(schema)) {
        for (const col of cols) {
          const key = `${table}.${col.name}`;
          if (remoteKeys.has(key)) continue;
          remote.push({
            table_name: table,
            column_name: col.name,
            data_type: String(col.type || 'text').toLowerCase(),
            is_nullable: col.notnull ? 'NO' : 'YES',
            column_default: col.dflt_value ?? null,
          });
          remoteKeys.add(key);
          added++;
        }
      }
      if (added > 0) {
        fs.writeFileSync(remoteFile, JSON.stringify(remote, null, 4));
        console.log(`[${env.name}] Synced ${added} column(s) into remote_schema.json`);
      }
    }

    // 2. Null Audit
    const nullReport = {};
    // Check key columns for nulls
    const checks = [
      { table: 'tournament_configs', column: 'pairing_algorithm' },
      { table: 'tournament_players', column: 'dropout_round' },
      { table: 'matches', column: 'first_player_id' },
      { table: 'tournament_players', column: 'uuid' },
      { table: 'tournaments', column: 'uuid' }
    ];
    for (const check of checks) {
      try {
          const result = db.prepare(`SELECT count(*) as count FROM ${check.table} WHERE ${check.column} IS NULL`).get();
          nullReport[`${check.table}.${check.column}`] = result.count;
      } catch (e) {
          nullReport[`${check.table}.${check.column}`] = `ERROR: ${e.message}`;
      }
    }
    fs.writeFileSync(path.join(outDir, 'null_audit.json'), JSON.stringify(nullReport, null, 2));
    console.log(`[${env.name}] Wrote null_audit.json`);

    // 3. Data Export (Sample)
    const dataExport = {};
    const exportTables = ['tournaments', 'tournament_configs', 'players', 'circuits'];
    for (const table of exportTables) {
      try {
        dataExport[table] = db.prepare(`SELECT * FROM ${table} LIMIT 100`).all();
      } catch (e) {
        dataExport[table] = [];
      }
    }
    fs.writeFileSync(path.join(outDir, 'data_export.json'), JSON.stringify(dataExport, null, 2));
    console.log(`[${env.name}] Wrote data_export.json`);

    db.close();
    console.log(`[${env.name}] Audit files generated in ${env.dir}`);
  }

  console.log('--- AUDIT COMPLETE ---');
  process.exit(0);
}

runAudit().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
