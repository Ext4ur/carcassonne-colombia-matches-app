-- 032: Reparación idempotente de config KO (equivalente seguro a 027).

ALTER TABLE tournament_configs
  ADD COLUMN IF NOT EXISTS knockout_play_bronze_match BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE tournament_configs
  ADD COLUMN IF NOT EXISTS knockout_match_starter TEXT NOT NULL DEFAULT 'higher_swiss_seed';

ALTER TABLE tournament_configs
  ADD COLUMN IF NOT EXISTS knockout_series_alternate_starter BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS knockout_match_stage TEXT;

ALTER TABLE tournament_configs DROP CONSTRAINT IF EXISTS tournament_configs_knockout_match_starter_check;
ALTER TABLE tournament_configs
  ADD CONSTRAINT tournament_configs_knockout_match_starter_check
  CHECK (knockout_match_starter IN ('random', 'higher_swiss_seed'));

ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_knockout_match_stage_check;
ALTER TABLE matches
  ADD CONSTRAINT matches_knockout_match_stage_check
  CHECK (knockout_match_stage IS NULL OR knockout_match_stage IN ('final', 'third_place'));
