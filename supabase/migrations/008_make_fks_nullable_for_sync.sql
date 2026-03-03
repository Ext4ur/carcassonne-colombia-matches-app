-- Allow NULLs in numeric ID columns to support UUID-based synchronization
ALTER TABLE places ALTER COLUMN city_id DROP NOT NULL;
ALTER TABLE tournaments ALTER COLUMN circuit_id DROP NOT NULL;
ALTER TABLE tournaments ALTER COLUMN place_id DROP NOT NULL;
ALTER TABLE tournament_configs ALTER COLUMN tournament_id DROP NOT NULL;
ALTER TABLE tournament_players ALTER COLUMN tournament_id DROP NOT NULL;
ALTER TABLE tournament_players ALTER COLUMN player_id DROP NOT NULL;
ALTER TABLE rounds ALTER COLUMN tournament_id DROP NOT NULL;
ALTER TABLE matches ALTER COLUMN round_id DROP NOT NULL;
ALTER TABLE match_players ALTER COLUMN match_id DROP NOT NULL;
ALTER TABLE match_players ALTER COLUMN player_id DROP NOT NULL;
ALTER TABLE match_results ALTER COLUMN match_id DROP NOT NULL;
ALTER TABLE match_results ALTER COLUMN player_id DROP NOT NULL;
ALTER TABLE player_byes ALTER COLUMN tournament_id DROP NOT NULL;
ALTER TABLE player_byes ALTER COLUMN player_id DROP NOT NULL;
