-- 010_backfill_existing_fks.sql
-- Run this script in the Supabase SQL Editor.
-- It attempts to populate the Integer IDs based on existing UUID relationships.
-- Designed to be BULLETPROOF against UNIQUE constraint errors.

-- 1. TOURNAMENT_PLAYERS
-- Remove ghosts if a valid record already exists
DELETE FROM tournament_players ghost
WHERE ghost.tournament_id IS NULL
  AND EXISTS (
    SELECT 1 FROM tournament_players valid
    WHERE valid.tournament_id IS NOT NULL 
      AND valid.tournament_id = (SELECT id FROM tournaments t WHERE t.uuid = ghost.tournament_uuid)
      AND valid.player_id = (SELECT id FROM players p WHERE p.uuid = ghost.player_uuid)
  );
-- Remove duplicate ghosts
DELETE FROM tournament_players
WHERE tournament_id IS NULL AND tournament_uuid IS NOT NULL AND player_uuid IS NOT NULL
  AND id NOT IN (
    SELECT MIN(id) FROM tournament_players
    WHERE tournament_id IS NULL
    GROUP BY tournament_uuid, player_uuid
  );
-- Now safe to update
UPDATE tournament_players
SET tournament_id = (SELECT id FROM tournaments WHERE uuid = tournament_players.tournament_uuid),
    player_id = (SELECT id FROM players WHERE uuid = tournament_players.player_uuid)
WHERE tournament_id IS NULL;


-- 2. MATCH_RESULTS
DELETE FROM match_results ghost
WHERE ghost.match_id IS NULL
  AND EXISTS (
    SELECT 1 FROM match_results valid
    WHERE valid.match_id IS NOT NULL 
      AND valid.match_id = (SELECT id FROM matches m WHERE m.uuid = ghost.match_uuid)
      AND valid.player_id = (SELECT id FROM players p WHERE p.uuid = ghost.player_uuid)
  );
DELETE FROM match_results
WHERE match_id IS NULL AND match_uuid IS NOT NULL AND player_uuid IS NOT NULL
  AND id NOT IN (
    SELECT MIN(id) FROM match_results
    WHERE match_id IS NULL
    GROUP BY match_uuid, player_uuid
  );
UPDATE match_results
SET match_id = (SELECT id FROM matches WHERE uuid = match_results.match_uuid),
    player_id = (SELECT id FROM players WHERE uuid = match_results.player_uuid)
WHERE match_id IS NULL;


-- 3. MATCH_PLAYERS
DELETE FROM match_players ghost
WHERE ghost.match_id IS NULL
  AND EXISTS (
    SELECT 1 FROM match_players valid
    WHERE valid.match_id IS NOT NULL 
      AND valid.match_id = (SELECT id FROM matches m WHERE m.uuid = ghost.match_uuid)
      AND valid.player_id = (SELECT id FROM players p WHERE p.uuid = ghost.player_uuid)
  );
DELETE FROM match_players
WHERE match_id IS NULL AND match_uuid IS NOT NULL AND player_uuid IS NOT NULL
  AND id NOT IN (
    SELECT MIN(id) FROM match_players
    WHERE match_id IS NULL
    GROUP BY match_uuid, player_uuid
  );
UPDATE match_players
SET match_id = (SELECT id FROM matches WHERE uuid = match_players.match_uuid),
    player_id = (SELECT id FROM players WHERE uuid = match_players.player_uuid)
WHERE match_id IS NULL;


-- 4. ROUNDS
DELETE FROM rounds ghost
WHERE ghost.tournament_id IS NULL
  AND EXISTS (
    SELECT 1 FROM rounds valid
    WHERE valid.tournament_id IS NOT NULL 
      AND valid.tournament_id = (SELECT id FROM tournaments t WHERE t.uuid = ghost.tournament_uuid)
      AND valid.round_number = ghost.round_number
  );
