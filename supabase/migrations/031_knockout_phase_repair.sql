-- 031: Reparación idempotente de fase KO (equivalente seguro a 026).
-- Ejecutar si 026 falló a medias ("relation already exists") y faltan columnas KO.

-- tournaments
ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS competition_format TEXT DEFAULT 'swiss';

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS knockout_phase_started_at TIMESTAMPTZ;

UPDATE tournaments SET competition_format = 'swiss' WHERE competition_format IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tournaments' AND column_name = 'competition_format'
  ) THEN
    ALTER TABLE tournaments ALTER COLUMN competition_format SET DEFAULT 'swiss';
    BEGIN
      ALTER TABLE tournaments ALTER COLUMN competition_format SET NOT NULL;
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END IF;
END $$;

-- tournament_configs
ALTER TABLE tournament_configs
  ADD COLUMN IF NOT EXISTS knockout_size INTEGER DEFAULT 8;

ALTER TABLE tournament_configs
  ADD COLUMN IF NOT EXISTS knockout_seeding TEXT DEFAULT 'standard_bracket';

ALTER TABLE tournament_configs
  ADD COLUMN IF NOT EXISTS knockout_series TEXT DEFAULT 'best_of_1';

ALTER TABLE tournament_configs
  ADD COLUMN IF NOT EXISTS swiss_standings_snapshot TEXT;

-- rounds
ALTER TABLE rounds
  ADD COLUMN IF NOT EXISTS phase TEXT DEFAULT 'swiss';

ALTER TABLE rounds
  ADD COLUMN IF NOT EXISTS knockout_stage TEXT;

UPDATE rounds SET phase = 'swiss' WHERE phase IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rounds' AND column_name = 'phase'
  ) THEN
    ALTER TABLE rounds ALTER COLUMN phase SET DEFAULT 'swiss';
    BEGIN
      ALTER TABLE rounds ALTER COLUMN phase SET NOT NULL;
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END IF;
END $$;

-- matches (KO + series)
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

-- match_results: game_number + unique por partida/jugador/juego
ALTER TABLE match_results
  ADD COLUMN IF NOT EXISTS game_number INTEGER NOT NULL DEFAULT 1;

ALTER TABLE match_results
  DROP CONSTRAINT IF EXISTS match_results_match_id_player_id_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'match_results_match_player_game_unique'
  ) THEN
    ALTER TABLE match_results
      ADD CONSTRAINT match_results_match_player_game_unique
      UNIQUE (match_id, player_id, game_number);
  END IF;
END $$;

-- tabla KO seeds (CREATE IF NOT EXISTS evita error si ya existe)
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

-- checks (idempotentes)
ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_competition_format_check;
ALTER TABLE tournaments
  ADD CONSTRAINT tournaments_competition_format_check
  CHECK (competition_format IN ('swiss', 'swiss_knockout'));

ALTER TABLE rounds DROP CONSTRAINT IF EXISTS rounds_phase_check;
ALTER TABLE rounds
  ADD CONSTRAINT rounds_phase_check
  CHECK (phase IN ('swiss', 'knockout'));

ALTER TABLE tournament_configs DROP CONSTRAINT IF EXISTS tournament_configs_knockout_series_check;
ALTER TABLE tournament_configs
  ADD CONSTRAINT tournament_configs_knockout_series_check
  CHECK (knockout_series IS NULL OR knockout_series IN ('best_of_1', 'best_of_3'));
