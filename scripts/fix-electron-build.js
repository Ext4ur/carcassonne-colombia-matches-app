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

const storeMode =
    process.env.DEVIR_STORE_MODE === 'true' || process.env.VITE_DEVIR_STORE_MODE === 'true';
const hqMode =
    process.env.DEVIR_HQ_MODE === 'true' || process.env.VITE_DEVIR_HQ_MODE === 'true';

const dbScriptPath = path.join(distPath, 'main', 'database.js');
if (fs.existsSync(dbScriptPath)) {
    const env = process.env.APP_ENV || 'colombia';
    let dbScriptContent = fs.readFileSync(dbScriptPath, 'utf8');

    dbScriptContent = dbScriptContent.replace(
        /const env = \(process\.env\.APP_ENV \|\| 'colombia'\)\.toLowerCase\(\);/g,
        `const env = '${env}'.toLowerCase(); // INJECTED BY BUILD SCRIPT`
    );

    dbScriptContent = dbScriptContent.replace(
        /function isStoreBuild\(\)[^{]*\{[^}]+\}/g,
        `function isStoreBuild() { return ${storeMode ? 'true' : 'false'}; } // INJECTED BY BUILD SCRIPT`
    );

    dbScriptContent = dbScriptContent.replace(
        /function isDevirHqBuild\(\)[^{]*\{[^}]+\}/g,
        `function isDevirHqBuild() { return ${hqMode ? 'true' : 'false'}; } // INJECTED BY BUILD SCRIPT`
    );

    fs.writeFileSync(dbScriptPath, dbScriptContent, 'utf8');
    console.log(
        `Injected APP_ENV='${env}', storeMode=${storeMode}, hqMode=${hqMode} into dist/main/database.js`
    );
}

const appEnv = process.env.APP_ENV || 'colombia';
const dbFileName = storeMode
    ? 'tournament_store.db'
    : hqMode
      ? 'tournament_devir.db'
      : appEnv === 'international'
        ? 'tournament_int.db'
        : 'tournament_co.db';

const appData = process.env.APPDATA || (
    process.platform === 'darwin' 
    ? path.join(os.homedir(), 'Library/Application Support') 
    : path.join(os.homedir(), '.config')
);

const userDataPath = path.join(appData, 'carcassonne-tournament-manager');
const dbPath = path.join(userDataPath, dbFileName);

const filesToDelete = [
    dbPath,
    `${dbPath}-wal`,
    `${dbPath}-shm`
];

console.log(`🧹 Checking for production database to reset (${dbFileName})...`);
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
    console.log(`✅ [RESET] Production database '${dbFileName}' has been reset for a clean build.`);
} else {
    console.log(`ℹ️ [RESET] No existing production database found for '${dbFileName}'. State is already clean.`);
}
