-- 014_definitive_repair.sql
-- Run this script in the Supabase SQL Editor.

-- 1. FIX FOREIGN KEY CONSTRAINTS
-- Ensure players can be deleted even if they were the first player in a match.
ALTER TABLE matches 
DROP CONSTRAINT IF EXISTS matches_first_player_id_fkey,
ADD CONSTRAINT matches_first_player_id_fkey 
    FOREIGN KEY (first_player_id) 
    REFERENCES players(id) 
    ON DELETE SET NULL;

-- 2. FIX 'ONLINE' DATA CONSISTENCY
-- Ensure we have exactly ONE canonical "Online" city and ONE canonical "Online" place.
DO $$
DECLARE
    canonical_city_id BIGINT;
    canonical_city_uuid UUID;
    canonical_place_id BIGINT;
    canonical_place_uuid UUID;
BEGIN
    -- 2.1. Ensure City exists
    IF NOT EXISTS (SELECT 1 FROM cities WHERE name = 'Online') THEN
        INSERT INTO cities (name, uuid) VALUES ('Online', gen_random_uuid());
    END IF;
    SELECT id, uuid INTO canonical_city_id, canonical_city_uuid FROM cities WHERE name = 'Online' LIMIT 1;

    -- 2.2. Ensure Place exists linked to City
    IF NOT EXISTS (SELECT 1 FROM places WHERE name = 'Online' AND city_id = canonical_city_id) THEN
        INSERT INTO places (name, uuid, city_id, city_uuid) 
        VALUES ('Online', gen_random_uuid(), canonical_city_id, canonical_city_uuid);
    END IF;
    SELECT id, uuid INTO canonical_place_id, canonical_place_uuid FROM places WHERE name = 'Online' AND city_id = canonical_city_id LIMIT 1;

    -- 2.3. Migrate all tournaments from other "Online" placeholders (like the one in Bogotá)
    -- to the canonical one.
    UPDATE tournaments SET 
        place_id = canonical_place_id,
        place_uuid = canonical_place_uuid
    WHERE place_id IN (
        SELECT id FROM places 
        WHERE name = 'Online' AND id <> canonical_place_id
    );

    -- 2.4. Delete the duplicate places
    -- We record the delete in sync_audit_logs manually later to ensure local cleanup
    DELETE FROM places WHERE name = 'Online' AND id <> canonical_place_id;

    RAISE NOTICE 'Canonical Online City: %, Place: %', canonical_city_id, canonical_place_id;
END $$;


-- 3. RESET AND RE-AUDIT IN PERFECT ORDER
-- This is the "Nuclear Reset" to ensure sync is perfect.

-- 3.2. TRUNCATE with RESTART IDENTITY to starting IDs from 1
TRUNCATE sync_audit_logs RESTART IDENTITY;

-- 3.3. RE-AUDIT WITH STRICT PRIORITY
-- We use a single INSERT with an ordered subquery to guarantee ID sequence
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

-- 4. FINAL SECURITY REFRESH
ALTER TABLE sync_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable read access for all users" ON sync_audit_logs;
CREATE POLICY "Enable read access for all users" ON sync_audit_logs FOR SELECT USING (true);
DROP POLICY IF EXISTS "Enable insert for all users" ON sync_audit_logs;
CREATE POLICY "Enable insert for all users" ON sync_audit_logs FOR INSERT WITH CHECK (true);

-- End of script
