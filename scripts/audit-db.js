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
  
  const userDataPath = path.join(appData, 'carcassonne-tournament-manager');
  console.log(`[AUDIT] Using userData path: ${userDataPath}`);
  
  const envs = [
    { name: 'colombia', db: 'tournament_co.db', dir: 'supabase/colombia' },
    { name: 'international', db: 'tournament_int.db', dir: 'supabase/international' }
  ];

  for (const env of envs) {
    const dbPath = path.join(userDataPath, env.db);
    if (!fs.existsSync(dbPath)) {
      console.log(`[${env.name}] Skipping - DB not found at ${dbPath}`);
      continue;
    }

    console.log(`[${env.name}] Auditing...`);
    const db = new Database(dbPath);
    
    // ENSURE LATEST MIGRATIONS ARE APPLIED
    try {
      db.exec(`ALTER TABLE tournament_configs ADD COLUMN pairing_algorithm TEXT DEFAULT 'greedy' CHECK(pairing_algorithm IN ('greedy', 'backtracking'))`);
      console.log(`[${env.name}] Applied missing migration: pairing_algorithm`);
    } catch (e) {
      // Column probably already exists
    }
    
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
