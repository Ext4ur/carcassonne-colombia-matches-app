
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Need to mimic app.getPath('userData') because we are outside Electron
const appName = 'carcassonne-tournament-manager'; // From package.json
const userDataPath = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), appName);
const dbPath = path.join(userDataPath, 'tournament.db');

console.log(`📂 Database Path: ${dbPath}`);

if (!fs.existsSync(dbPath)) {
    console.error('❌ Database not found!');
    process.exit(1);
}

const db = new Database(dbPath);

console.log('🗑️ Clearing Sync Queue...');

try {
    const result = db.prepare('DELETE FROM sync_queue').run();
    console.log(`✅ Deleted ${result.changes} items from sync_queue.`);

    // Also reset sqlite_sequence if needed? No, auto-increment on id is fine.

} catch (error) {
    console.error('❌ Error clearing queue:', error.message);
    process.exit(1);
}

console.log('🎉 Done!');
process.exit(0);
