-- 016_guaranteed_sync_order.sql
-- Run this script in the Supabase SQL Editor.

-- This script ensures sync logs are generated in strict sequential order.
-- We use separate INSERT statements to guarantee that IDs (1, 2, 3...) 
-- are assigned correctly for Parent-Child relationships.

-- 1. CLEAN UP PREVIOUS LOGS
TRUNCATE sync_audit_logs RESTART IDENTITY;

-- 2. BACKFILL IN STRICT SEQUENTIAL ORDER
-- Priority 1: Cities (Dependency for Places)
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) 
SELECT 'cities', uuid, 'INSERT' FROM cities WHERE uuid IS NOT NULL ORDER BY id ASC;

-- Priority 2: Places (Dependency for Tournaments)
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) 
SELECT 'places', uuid, 'INSERT' FROM places WHERE uuid IS NOT NULL ORDER BY id ASC;

-- Priority 3: Circuits (Dependency for Tournaments)
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) 
SELECT 'circuits', uuid, 'INSERT' FROM circuits WHERE uuid IS NOT NULL ORDER BY id ASC;

-- Priority 4: Players (Dependency for Tournament_Players, Match_Players, etc.)
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) 
SELECT 'players', uuid, 'INSERT' FROM players WHERE uuid IS NOT NULL ORDER BY id ASC;

-- Priority 5: Tournaments (Dependency for Configs, Players, Rounds)
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) 
SELECT 'tournaments', uuid, 'INSERT' FROM tournaments WHERE uuid IS NOT NULL ORDER BY id ASC;

-- Priority 6: Tournament Configs (Dependent on Tournaments)
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) 
SELECT 'tournament_configs', uuid, 'INSERT' FROM tournament_configs WHERE uuid IS NOT NULL ORDER BY id ASC;

-- Priority 7: Tournament Players (Dependent on Tournaments & Players)
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) 
SELECT 'tournament_players', uuid, 'INSERT' FROM tournament_players WHERE uuid IS NOT NULL ORDER BY id ASC;

-- Priority 8: Rounds (Dependent on Tournaments)
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) 
SELECT 'rounds', uuid, 'INSERT' FROM rounds WHERE uuid IS NOT NULL ORDER BY id ASC;

-- Priority 9: Matches (Dependent on Rounds)
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) 
SELECT 'matches', uuid, 'INSERT' FROM matches WHERE uuid IS NOT NULL ORDER BY id ASC;

-- Priority 10: Match Players (Dependent on Matches & Players)
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) 
SELECT 'match_players', uuid, 'INSERT' FROM match_players WHERE uuid IS NOT NULL ORDER BY id ASC;

-- Priority 11: Match Results (Dependent on Matches & Players)
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) 
SELECT 'match_results', uuid, 'INSERT' FROM match_results WHERE uuid IS NOT NULL ORDER BY id ASC;

-- Priority 12: Player Byes (Dependent on Tournaments & Players)
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) 
SELECT 'player_byes', uuid, 'INSERT' FROM player_byes WHERE uuid IS NOT NULL ORDER BY id ASC;

-- 3. FINAL VERIFICATION
SELECT table_name, count(*) FROM sync_audit_logs GROUP BY table_name;
-- Ensure IDs are assigned
SELECT * FROM sync_audit_logs ORDER BY id ASC LIMIT 50;