DELETE FROM rounds
WHERE tournament_id IS NULL AND tournament_uuid IS NOT NULL
  AND id NOT IN (
    SELECT MIN(id) FROM rounds
    WHERE tournament_id IS NULL
    GROUP BY tournament_uuid, round_number
  );
UPDATE rounds 
SET tournament_id = (SELECT id FROM tournaments WHERE uuid = rounds.tournament_uuid)
WHERE tournament_id IS NULL;


-- 5. MATCHES
DELETE FROM matches ghost
WHERE ghost.round_id IS NULL
  AND EXISTS (
    SELECT 1 FROM matches valid
    WHERE valid.round_id IS NOT NULL 
      AND valid.round_id = (SELECT id FROM rounds r WHERE r.uuid = ghost.round_uuid)
      AND valid.match_number = ghost.match_number
  );
DELETE FROM matches
WHERE round_id IS NULL AND round_uuid IS NOT NULL
  AND id NOT IN (
    SELECT MIN(id) FROM matches
    WHERE round_id IS NULL
    GROUP BY round_uuid, match_number
  );
UPDATE matches 
SET round_id = (SELECT id FROM rounds WHERE uuid = matches.round_uuid),
    first_player_id = (SELECT id FROM players WHERE uuid = matches.first_player_uuid)
WHERE round_id IS NULL;


-- 6. PLAYER BYES
DELETE FROM player_byes ghost
WHERE ghost.tournament_id IS NULL
  AND EXISTS (
    SELECT 1 FROM player_byes valid
    WHERE valid.tournament_id IS NOT NULL 
      AND valid.tournament_id = (SELECT id FROM tournaments t WHERE t.uuid = ghost.tournament_uuid)
      AND valid.player_id = (SELECT id FROM players p WHERE p.uuid = ghost.player_uuid)
      AND valid.round_number = ghost.round_number
  );
DELETE FROM player_byes
WHERE tournament_id IS NULL AND tournament_uuid IS NOT NULL AND player_uuid IS NOT NULL
  AND id NOT IN (
    SELECT MIN(id) FROM player_byes
    WHERE tournament_id IS NULL
    GROUP BY tournament_uuid, player_uuid, round_number
  );
UPDATE player_byes
SET tournament_id = (SELECT id FROM tournaments WHERE uuid = player_byes.tournament_uuid),
    player_id = (SELECT id FROM players WHERE uuid = player_byes.player_uuid)
WHERE tournament_id IS NULL;


-- 7. TOURNAMENT_CONFIGS
DELETE FROM tournament_configs ghost
WHERE ghost.tournament_id IS NULL
  AND EXISTS (
    SELECT 1 FROM tournament_configs valid
    WHERE valid.tournament_id IS NOT NULL 
      AND valid.tournament_id = (SELECT id FROM tournaments t WHERE t.uuid = ghost.tournament_uuid)
  );
DELETE FROM tournament_configs
WHERE tournament_id IS NULL AND tournament_uuid IS NOT NULL
  AND id NOT IN (
    SELECT MIN(id) FROM tournament_configs
    WHERE tournament_id IS NULL
    GROUP BY tournament_uuid
  );
UPDATE tournament_configs
SET tournament_id = (SELECT id FROM tournaments WHERE uuid = tournament_configs.tournament_uuid)
WHERE tournament_id IS NULL;


-- 8. TOURNAMENTS & PLACES (No Unique Constraints to worry about here)
UPDATE tournaments
SET circuit_id = (SELECT id FROM circuits WHERE circuits.uuid = tournaments.circuit_uuid)
WHERE circuit_id IS NULL AND circuit_uuid IS NOT NULL;
UPDATE tournaments
SET place_id = (SELECT id FROM places WHERE places.uuid = tournaments.place_uuid)
WHERE place_id IS NULL AND place_uuid IS NOT NULL;

UPDATE places
SET city_id = (SELECT id FROM cities WHERE cities.uuid = places.city_uuid)
WHERE city_id IS NULL AND city_uuid IS NOT NULL;
