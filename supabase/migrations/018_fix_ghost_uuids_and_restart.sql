-- 018_fix_ghost_uuids_and_restart.sql
-- Run this script in the Supabase SQL Editor.

-- Optional Foreign Keys (like first_player_id) are set to NULL when the parent record is deleted.
-- However, their corresponding UUID columns (first_player_uuid) were NOT set to NULL.
-- This leaves "ghost UUIDs" that cause the sync service dependency checks to fail locally.

-- 1. FIX GHOST UUIDS
-- If the UUID column has a value, but the referenced record no longer exists, set the UUID to NULL.

UPDATE matches 
SET first_player_uuid = NULL 
WHERE first_player_uuid IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM players p WHERE p.uuid = matches.first_player_uuid);

UPDATE tournaments 
SET circuit_uuid = NULL 
WHERE circuit_uuid IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM circuits c WHERE c.uuid = tournaments.circuit_uuid);

UPDATE tournaments 
SET place_uuid = NULL 
WHERE place_uuid IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM places p WHERE p.uuid = tournaments.place_uuid);

UPDATE places 
SET city_uuid = NULL 
WHERE city_uuid IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM cities c WHERE c.uuid = places.city_uuid);

-- 2. REGENERATE SYNC LOGS
-- We must regenerate the logs so the clients download the corrected records.
TRUNCATE sync_audit_logs RESTART IDENTITY;

-- Priority 1: Cities
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) 
SELECT 'cities', uuid, 'INSERT' FROM cities ORDER BY id ASC;

-- Priority 2: Places
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) 
SELECT 'places', uuid, 'INSERT' FROM places ORDER BY id ASC;

-- Priority 3: Circuits
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) 
SELECT 'circuits', uuid, 'INSERT' FROM circuits ORDER BY id ASC;

-- Priority 4: Players
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) 
SELECT 'players', uuid, 'INSERT' FROM players ORDER BY id ASC;

-- Priority 5: Tournaments
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) 
SELECT 'tournaments', uuid, 'INSERT' FROM tournaments ORDER BY id ASC;

-- Priority 6: Tournament Configs
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) 
SELECT 'tournament_configs', uuid, 'INSERT' FROM tournament_configs ORDER BY id ASC;

-- Priority 7: Tournament Players
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) 
SELECT 'tournament_players', uuid, 'INSERT' FROM tournament_players ORDER BY id ASC;

-- Priority 8: Rounds
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) 
SELECT 'rounds', uuid, 'INSERT' FROM rounds ORDER BY id ASC;

-- Priority 9: Matches
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) 
SELECT 'matches', uuid, 'INSERT' FROM matches ORDER BY id ASC;

-- Priority 10: Match Players
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) 
SELECT 'match_players', uuid, 'INSERT' FROM match_players ORDER BY id ASC;

-- Priority 11: Match Results
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) 
SELECT 'match_results', uuid, 'INSERT' FROM match_results ORDER BY id ASC;

-- Priority 12: Player Byes
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) 
SELECT 'player_byes', uuid, 'INSERT' FROM player_byes ORDER BY id ASC;

-- 3. FINAL VERIFICATION
SELECT table_name, count(*) as count FROM sync_audit_logs GROUP BY table_name ORDER BY count DESC;
