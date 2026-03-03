
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Try to locate the database
const appData = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + "/.local/share");

// Possible locations
const possiblePaths = [
    path.join(appData, 'carcassonne-tournament-manager', 'tournament.db'),
    path.join(appData, 'carcassonne-colombia-matches-app', 'tournament.db'),
    // Also check relative to the script if running in dev?
    path.join(process.cwd(), 'tournament.db'),
];

console.log('🔍 Searching for database...');
let dbPath = null;
for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
        dbPath = p;
        break;
    }
}

if (!dbPath) {
    console.error('❌ Could not find tournament.db in standard locations:');
    possiblePaths.forEach(p => console.error(` - ${p}`));
    console.log('⚠️ Please ensure you have run the app at least once.');
    process.exit(1);
}

console.log(`✅ Found database at: ${dbPath}`);
const db = new Database(dbPath);

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

console.log('🔄 Running Manual Migrations...');
let added = 0;

const runMigration = db.transaction(() => {
    for (const item of fkUuidColumns) {
        try {
            const info = db.pragma(`table_info(${item.table})`);
            const exists = info.some(col => col.name === item.column);

            if (!exists) {
                db.exec(`ALTER TABLE ${item.table} ADD COLUMN ${item.column} TEXT`);
                console.log(`✅ Added column ${item.table}.${item.column}`);
                added++;
            } else {
                console.log(`ℹ️ Column ${item.table}.${item.column} already exists.`);
            }
        } catch (error) {
            console.error(`❌ Error processing ${item.table}.${item.column}:`, error.message);
        }
    }
});

runMigration();

console.log(`🎉 Done! Added ${added} columns.`);

// Proper exit for Electron main process execution
process.exit(0);
