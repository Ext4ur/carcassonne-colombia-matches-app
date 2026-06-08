-- 015_cleanup_orphans.sql
-- Run this script in the Supabase SQL Editor.

-- 1. CLEAN UP ORPHANS (Records referring to non-existent parents)
-- We use UUIDs as the source of truth for these checks.

-- 1.1. Match Results/Players (Orphan if Match is gone)
DELETE FROM match_results WHERE match_uuid NOT IN (SELECT uuid FROM matches);
DELETE FROM match_players WHERE match_uuid NOT IN (SELECT uuid FROM matches);

-- 1.2. Matches (Orphan if Round is gone)
DELETE FROM matches WHERE round_uuid NOT IN (SELECT uuid FROM rounds);

-- 1.3. Rounds (Orphan if Tournament is gone)
DELETE FROM rounds WHERE tournament_uuid NOT IN (SELECT uuid FROM tournaments);

-- 1.4. Tournament Configs/Players/Byes (Orphan if Tournament is gone)
DELETE FROM tournament_configs WHERE tournament_uuid NOT IN (SELECT uuid FROM tournaments);
DELETE FROM tournament_players WHERE tournament_uuid NOT IN (SELECT uuid FROM tournaments);
DELETE FROM player_byes WHERE tournament_uuid NOT IN (SELECT uuid FROM tournaments);

-- 1.5. Tournament Players/Byes (Orphan if Player is gone)
DELETE FROM tournament_players WHERE player_uuid NOT IN (SELECT uuid FROM players);
DELETE FROM player_byes WHERE player_uuid NOT IN (SELECT uuid FROM players);

-- 1.6. Tournaments (Orphan if Place or Circuit is gone)
DELETE FROM tournaments WHERE place_uuid IS NOT NULL AND place_uuid NOT IN (SELECT uuid FROM places);
DELETE FROM tournaments WHERE circuit_uuid IS NOT NULL AND circuit_uuid NOT IN (SELECT uuid FROM circuits);

-- 1.7. Places (Orphan if City is gone)
DELETE FROM places WHERE city_uuid IS NOT NULL AND city_uuid NOT IN (SELECT uuid FROM cities);


-- 2. PERFORM "NUCLEAR RESET" OF AUDIT LOGS
-- This ensures the sync pointer resets and processes everything in correct order.

TRUNCATE sync_audit_logs RESTART IDENTITY;

INSERT INTO sync_audit_logs (table_name, record_uuid, operation)
SELECT table_name, record_uuid, operation
FROM (
  SELECT 'cities' as table_name, uuid as record_uuid, 'INSERT' as operation, 1 as priority FROM cities WHERE uuid IS NOT NULL
  UNION ALL
  SELECT 'places', uuid, 'INSERT', 2 FROM places WHERE uuid IS NOT NULL
  UNION ALL
  SELECT 'circuits', uuid, 'INSERT', 3 FROM circuits WHERE uuid IS NOT NULL
  UNION ALL
  SELECT 'players', uuid, 'INSERT', 4 FROM players WHERE uuid IS NOT NULL
  UNION ALL
  SELECT 'tournaments', uuid, 'INSERT', 5 FROM tournaments WHERE uuid IS NOT NULL
  UNION ALL
  SELECT 'tournament_configs', uuid, 'INSERT', 6 FROM tournament_configs WHERE uuid IS NOT NULL
  UNION ALL
  SELECT 'tournament_players', uuid, 'INSERT', 7 FROM tournament_players WHERE uuid IS NOT NULL
  UNION ALL
  SELECT 'rounds', uuid, 'INSERT', 8 FROM rounds WHERE uuid IS NOT NULL
  UNION ALL
  SELECT 'matches', uuid, 'INSERT', 9 FROM matches WHERE uuid IS NOT NULL
  UNION ALL
  SELECT 'match_players', uuid, 'INSERT', 10 FROM match_players WHERE uuid IS NOT NULL
  UNION ALL
  SELECT 'match_results', uuid, 'INSERT', 11 FROM match_results WHERE uuid IS NOT NULL
  UNION ALL
  SELECT 'player_byes', uuid, 'INSERT', 12 FROM player_byes WHERE uuid IS NOT NULL
) ordered_logs
ORDER BY priority ASC;

-- Verify
SELECT COUNT(*) as total_logs FROM sync_audit_logs;
