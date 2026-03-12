import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

// Configuración básica para encontrar la DB local
const userDataPath = path.join(process.env.APPDATA || (process.platform === 'darwin' ? path.join(process.env.HOME, 'Library/Application Support') : path.join(process.env.HOME, '.config')), 'carcassonne-tournament-manager');
const dbNames = ['tournament_co.db', 'tournament_int.db'];

console.log('--- AUDITORÍA DE ESQUEMA LOCAL (SQLite) ---');

dbNames.forEach(dbName => {
    const dbPath = path.join(userDataPath, dbName);
    if (!fs.existsSync(dbPath)) return;

    console.log(`\nBase de datos: ${dbName}`);
    const db = new Database(dbPath);
    
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
    
    tables.forEach(table => {
        console.log(`\n[TABLA] ${table.name}`);
        const columns = db.pragma(`table_info(${table.name})`);
        columns.forEach(col => {
            console.log(`  - ${col.name} (${col.type})${col.notnull ? ' NOT NULL' : ''}${col.dflt_value ? ` DEFAULT ${col.dflt_value}` : ''}`);
        });
    });
    
    db.close();
});

console.log('\n-------------------------------------------');
console.log('Compara esta lista con tu panel de Supabase para asegurar que todas las columnas existen.');
