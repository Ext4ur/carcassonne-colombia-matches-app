-- 017_deep_clean.sql
-- Run this script in the Supabase SQL Editor.

-- The previous cleanup used NOT IN (SELECT uuid FROM rounds).
-- If even ONE round has a NULL uuid, the entire NOT IN clause evaluates to UNKNOWN
-- and NO rows are deleted. This left orphaned matches in the database!
-- We use NOT EXISTS instead, which is safe against NULLs.

-- 1. DELETE ORPHANS SAFELY
DELETE FROM match_results m WHERE NOT EXISTS (SELECT 1 FROM matches p WHERE p.uuid = m.match_uuid);
DELETE FROM match_players m WHERE NOT EXISTS (SELECT 1 FROM matches p WHERE p.uuid = m.match_uuid);
DELETE FROM matches m WHERE NOT EXISTS (SELECT 1 FROM rounds p WHERE p.uuid = m.round_uuid);
DELETE FROM rounds m WHERE NOT EXISTS (SELECT 1 FROM tournaments p WHERE p.uuid = m.tournament_uuid);

DELETE FROM tournament_configs m WHERE NOT EXISTS (SELECT 1 FROM tournaments p WHERE p.uuid = m.tournament_uuid);
DELETE FROM tournament_players m WHERE NOT EXISTS (SELECT 1 FROM tournaments p WHERE p.uuid = m.tournament_uuid);
DELETE FROM player_byes m WHERE NOT EXISTS (SELECT 1 FROM tournaments p WHERE p.uuid = m.tournament_uuid);

DELETE FROM tournament_players m WHERE NOT EXISTS (SELECT 1 FROM players p WHERE p.uuid = m.player_uuid);
DELETE FROM player_byes m WHERE NOT EXISTS (SELECT 1 FROM players p WHERE p.uuid = m.player_uuid);
DELETE FROM match_players m WHERE NOT EXISTS (SELECT 1 FROM players p WHERE p.uuid = m.player_uuid);
DELETE FROM match_results m WHERE NOT EXISTS (SELECT 1 FROM players p WHERE p.uuid = m.player_uuid);

DELETE FROM tournaments m WHERE m.place_uuid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM places p WHERE p.uuid = m.place_uuid);
DELETE FROM tournaments m WHERE m.circuit_uuid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM circuits p WHERE p.uuid = m.circuit_uuid);
DELETE FROM places m WHERE m.city_uuid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM cities p WHERE p.uuid = m.city_uuid);

-- 2. DELETE ANY BAD DATA WITHOUT UUIDs (Required for sync)
DELETE FROM match_results WHERE uuid IS NULL;
DELETE FROM match_players WHERE uuid IS NULL;
DELETE FROM matches WHERE uuid IS NULL;
DELETE FROM rounds WHERE uuid IS NULL;
DELETE FROM tournament_configs WHERE uuid IS NULL;
DELETE FROM tournament_players WHERE uuid IS NULL;
DELETE FROM player_byes WHERE uuid IS NULL;
DELETE FROM tournaments WHERE uuid IS NULL;
DELETE FROM players WHERE uuid IS NULL;
DELETE FROM places WHERE uuid IS NULL;
DELETE FROM circuits WHERE uuid IS NULL;
DELETE FROM cities WHERE uuid IS NULL;

-- 3. CLEAN UP PREVIOUS LOGS
TRUNCATE sync_audit_logs RESTART IDENTITY;

-- 4. BACKFILL IN STRICT SEQUENTIAL ORDER
-- Priority 1: Cities (Dependency for Places)
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) 
SELECT 'cities', uuid, 'INSERT' FROM cities ORDER BY id ASC;

-- Priority 2: Places (Dependency for Tournaments)
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) 
SELECT 'places', uuid, 'INSERT' FROM places ORDER BY id ASC;

-- Priority 3: Circuits (Dependency for Tournaments)
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) 
SELECT 'circuits', uuid, 'INSERT' FROM circuits ORDER BY id ASC;

-- Priority 4: Players (Dependency for Tournament_Players, Match_Players, etc.)
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) 
SELECT 'players', uuid, 'INSERT' FROM players ORDER BY id ASC;

-- Priority 5: Tournaments (Dependency for Configs, Players, Rounds)
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) 
SELECT 'tournaments', uuid, 'INSERT' FROM tournaments ORDER BY id ASC;

-- Priority 6: Tournament Configs (Dependent on Tournaments)
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) 
SELECT 'tournament_configs', uuid, 'INSERT' FROM tournament_configs ORDER BY id ASC;

-- Priority 7: Tournament Players (Dependent on Tournaments & Players)
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) 
SELECT 'tournament_players', uuid, 'INSERT' FROM tournament_players ORDER BY id ASC;

-- Priority 8: Rounds (Dependent on Tournaments)
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) 
SELECT 'rounds', uuid, 'INSERT' FROM rounds ORDER BY id ASC;

-- Priority 9: Matches (Dependent on Rounds)
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) 
SELECT 'matches', uuid, 'INSERT' FROM matches ORDER BY id ASC;

-- Priority 10: Match Players (Dependent on Matches & Players)
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) 
SELECT 'match_players', uuid, 'INSERT' FROM match_players ORDER BY id ASC;

-- Priority 11: Match Results (Dependent on Matches & Players)
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) 
SELECT 'match_results', uuid, 'INSERT' FROM match_results ORDER BY id ASC;

-- Priority 12: Player Byes (Dependent on Tournaments & Players)
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) 
SELECT 'player_byes', uuid, 'INSERT' FROM player_byes ORDER BY id ASC;

-- 5. FINAL VERIFICATION
SELECT table_name, count(*) as count FROM sync_audit_logs GROUP BY table_name ORDER BY count DESC;
