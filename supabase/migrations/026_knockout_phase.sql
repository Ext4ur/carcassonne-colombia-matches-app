-- Swiss + knockout phase: competition_format, KO config, round phase, match series, game_number

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS competition_format TEXT NOT NULL DEFAULT 'swiss';

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS knockout_phase_started_at TIMESTAMPTZ;

ALTER TABLE tournament_configs
  ADD COLUMN IF NOT EXISTS knockout_size INTEGER DEFAULT 8;

ALTER TABLE tournament_configs
  ADD COLUMN IF NOT EXISTS knockout_seeding TEXT DEFAULT 'standard_bracket';

ALTER TABLE tournament_configs
  ADD COLUMN IF NOT EXISTS knockout_series TEXT DEFAULT 'best_of_1';

ALTER TABLE tournament_configs
  ADD COLUMN IF NOT EXISTS swiss_standings_snapshot TEXT;

ALTER TABLE rounds
  ADD COLUMN IF NOT EXISTS phase TEXT NOT NULL DEFAULT 'swiss';

ALTER TABLE rounds
  ADD COLUMN IF NOT EXISTS knockout_stage TEXT;

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS knockout_bracket_slot INTEGER;

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS series_target_wins INTEGER DEFAULT 1;

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS series_winner_id INTEGER REFERENCES players(id);

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS is_knockout BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS series_meta JSONB;

ALTER TABLE match_results
  ADD COLUMN IF NOT EXISTS game_number INTEGER NOT NULL DEFAULT 1;

ALTER TABLE match_results
  DROP CONSTRAINT IF EXISTS match_results_match_id_player_id_key;

ALTER TABLE match_results
  ADD CONSTRAINT match_results_match_player_game_unique
  UNIQUE (match_id, player_id, game_number);

CREATE TABLE IF NOT EXISTS tournament_knockout_seeds (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID UNIQUE DEFAULT gen_random_uuid(),
  tournament_id BIGINT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  seed INTEGER NOT NULL,
  UNIQUE (tournament_id, player_id),
  UNIQUE (tournament_id, seed)
);

CREATE INDEX IF NOT EXISTS idx_ko_seeds_tournament ON tournament_knockout_seeds(tournament_id);

ALTER TABLE tournaments
  DROP CONSTRAINT IF EXISTS tournaments_competition_format_check;

ALTER TABLE tournaments
  ADD CONSTRAINT tournaments_competition_format_check
  CHECK (competition_format IN ('swiss', 'swiss_knockout'));

ALTER TABLE rounds
  DROP CONSTRAINT IF EXISTS rounds_phase_check;

ALTER TABLE rounds
  ADD CONSTRAINT rounds_phase_check
  CHECK (phase IN ('swiss', 'knockout'));

ALTER TABLE tournament_configs
  DROP CONSTRAINT IF EXISTS tournament_configs_knockout_series_check;

ALTER TABLE tournament_configs
  ADD CONSTRAINT tournament_configs_knockout_series_check
  CHECK (knockout_series IS NULL OR knockout_series IN ('best_of_1', 'best_of_3'));
