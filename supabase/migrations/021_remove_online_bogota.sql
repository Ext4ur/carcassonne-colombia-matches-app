-- 021_remove_online_bogota.sql
-- Run this script in the Supabase SQL Editor.

-- This script safely removes the duplicate "Online" place (the one assigned to Bogotá)
-- and reassigns any existing tournaments to the main "Online" (Online) place.

DO $$
DECLARE
    main_online_id INTEGER;
    main_online_uuid TEXT;
    bogota_online_id INTEGER;
    bogota_online_uuid TEXT;
BEGIN
    -- 1. Find the main "Online" place (usually the one without a city or assigned to a generic city)
    -- Looking for the place with name 'Online' and no city_id (or a specific 'Online' city)
    SELECT id, uuid INTO main_online_id, main_online_uuid
    FROM places 
    WHERE name = 'Online' AND city_id IS NULL
    LIMIT 1;

    -- If there isn't an 'Online' without a city, get the FIRST 'Online' that is NOT Bogotá
    IF main_online_id IS NULL THEN
        SELECT p.id, p.uuid INTO main_online_id, main_online_uuid
        FROM places p
        LEFT JOIN cities c ON p.city_id = c.id
        WHERE p.name = 'Online' AND (c.name != 'Bogotá' OR c.name IS NULL)
        ORDER BY p.id ASC
        LIMIT 1;
    END IF;

    -- 2. Find the "Online" place assigned to "Bogotá"
    SELECT p.id, p.uuid INTO bogota_online_id, bogota_online_uuid
    FROM places p
    JOIN cities c ON p.city_id = c.id
    WHERE p.name = 'Online' AND c.name = 'Bogotá'
    LIMIT 1;

    -- 3. Execute the reassignment and deletion if both exist
    IF main_online_id IS NOT NULL AND bogota_online_id IS NOT NULL AND main_online_id != bogota_online_id THEN
        
        RAISE NOTICE 'Reassigning tournaments from Place % to Place %', bogota_online_id, main_online_id;

        -- Reassign tournaments ID
        UPDATE tournaments 
        SET place_id = main_online_id, place_uuid = main_online_uuid
        WHERE place_id = bogota_online_id OR place_uuid = bogota_online_uuid;

        -- Delete the duplicate place
        DELETE FROM places WHERE id = bogota_online_id;

        -- Log changes to sync audit logs
        -- (Since only tournaments were updated, we insert them again into the logs)
        -- (The DELETE of the place will generate a log via the trigger, but we can also manually ensure it)

        RAISE NOTICE 'Successfully deleted Online-Bogotá (ID: %)', bogota_online_id;
    ELSE
        RAISE NOTICE 'Could not find either Main Online or Bogota Online, or they are the same. No action taken.';
    END IF;

END $$;

-- 4. Clean logs one last time to make sure everyone downloads the updated Places and Tournaments list
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
