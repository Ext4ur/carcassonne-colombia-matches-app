-- 020_deduplicate_and_enforce_unique_uuids.sql
-- Run this script in the Supabase SQL Editor.

-- The sync service was skipping records because .maybeSingle() throws an error 
-- when it finds multiple records with the EXACT SAME UUID in Supabase.
-- This script deduplicates those records and enforces a UNIQUE constraint.

-- 1. DEDUPLICATE RECORDS (Keep the one with the highest ID)
DELETE FROM match_players WHERE id NOT IN (SELECT MAX(id) FROM match_players GROUP BY uuid);
DELETE FROM match_results WHERE id NOT IN (SELECT MAX(id) FROM match_results GROUP BY uuid);
DELETE FROM matches WHERE id NOT IN (SELECT MAX(id) FROM matches GROUP BY uuid);
DELETE FROM rounds WHERE id NOT IN (SELECT MAX(id) FROM rounds GROUP BY uuid);
DELETE FROM tournament_configs WHERE id NOT IN (SELECT MAX(id) FROM tournament_configs GROUP BY uuid);
DELETE FROM tournament_players WHERE id NOT IN (SELECT MAX(id) FROM tournament_players GROUP BY uuid);
DELETE FROM player_byes WHERE id NOT IN (SELECT MAX(id) FROM player_byes GROUP BY uuid);
DELETE FROM tournaments WHERE id NOT IN (SELECT MAX(id) FROM tournaments GROUP BY uuid);
DELETE FROM players WHERE id NOT IN (SELECT MAX(id) FROM players GROUP BY uuid);
DELETE FROM places WHERE id NOT IN (SELECT MAX(id) FROM places GROUP BY uuid);
DELETE FROM circuits WHERE id NOT IN (SELECT MAX(id) FROM circuits GROUP BY uuid);
DELETE FROM cities WHERE id NOT IN (SELECT MAX(id) FROM cities GROUP BY uuid);

-- 2. ENFORCE UNIQUE CONSTRAINTS ON UUID
ALTER TABLE match_players ADD CONSTRAINT match_players_uuid_key UNIQUE (uuid);
ALTER TABLE match_results ADD CONSTRAINT match_results_uuid_key UNIQUE (uuid);
ALTER TABLE matches ADD CONSTRAINT matches_uuid_key UNIQUE (uuid);
ALTER TABLE rounds ADD CONSTRAINT rounds_uuid_key UNIQUE (uuid);
ALTER TABLE tournament_configs ADD CONSTRAINT tournament_configs_uuid_key UNIQUE (uuid);
ALTER TABLE tournament_players ADD CONSTRAINT tournament_players_uuid_key UNIQUE (uuid);
ALTER TABLE player_byes ADD CONSTRAINT player_byes_uuid_key UNIQUE (uuid);
ALTER TABLE tournaments ADD CONSTRAINT tournaments_uuid_key UNIQUE (uuid);
ALTER TABLE players ADD CONSTRAINT players_uuid_key UNIQUE (uuid);
ALTER TABLE places ADD CONSTRAINT places_uuid_key UNIQUE (uuid);
ALTER TABLE circuits ADD CONSTRAINT circuits_uuid_key UNIQUE (uuid);
ALTER TABLE cities ADD CONSTRAINT cities_uuid_key UNIQUE (uuid);

-- 3. REGENERATE LOGS (Clean Reset)
TRUNCATE sync_audit_logs RESTART IDENTITY;

INSERT INTO sync_audit_logs (table_name, record_uuid, operation) SELECT 'cities', uuid, 'INSERT' FROM cities ORDER BY id ASC;
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) SELECT 'places', uuid, 'INSERT' FROM places ORDER BY id ASC;
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) SELECT 'circuits', uuid, 'INSERT' FROM circuits ORDER BY id ASC;
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) SELECT 'players', uuid, 'INSERT' FROM players ORDER BY id ASC;
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) SELECT 'tournaments', uuid, 'INSERT' FROM tournaments ORDER BY id ASC;
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) SELECT 'tournament_configs', uuid, 'INSERT' FROM tournament_configs ORDER BY id ASC;
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) SELECT 'tournament_players', uuid, 'INSERT' FROM tournament_players ORDER BY id ASC;
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) SELECT 'rounds', uuid, 'INSERT' FROM rounds ORDER BY id ASC;
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) SELECT 'matches', uuid, 'INSERT' FROM matches ORDER BY id ASC;
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) SELECT 'match_players', uuid, 'INSERT' FROM match_players ORDER BY id ASC;
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) SELECT 'match_results', uuid, 'INSERT' FROM match_results ORDER BY id ASC;
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) SELECT 'player_byes', uuid, 'INSERT' FROM player_byes ORDER BY id ASC;
