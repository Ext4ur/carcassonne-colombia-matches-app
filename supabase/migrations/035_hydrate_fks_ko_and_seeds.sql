-- 035: Actualiza hydrate_fks_from_uuids para series_winner_uuid y tournament_knockout_seeds.

CREATE OR REPLACE FUNCTION hydrate_fks_from_uuids()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_TABLE_NAME = 'rounds' THEN
        IF NEW.tournament_uuid IS NOT NULL AND NEW.tournament_id IS NULL THEN
            NEW.tournament_id := (SELECT id FROM tournaments WHERE uuid = NEW.tournament_uuid);
        END IF;
    END IF;

    IF TG_TABLE_NAME = 'matches' THEN
        IF NEW.round_uuid IS NOT NULL AND NEW.round_id IS NULL THEN
            NEW.round_id := (SELECT id FROM rounds WHERE uuid = NEW.round_uuid);
        END IF;
        IF NEW.first_player_uuid IS NOT NULL AND NEW.first_player_id IS NULL THEN
            NEW.first_player_id := (SELECT id FROM players WHERE uuid = NEW.first_player_uuid);
        END IF;
        IF NEW.series_winner_uuid IS NOT NULL AND NEW.series_winner_id IS NULL THEN
            NEW.series_winner_id := (SELECT id FROM players WHERE uuid = NEW.series_winner_uuid);
        END IF;
    END IF;

    IF TG_TABLE_NAME = 'match_results' THEN
        IF NEW.match_uuid IS NOT NULL AND NEW.match_id IS NULL THEN
            NEW.match_id := (SELECT id FROM matches WHERE uuid = NEW.match_uuid);
        END IF;
        IF NEW.player_uuid IS NOT NULL AND NEW.player_id IS NULL THEN
            NEW.player_id := (SELECT id FROM players WHERE uuid = NEW.player_uuid);
        END IF;
    END IF;

    IF TG_TABLE_NAME = 'tournament_players' THEN
        IF NEW.tournament_uuid IS NOT NULL AND NEW.tournament_id IS NULL THEN
            NEW.tournament_id := (SELECT id FROM tournaments WHERE uuid = NEW.tournament_uuid);
        END IF;
        IF NEW.player_uuid IS NOT NULL AND NEW.player_id IS NULL THEN
            NEW.player_id := (SELECT id FROM players WHERE uuid = NEW.player_uuid);
        END IF;
    END IF;

    IF TG_TABLE_NAME = 'match_players' THEN
        IF NEW.match_uuid IS NOT NULL AND NEW.match_id IS NULL THEN
            NEW.match_id := (SELECT id FROM matches WHERE uuid = NEW.match_uuid);
        END IF;
        IF NEW.player_uuid IS NOT NULL AND NEW.player_id IS NULL THEN
            NEW.player_id := (SELECT id FROM players WHERE uuid = NEW.player_uuid);
        END IF;
    END IF;

    IF TG_TABLE_NAME = 'tournament_configs' THEN
        IF NEW.tournament_uuid IS NOT NULL AND NEW.tournament_id IS NULL THEN
            NEW.tournament_id := (SELECT id FROM tournaments WHERE uuid = NEW.tournament_uuid);
        END IF;
    END IF;

    IF TG_TABLE_NAME = 'player_byes' THEN
        IF NEW.tournament_uuid IS NOT NULL AND NEW.tournament_id IS NULL THEN
            NEW.tournament_id := (SELECT id FROM tournaments WHERE uuid = NEW.tournament_uuid);
        END IF;
        IF NEW.player_uuid IS NOT NULL AND NEW.player_id IS NULL THEN
            NEW.player_id := (SELECT id FROM players WHERE uuid = NEW.player_uuid);
        END IF;
    END IF;

    IF TG_TABLE_NAME = 'tournaments' THEN
        IF NEW.circuit_uuid IS NOT NULL AND NEW.circuit_id IS NULL THEN
            NEW.circuit_id := (SELECT id FROM circuits WHERE uuid = NEW.circuit_uuid);
        END IF;
        IF NEW.place_uuid IS NOT NULL AND NEW.place_id IS NULL THEN
            NEW.place_id := (SELECT id FROM places WHERE uuid = NEW.place_uuid);
        END IF;
    END IF;

    IF TG_TABLE_NAME = 'places' THEN
        IF NEW.city_uuid IS NOT NULL AND NEW.city_id IS NULL THEN
            NEW.city_id := (SELECT id FROM cities WHERE uuid = NEW.city_uuid);
        END IF;
    END IF;

    IF TG_TABLE_NAME = 'tournament_knockout_seeds' THEN
        IF NEW.tournament_uuid IS NOT NULL AND NEW.tournament_id IS NULL THEN
            NEW.tournament_id := (SELECT id FROM tournaments WHERE uuid = NEW.tournament_uuid);
        END IF;
        IF NEW.player_uuid IS NOT NULL AND NEW.player_id IS NULL THEN
            NEW.player_id := (SELECT id FROM players WHERE uuid = NEW.player_uuid);
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hydrate_ko_seeds ON tournament_knockout_seeds;
CREATE TRIGGER trg_hydrate_ko_seeds
  BEFORE INSERT OR UPDATE ON tournament_knockout_seeds
  FOR EACH ROW EXECUTE FUNCTION hydrate_fks_from_uuids();

-- RLS para KO seeds si la tabla existe (029 puede haberse aplicado antes de crear la tabla)
ALTER TABLE tournament_knockout_seeds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_sync_all" ON tournament_knockout_seeds;
CREATE POLICY "authenticated_sync_all" ON tournament_knockout_seeds
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
