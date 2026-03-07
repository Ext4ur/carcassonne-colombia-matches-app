-- 019_top_down_cascade_and_restart.sql
-- Run this script in the Supabase SQL Editor.

-- The previous deep clean deleted from the bottom up.
-- If a Match was deleted because its Round was missing, its Match_Players became orphans AFTER the cleanup.
-- The correct way to clean orphans is TOP-DOWN (Transitive Cascade).

-- 1. CLEAN GHOST UUIDS FIRST
UPDATE matches SET first_player_uuid = NULL WHERE first_player_uuid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM players p WHERE p.uuid = matches.first_player_uuid);
UPDATE tournaments SET circuit_uuid = NULL WHERE circuit_uuid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM circuits c WHERE c.uuid = tournaments.circuit_uuid);
UPDATE tournaments SET place_uuid = NULL WHERE place_uuid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM places p WHERE p.uuid = tournaments.place_uuid);
UPDATE places SET city_uuid = NULL WHERE city_uuid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM cities c WHERE c.uuid = places.city_uuid);

-- 2. TOP-DOWN DELETE CASCADE
-- Any missing top-level record causes the next level down to be deleted, and so on.

-- Level 1: Places without Cities
DELETE FROM places m WHERE m.city_uuid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM cities p WHERE p.uuid = m.city_uuid);

-- Level 2: Tournaments without Circuits/Places
DELETE FROM tournaments m WHERE m.place_uuid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM places p WHERE p.uuid = m.place_uuid);
DELETE FROM tournaments m WHERE m.circuit_uuid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM circuits p WHERE p.uuid = m.circuit_uuid);

-- Level 3: Rounds / Configs / Tournament_Players / Byes without Tournaments
DELETE FROM rounds m WHERE NOT EXISTS (SELECT 1 FROM tournaments p WHERE p.uuid = m.tournament_uuid);
DELETE FROM tournament_configs m WHERE NOT EXISTS (SELECT 1 FROM tournaments p WHERE p.uuid = m.tournament_uuid);
DELETE FROM tournament_players m WHERE NOT EXISTS (SELECT 1 FROM tournaments p WHERE p.uuid = m.tournament_uuid);
DELETE FROM player_byes m WHERE NOT EXISTS (SELECT 1 FROM tournaments p WHERE p.uuid = m.tournament_uuid);

-- Level 4: Matches without Rounds
DELETE FROM matches m WHERE NOT EXISTS (SELECT 1 FROM rounds p WHERE p.uuid = m.round_uuid);

-- Level 5: Match_Players / Match_Results without Matches
DELETE FROM match_players m WHERE NOT EXISTS (SELECT 1 FROM matches p WHERE p.uuid = m.match_uuid);
DELETE FROM match_results m WHERE NOT EXISTS (SELECT 1 FROM matches p WHERE p.uuid = m.match_uuid);

-- Extra: Children without Players
DELETE FROM tournament_players m WHERE NOT EXISTS (SELECT 1 FROM players p WHERE p.uuid = m.player_uuid);
DELETE FROM player_byes m WHERE NOT EXISTS (SELECT 1 FROM players p WHERE p.uuid = m.player_uuid);
DELETE FROM match_players m WHERE NOT EXISTS (SELECT 1 FROM players p WHERE p.uuid = m.player_uuid);
DELETE FROM match_results m WHERE NOT EXISTS (SELECT 1 FROM players p WHERE p.uuid = m.player_uuid);

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

-- 4. VERIFY
SELECT table_name, count(*) as count FROM sync_audit_logs GROUP BY table_name ORDER BY count DESC;
