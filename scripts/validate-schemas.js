import fs from 'fs';
import path from 'path';

/**
 * MASTER_SCHEMA defines the expected structure based on src/main/database.ts
 * If a new column is added to the database, it MUST be added here to pass CI/Pre-commit.
 */
const MASTER_SCHEMA = {
  players: ['id', 'uuid', 'name', 'bga_username', 'phone', 'email', 'age', 'display_preference'],
  tournaments: [
    'id',
    'uuid',
    'name',
    'type',
    'circuit_id',
    'circuit_uuid',
    'date',
    'status',
    'players_per_match',
    'number_of_rounds',
    'place_id',
    'place_uuid',
    'competition_format',
    'knockout_phase_started_at',
  ],
  tournament_configs: [
    'id',
    'uuid',
    'tournament_id',
    'tournament_uuid',
    'avoid_rematches',
    'tiebreak_criteria',
    'scoring_system',
    'bye_selection',
    'player_display_mode',
    'pairing_algorithm',
    'buchholz_bye_mode',
    'knockout_size',
    'knockout_seeding',
    'knockout_series',
    'swiss_standings_snapshot',
    'knockout_play_bronze_match',
    'knockout_match_starter',
    'knockout_series_alternate_starter',
    'knockout_series_starter_mode',
    'swiss_match_starter',
  ],
  circuits: ['id', 'uuid', 'name', 'description', 'start_date', 'end_date', 'status'],
  rounds: [
    'id',
    'uuid',
    'tournament_id',
    'tournament_uuid',
    'round_number',
    'status',
    'started_at',
    'completed_at',
    'phase',
    'knockout_stage',
  ],
  matches: [
    'id',
    'uuid',
    'round_id',
    'round_uuid',
    'match_number',
    'status',
    'completed_at',
    'first_player_id',
    'first_player_uuid',
    'knockout_bracket_slot',
    'series_target_wins',
    'series_winner_id',
    'is_knockout',
    'series_meta',
    'knockout_match_stage',
  ],
  match_results: [
    'id',
    'uuid',
    'match_id',
    'match_uuid',
    'player_id',
    'player_uuid',
    'position',
    'points',
    'tournament_points',
    'game_number',
  ],
  tournament_players: [
    'id', 'uuid', 'tournament_id', 'tournament_uuid', 'player_id', 'player_uuid', 
    'registered_at', 'active', 'dropout_round'
  ],
  player_byes: ['id', 'uuid', 'tournament_id', 'tournament_uuid', 'player_id', 'player_uuid', 'round_number'],
  places: ['id', 'uuid', 'name', 'city_id', 'city_uuid'],
  cities: ['id', 'uuid', 'name']
};

const envs = ['colombia', 'international'];
let hasErrors = false;

console.log('--- SCHEMA VALIDATION ---');

envs.forEach(env => {
    const schemaFile = path.join(process.cwd(), `supabase/${env}/schema_dump.json`);
    if (!fs.existsSync(schemaFile)) {
        console.warn(`[${env}] WARN: Audit file not found at ${schemaFile}. Run 'npm run db:audit' first.`);
        return;
    }

    const schema = JSON.parse(fs.readFileSync(schemaFile, 'utf8'));
    console.log(`\n[${env}] Checking Local vs Master...`);
    
    Object.keys(MASTER_SCHEMA).forEach(table => {
        if (!schema[table]) {
            console.error(`  ❌ Table missing: ${table}`);
            hasErrors = true;
            return;
        }
        
        const existingColumns = schema[table].map((c) => c.name);
        MASTER_SCHEMA[table].forEach((col) => {
            if (!existingColumns.includes(col)) {
                console.error(`  ❌ Column missing in ${table}: ${col}`);
                hasErrors = true;
            }
        });
    });

    // REMOTE COMPARISON: Local vs Supabase
    const remoteFile = path.join(process.cwd(), `supabase/${env}/remote_schema.json`);
    if (fs.existsSync(remoteFile)) {
        console.log(`[${env}] Checking Remote (Supabase) vs Local...`);
        const remoteSchemaRaw = JSON.parse(fs.readFileSync(remoteFile, 'utf8'));
        
        // Supabase exported JSON might be a flat list of columns from info_schema
        // We need to normalize it to match our schema_dump structure
        const remoteSchema = {};
        if (Array.isArray(remoteSchemaRaw)) {
            remoteSchemaRaw.forEach(row => {
                if (!remoteSchema[row.table_name]) remoteSchema[row.table_name] = [];
                remoteSchema[row.table_name].push({ name: row.column_name });
            });
        } else {
            // Assume it's already in the same format
            Object.assign(remoteSchema, remoteSchemaRaw);
        }

        Object.keys(MASTER_SCHEMA).forEach(table => {
            if (!remoteSchema[table]) {
                console.error(`  ⚠️ [Remote] Table missing: ${table}`);
                // Not a fatal error yet, but worth warning
                return;
            }
            
            const localCols = schema[table].map((c) => c.name);
            const remoteCols = remoteSchema[table].map((c) => (typeof c === 'string' ? c : c.name));
            
            localCols.forEach(col => {
                if (!remoteCols.includes(col)) {
                    console.error(`  ❌ [Remote] Column missing in ${table}: ${col}`);
                    hasErrors = true;
                }
            });
        });
    } else {
        console.log(`[${env}] Skipped Remote Schema check (remote_schema.json not found)`);
    }

    // NULL AUDIT COMPARISON: Local vs Supabase
    const remoteNullFile = path.join(process.cwd(), `supabase/${env}/remote_null_audit.json`);
    if (fs.existsSync(remoteNullFile)) {
        console.log(`[${env}] Checking Remote (Supabase) vs Local Null Integrity...`);
        const localNulls = JSON.parse(fs.readFileSync(path.join(process.cwd(), `supabase/${env}/null_audit.json`), 'utf8'));
        const remoteNullsRaw = JSON.parse(fs.readFileSync(remoteNullFile, 'utf8'));
        
        // Normalize Supabase null query output if it's an array
        const remoteNulls = {};
        if (Array.isArray(remoteNullsRaw)) {
            remoteNullsRaw.forEach(row => {
                remoteNulls[`${row.table_name}.${row.column_name}`] = row.null_count;
            });
        } else {
            Object.assign(remoteNulls, remoteNullsRaw);
        }

        Object.keys(localNulls).forEach(key => {
            if (remoteNulls[key] !== undefined) {
                if (parseInt(remoteNulls[key]) > 0) {
                    console.warn(`  ⚠️ [Remote] ${key} has ${remoteNulls[key]} null values in Supabase!`);
                } else if (localNulls[key] > 0) {
                    console.error(`  ❌ [Remote] ${key} is clean in Supabase but has ${localNulls[key]} nulls locally!`);
                    hasErrors = true;
                } else {
                    console.log(`  ✅ [Remote] ${key} is clean in both environments.`);
                }
            }
        });
    }

    // DATA EXPORT (Manual Verification Only)
    const remoteDataFile = path.join(process.cwd(), `supabase/${env}/remote_data_export.json`);
    if (fs.existsSync(remoteDataFile)) {
        console.log(`[${env}] INFO: remote_data_export.json found. Use it for manual record verification.`);
    }
});

if (hasErrors) {
    console.log('\n❌ ERROR: Database schemas are inconsistent with the Master definition.');
    console.log('Ensure you have run the app (to apply migrations) and executed \'npm run db:audit\'.');
    process.exit(1);
} else {
    console.log('\n✅ SUCCESS: All local schemas are synchronized and correct.');
    process.exit(0);
}
