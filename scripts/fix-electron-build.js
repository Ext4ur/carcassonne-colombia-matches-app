import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distPath = path.join(__dirname, '../dist');
const pkgPath = path.join(distPath, 'package.json');

if (!fs.existsSync(distPath)) {
    fs.mkdirSync(distPath, { recursive: true });
}

fs.writeFileSync(pkgPath, JSON.stringify({ type: 'commonjs' }, null, 2));
console.log('Created dist/package.json with type: commonjs');

// Inject APP_ENV directly into the compiled Node (Electron) output
const dbScriptPath = path.join(distPath, 'main', 'database.js');
if (fs.existsSync(dbScriptPath)) {
    const env = process.env.APP_ENV || 'colombia';
    let dbScriptContent = fs.readFileSync(dbScriptPath, 'utf8');

    // Check if the file still contains the dynamic process.env lookup and replace it with a hardcoded string
    dbScriptContent = dbScriptContent.replace(
        /const env = \(process\.env\.APP_ENV \|\| 'colombia'\)\.toLowerCase\(\);/g,
        `const env = '${env}'.toLowerCase(); // INJECTED BY BUILD SCRIPT`
    );

    fs.writeFileSync(dbScriptPath, dbScriptContent, 'utf8');
    console.log(`Injected APP_ENV='${env}' into dist/main/database.js`);
}

// Automatic Database Reset for Production builds
// This ensures that when the developer runs a local build, it starts with a fresh database
const appEnv = process.env.APP_ENV || 'colombia';
const dbFileName = appEnv === 'international' ? 'tournament_int.db' : 'tournament_co.db';

// Resolve AppData path (Windows, macOS, Linux)
const appData = process.env.APPDATA || (
    process.platform === 'darwin' 
    ? path.join(os.homedir(), 'Library/Application Support') 
    : path.join(os.homedir(), '.config')
);

// Note: Electron uses the name in package.json or productName for the folder
// Based on current config, it's likely 'carcassonne-tournament-manager'
const userDataPath = path.join(appData, 'carcassonne-tournament-manager');
const dbPath = path.join(userDataPath, dbFileName);

const filesToDelete = [
    dbPath,
    `${dbPath}-wal`,
    `${dbPath}-shm`
];

console.log(`🧹 Checking for production database to reset (${appEnv})...`);
let deletedCount = 0;

filesToDelete.forEach(file => {
    if (fs.existsSync(file)) {
        try {
            fs.unlinkSync(file);
            console.log(`   [RESET] Deleted: ${path.basename(file)}`);
            deletedCount++;
        } catch (err) {
            console.warn(`   [RESET] Could not delete ${path.basename(file)}: ${err.message}`);
        }
    }
});

if (deletedCount > 0) {
    console.log(`✅ [RESET] Production database for '${appEnv}' has been reset for a clean build.`);
} else {
    console.log(`ℹ️ [RESET] No existing production database found for '${appEnv}'. State is already clean.`);
}
