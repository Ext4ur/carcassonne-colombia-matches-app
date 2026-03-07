-- 012_schema_repair_uuids.sql
-- Run this script in the Supabase SQL Editor.
-- This script ensures all tables have the 'uuid' column and related '_uuid' columns for sync.

-- 0. Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Helper function to add UUID column if missing and populate it
CREATE OR REPLACE FUNCTION add_uuid_if_missing(t_name TEXT)
RETURNS VOID AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = t_name AND column_name = 'uuid'
    ) THEN
        EXECUTE 'ALTER TABLE ' || t_name || ' ADD COLUMN uuid UUID UNIQUE DEFAULT gen_random_uuid()';
        -- Populate existing NULL uuids if the default didn't (just in case)
        EXECUTE 'UPDATE ' || t_name || ' SET uuid = gen_random_uuid() WHERE uuid IS NULL';
        EXECUTE 'ALTER TABLE ' || t_name || ' ALTER COLUMN uuid SET NOT NULL';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Helper function to add FK UUID column if missing
CREATE OR REPLACE FUNCTION add_fk_uuid_if_missing(t_name TEXT, c_name TEXT)
RETURNS VOID AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = t_name AND column_name = c_name
    ) THEN
        EXECUTE 'ALTER TABLE ' || t_name || ' ADD COLUMN ' || c_name || ' UUID';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 1. Add primary 'uuid' to all tables
SELECT add_uuid_if_missing('players');
SELECT add_uuid_if_missing('circuits');
SELECT add_uuid_if_missing('cities');
SELECT add_uuid_if_missing('places');
SELECT add_uuid_if_missing('tournaments');
SELECT add_uuid_if_missing('tournament_configs');
SELECT add_uuid_if_missing('tournament_players');
SELECT add_uuid_if_missing('rounds');
SELECT add_uuid_if_missing('matches');
SELECT add_uuid_if_missing('match_players');
SELECT add_uuid_if_missing('match_results');
SELECT add_uuid_if_missing('player_byes');

-- 2. Add foreign key '_uuid' columns
SELECT add_fk_uuid_if_missing('places', 'city_uuid');
SELECT add_fk_uuid_if_missing('tournaments', 'circuit_uuid');
SELECT add_fk_uuid_if_missing('tournaments', 'place_uuid');
SELECT add_fk_uuid_if_missing('tournament_configs', 'tournament_uuid');
SELECT add_fk_uuid_if_missing('tournament_players', 'tournament_uuid');
SELECT add_fk_uuid_if_missing('tournament_players', 'player_uuid');
SELECT add_fk_uuid_if_missing('rounds', 'tournament_uuid');
SELECT add_fk_uuid_if_missing('matches', 'round_uuid');
SELECT add_fk_uuid_if_missing('matches', 'first_player_uuid');
SELECT add_fk_uuid_if_missing('match_players', 'match_uuid');
SELECT add_fk_uuid_if_missing('match_players', 'player_uuid');
SELECT add_fk_uuid_if_missing('match_results', 'match_uuid');
SELECT add_fk_uuid_if_missing('match_results', 'player_uuid');
SELECT add_fk_uuid_if_missing('player_byes', 'tournament_uuid');
SELECT add_fk_uuid_if_missing('player_byes', 'player_uuid');

-- 3. Hydrate existing Foreign Key UUIDs based on ID relationships
-- This is critical to restore the linked structure on Supabase
UPDATE places SET city_uuid = (SELECT uuid FROM cities WHERE id = city_id) WHERE city_uuid IS NULL AND city_id IS NOT NULL;
UPDATE tournaments SET circuit_uuid = (SELECT uuid FROM circuits WHERE id = circuit_id) WHERE circuit_uuid IS NULL AND circuit_id IS NOT NULL;
UPDATE tournaments SET place_uuid = (SELECT uuid FROM places WHERE id = place_id) WHERE place_uuid IS NULL AND place_id IS NOT NULL;
UPDATE tournament_configs SET tournament_uuid = (SELECT uuid FROM tournaments WHERE id = tournament_id) WHERE tournament_uuid IS NULL AND tournament_id IS NOT NULL;
UPDATE tournament_players SET tournament_uuid = (SELECT uuid FROM tournaments WHERE id = tournament_id), player_uuid = (SELECT uuid FROM players WHERE id = player_id) WHERE tournament_uuid IS NULL AND tournament_id IS NOT NULL;
UPDATE rounds SET tournament_uuid = (SELECT uuid FROM tournaments WHERE id = tournament_id) WHERE tournament_uuid IS NULL AND tournament_id IS NOT NULL;
UPDATE matches SET round_uuid = (SELECT uuid FROM rounds WHERE id = round_id), first_player_uuid = (SELECT uuid FROM players WHERE id = first_player_id) WHERE round_uuid IS NULL AND round_id IS NOT NULL;
UPDATE match_players SET match_uuid = (SELECT uuid FROM matches WHERE id = match_id), player_uuid = (SELECT uuid FROM players WHERE id = player_id) WHERE match_uuid IS NULL AND match_id IS NOT NULL;
UPDATE match_results SET match_uuid = (SELECT uuid FROM matches WHERE id = match_id), player_uuid = (SELECT uuid FROM players WHERE id = player_id) WHERE match_uuid IS NULL AND match_id IS NOT NULL;
UPDATE player_byes SET tournament_uuid = (SELECT uuid FROM tournaments WHERE id = tournament_id), player_uuid = (SELECT uuid FROM players WHERE id = player_id) WHERE tournament_uuid IS NULL AND tournament_id IS NOT NULL;

-- 4. Cleanup helper functions
DROP FUNCTION add_uuid_if_missing(TEXT);
DROP FUNCTION add_fk_uuid_if_missing(TEXT, TEXT);

-- Final check: Ensure sync_audit_logs is clean
TRUNCATE sync_audit_logs;
