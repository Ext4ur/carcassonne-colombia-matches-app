-- 009_auto_hydrate_fks.sql
-- Run this script in the Supabase SQL Editor.
-- It creates triggers that automatically fill the legacy Integer IDs
-- based on the inserted UUIDs from the offline app.

CREATE OR REPLACE FUNCTION hydrate_fks_from_uuids()
RETURNS TRIGGER AS $$
BEGIN
    -- For rounds
    IF TG_TABLE_NAME = 'rounds' THEN
        IF NEW.tournament_uuid IS NOT NULL AND NEW.tournament_id IS NULL THEN
            NEW.tournament_id := (SELECT id FROM tournaments WHERE uuid = NEW.tournament_uuid);
        END IF;
    END IF;

    -- For matches
    IF TG_TABLE_NAME = 'matches' THEN
        IF NEW.round_uuid IS NOT NULL AND NEW.round_id IS NULL THEN
            NEW.round_id := (SELECT id FROM rounds WHERE uuid = NEW.round_uuid);
        END IF;
        IF NEW.first_player_uuid IS NOT NULL AND NEW.first_player_id IS NULL THEN
            NEW.first_player_id := (SELECT id FROM players WHERE uuid = NEW.first_player_uuid);
        END IF;
    END IF;

    -- For match_results
    IF TG_TABLE_NAME = 'match_results' THEN
        IF NEW.match_uuid IS NOT NULL AND NEW.match_id IS NULL THEN
            NEW.match_id := (SELECT id FROM matches WHERE uuid = NEW.match_uuid);
        END IF;
        IF NEW.player_uuid IS NOT NULL AND NEW.player_id IS NULL THEN
            NEW.player_id := (SELECT id FROM players WHERE uuid = NEW.player_uuid);
        END IF;
    END IF;

    -- For tournament_players
    IF TG_TABLE_NAME = 'tournament_players' THEN
        IF NEW.tournament_uuid IS NOT NULL AND NEW.tournament_id IS NULL THEN
            NEW.tournament_id := (SELECT id FROM tournaments WHERE uuid = NEW.tournament_uuid);
        END IF;
        IF NEW.player_uuid IS NOT NULL AND NEW.player_id IS NULL THEN
            NEW.player_id := (SELECT id FROM players WHERE uuid = NEW.player_uuid);
        END IF;
    END IF;

    -- For match_players
    IF TG_TABLE_NAME = 'match_players' THEN
        IF NEW.match_uuid IS NOT NULL AND NEW.match_id IS NULL THEN
            NEW.match_id := (SELECT id FROM matches WHERE uuid = NEW.match_uuid);
        END IF;
        IF NEW.player_uuid IS NOT NULL AND NEW.player_id IS NULL THEN
            NEW.player_id := (SELECT id FROM players WHERE uuid = NEW.player_uuid);
        END IF;
    END IF;

    -- For tournament_configs
    IF TG_TABLE_NAME = 'tournament_configs' THEN
        IF NEW.tournament_uuid IS NOT NULL AND NEW.tournament_id IS NULL THEN
            NEW.tournament_id := (SELECT id FROM tournaments WHERE uuid = NEW.tournament_uuid);
        END IF;
    END IF;

    -- For player_byes
    IF TG_TABLE_NAME = 'player_byes' THEN
        IF NEW.tournament_uuid IS NOT NULL AND NEW.tournament_id IS NULL THEN
            NEW.tournament_id := (SELECT id FROM tournaments WHERE uuid = NEW.tournament_uuid);
        END IF;
        IF NEW.player_uuid IS NOT NULL AND NEW.player_id IS NULL THEN
            NEW.player_id := (SELECT id FROM players WHERE uuid = NEW.player_uuid);
        END IF;
    END IF;

    -- For tournaments
    IF TG_TABLE_NAME = 'tournaments' THEN
        IF NEW.circuit_uuid IS NOT NULL AND NEW.circuit_id IS NULL THEN
            NEW.circuit_id := (SELECT id FROM circuits WHERE uuid = NEW.circuit_uuid);
        END IF;
        IF NEW.place_uuid IS NOT NULL AND NEW.place_id IS NULL THEN
            NEW.place_id := (SELECT id FROM places WHERE uuid = NEW.place_uuid);
        END IF;
    END IF;

    -- For places
    IF TG_TABLE_NAME = 'places' THEN
        IF NEW.city_uuid IS NOT NULL AND NEW.city_id IS NULL THEN
            NEW.city_id := (SELECT id FROM cities WHERE uuid = NEW.city_uuid);
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Avoid creating duplicates if run multiple times
DROP TRIGGER IF EXISTS trg_hydrate_rounds ON rounds;
CREATE TRIGGER trg_hydrate_rounds BEFORE INSERT OR UPDATE ON rounds FOR EACH ROW EXECUTE FUNCTION hydrate_fks_from_uuids();

DROP TRIGGER IF EXISTS trg_hydrate_matches ON matches;
CREATE TRIGGER trg_hydrate_matches BEFORE INSERT OR UPDATE ON matches FOR EACH ROW EXECUTE FUNCTION hydrate_fks_from_uuids();

DROP TRIGGER IF EXISTS trg_hydrate_match_results ON match_results;
CREATE TRIGGER trg_hydrate_match_results BEFORE INSERT OR UPDATE ON match_results FOR EACH ROW EXECUTE FUNCTION hydrate_fks_from_uuids();

DROP TRIGGER IF EXISTS trg_hydrate_tournament_players ON tournament_players;
CREATE TRIGGER trg_hydrate_tournament_players BEFORE INSERT OR UPDATE ON tournament_players FOR EACH ROW EXECUTE FUNCTION hydrate_fks_from_uuids();

DROP TRIGGER IF EXISTS trg_hydrate_match_players ON match_players;
CREATE TRIGGER trg_hydrate_match_players BEFORE INSERT OR UPDATE ON match_players FOR EACH ROW EXECUTE FUNCTION hydrate_fks_from_uuids();

DROP TRIGGER IF EXISTS trg_hydrate_tournament_configs ON tournament_configs;
CREATE TRIGGER trg_hydrate_tournament_configs BEFORE INSERT OR UPDATE ON tournament_configs FOR EACH ROW EXECUTE FUNCTION hydrate_fks_from_uuids();

DROP TRIGGER IF EXISTS trg_hydrate_player_byes ON player_byes;
CREATE TRIGGER trg_hydrate_player_byes BEFORE INSERT OR UPDATE ON player_byes FOR EACH ROW EXECUTE FUNCTION hydrate_fks_from_uuids();

DROP TRIGGER IF EXISTS trg_hydrate_tournaments ON tournaments;
CREATE TRIGGER trg_hydrate_tournaments BEFORE INSERT OR UPDATE ON tournaments FOR EACH ROW EXECUTE FUNCTION hydrate_fks_from_uuids();

DROP TRIGGER IF EXISTS trg_hydrate_places ON places;
CREATE TRIGGER trg_hydrate_places BEFORE INSERT OR UPDATE ON places FOR EACH ROW EXECUTE FUNCTION hydrate_fks_from_uuids();
