-- 013_final_repair_and_data.sql
-- Run this script in the Supabase SQL Editor.

-- 1. FIX FOREIGN KEY CONSTRAINTS
-- Change first_player_id to SET NULL on delete instead of RESTRICT
-- This prevents the "Conflict" error when deleting a player.
ALTER TABLE matches 
DROP CONSTRAINT IF EXISTS matches_first_player_id_fkey,
ADD CONSTRAINT matches_first_player_id_fkey 
    FOREIGN KEY (first_player_id) 
    REFERENCES players(id) 
    ON DELETE SET NULL;

-- 2. FIX 'ONLINE' DATA CONSISTENCY
-- Ensure we have an "Online" city
INSERT INTO cities (name, uuid) 
SELECT 'Online', gen_random_uuid() 
WHERE NOT EXISTS (SELECT 1 FROM cities WHERE name = 'Online');

-- Ensure we have an "Online" place linked to the "Online" city
DO $$
DECLARE
    online_city_id BIGINT;
    online_city_uuid UUID;
BEGIN
    SELECT id, uuid INTO online_city_id, online_city_uuid FROM cities WHERE name = 'Online' LIMIT 1;

    -- Update any existing 'Online' places to point to the 'Online' city
    UPDATE places SET 
        city_id = online_city_id,
        city_uuid = online_city_uuid
    WHERE name = 'Online';

    -- If no 'Online' place exists at all, create it
    IF NOT EXISTS (SELECT 1 FROM places WHERE name = 'Online') THEN
        INSERT INTO places (name, uuid, city_id, city_uuid)
        VALUES ('Online', gen_random_uuid(), online_city_id, online_city_uuid);
    END IF;
END $$;

-- Deduplicate "Online" places if there are multiple
-- Keep only one (the one with the lowest ID) and point all tournaments to it.
DO $$
DECLARE
    target_place_id BIGINT;
    target_place_uuid UUID;
BEGIN
    SELECT id, uuid INTO target_place_id, target_place_uuid FROM places WHERE name = 'Online' ORDER BY id ASC LIMIT 1;

    -- Update all tournaments to using this canonical 'Online' place
    UPDATE tournaments SET 
        place_id = target_place_id,
        place_uuid = target_place_uuid
    WHERE place_id IN (SELECT id FROM places WHERE name = 'Online' AND id <> target_place_id);

    -- Delete the duplicate 'Online' places
    DELETE FROM places WHERE name = 'Online' AND id <> target_place_id;
END $$;


-- 3. RESET AND RE-AUDIT IN STRICT ORDER
-- This ensures sync_audit_logs are created in dependency order (Cities -> Places -> ...)
TRUNCATE sync_audit_logs;

-- Order is CRITICAL here
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) SELECT 'cities', uuid, 'INSERT' FROM cities WHERE uuid IS NOT NULL;
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) SELECT 'places', uuid, 'INSERT' FROM places WHERE uuid IS NOT NULL;
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) SELECT 'circuits', uuid, 'INSERT' FROM circuits WHERE uuid IS NOT NULL;
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) SELECT 'players', uuid, 'INSERT' FROM players WHERE uuid IS NOT NULL;
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) SELECT 'tournaments', uuid, 'INSERT' FROM tournaments WHERE uuid IS NOT NULL;
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) SELECT 'tournament_configs', uuid, 'INSERT' FROM tournament_configs WHERE uuid IS NOT NULL;
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) SELECT 'tournament_players', uuid, 'INSERT' FROM tournament_players WHERE uuid IS NOT NULL;
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) SELECT 'rounds', uuid, 'INSERT' FROM rounds WHERE uuid IS NOT NULL;
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) SELECT 'matches', uuid, 'INSERT' FROM matches WHERE uuid IS NOT NULL;
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) SELECT 'match_players', uuid, 'INSERT' FROM match_players WHERE uuid IS NOT NULL;
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) SELECT 'match_results', uuid, 'INSERT' FROM match_results WHERE uuid IS NOT NULL;
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) SELECT 'player_byes', uuid, 'INSERT' FROM player_byes WHERE uuid IS NOT NULL;

-- 4. FINAL CHECK
-- Ensure RLS is still correct
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON sync_audit_logs;
DROP POLICY IF EXISTS "Enable read access for all users" ON sync_audit_logs;
CREATE POLICY "Enable read access for all users" ON sync_audit_logs FOR SELECT USING (true);
DROP POLICY IF EXISTS "Enable insert for all users" ON sync_audit_logs;
CREATE POLICY "Enable insert for all users" ON sync_audit_logs FOR INSERT WITH CHECK (true);
