-- 033: Reparación idempotente de starters suizo/KO (equivalente seguro a 028).

ALTER TABLE tournament_configs
  ADD COLUMN IF NOT EXISTS swiss_match_starter TEXT NOT NULL DEFAULT 'higher_ranked';

ALTER TABLE tournament_configs
  ADD COLUMN IF NOT EXISTS knockout_series_starter_mode TEXT NOT NULL DEFAULT 'alternate';

UPDATE tournament_configs
SET knockout_series_starter_mode = CASE
  WHEN knockout_series_alternate_starter = TRUE THEN 'previous_loser'
  ELSE 'alternate'
END
WHERE knockout_series_starter_mode = 'alternate'
  AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tournament_configs'
      AND column_name = 'knockout_series_alternate_starter'
  );
