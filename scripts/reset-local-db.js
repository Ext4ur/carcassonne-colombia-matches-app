
import path from 'path';
import fs from 'fs';
import os from 'os';

// Need to mimic app.getPath('userData') because we are outside Electron
const appName = 'carcassonne-tournament-manager'; // From package.json
const userDataPath = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), appName);
const dbPath = path.join(userDataPath, 'tournament.db');
const dbShmPath = path.join(userDataPath, 'tournament.db-shm');
const dbWalPath = path.join(userDataPath, 'tournament.db-wal');

console.log(`📂 Database Path: ${dbPath}`);

try {
    if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
        console.log(`✅ Deleted tournament.db`);
    } else {
        console.log(`ℹ️ tournament.db not found`);
    }

    if (fs.existsSync(dbShmPath)) {
        fs.unlinkSync(dbShmPath);
        console.log(`✅ Deleted tournament.db-shm`);
    }

    if (fs.existsSync(dbWalPath)) {
        fs.unlinkSync(dbWalPath);
        console.log(`✅ Deleted tournament.db-wal`);
    }

} catch (error) {
    console.error('❌ Error resetting database:', error.message);
    process.exit(1);
}

console.log('🎉 Database reset complete! Restart run application to recreate schema.');
process.exit(0);
