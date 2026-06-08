-- Swiss match starter + KO series starter mode (replaces boolean alternate for games 2+)

ALTER TABLE tournament_configs
  ADD COLUMN IF NOT EXISTS swiss_match_starter TEXT NOT NULL DEFAULT 'higher_ranked';

ALTER TABLE tournament_configs
  ADD COLUMN IF NOT EXISTS knockout_series_starter_mode TEXT NOT NULL DEFAULT 'alternate';

UPDATE tournament_configs
SET knockout_series_starter_mode = CASE
  WHEN knockout_series_alternate_starter = TRUE THEN 'previous_loser'
  ELSE 'alternate'
END
WHERE knockout_series_starter_mode = 'alternate';
