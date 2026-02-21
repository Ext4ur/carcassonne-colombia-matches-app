
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Read .env manually
const envPath = path.resolve(__dirname, '..', '.env');
console.log('🔍 Looking for .env at:', envPath);

if (!fs.existsSync(envPath)) {
    console.error('❌ Error: .env file not found at', envPath);
    process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars = {};

// Improved parsing for Windows \r\n
const lines = envContent.split(/\r?\n/);
lines.forEach(line => {
    const cleanLine = line.trim();
    if (!cleanLine || cleanLine.startsWith('#')) return;

    const match = cleanLine.match(/^([^=]+)=(.*)$/);
    if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        // Remove quotes if present
        value = value.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
        envVars[key] = value;
    }
});

console.log('📝 Found Environment Variables:', Object.keys(envVars));

const SUPABASE_URL = envVars.VITE_SUPABASE_URL;
const SUPABASE_KEY = envVars.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Error: Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in .env');
    console.error('Available keys:', Object.keys(envVars));
    process.exit(1);
}

console.log('🔗 Connecting to Supabase at:', SUPABASE_URL);

// Create Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const TABLES = [
    'cities',
    'places',
    'circuits',
    'players',
    'tournaments',
    'tournament_configs',
    'tournament_players',
    'rounds',
    'matches',
    'match_results'
];

async function backup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupData = {};

    console.log('📦 Starting backup...');

    for (const table of TABLES) {
        console.log(`   - Fetching ${table}...`);
        const { data, error } = await supabase.from(table).select('*');

        if (error) {
            console.error(`❌ Error fetching ${table}:`, error.message);
        } else {
            backupData[table] = data;
            console.log(`     ✅ ${table}: ${data ? data.length : 0} rows`);
        }
    }

    const filename = `supabase_backup_${timestamp}.json`;
    const outputPath = path.resolve(__dirname, '..', filename);

    fs.writeFileSync(outputPath, JSON.stringify(backupData, null, 2));
    console.log(`\n🎉 Backup saved to: ${outputPath}`);
}

backup().catch(err => {
    console.error('❌ Unexpected error:', err);
    process.exit(1);
});
