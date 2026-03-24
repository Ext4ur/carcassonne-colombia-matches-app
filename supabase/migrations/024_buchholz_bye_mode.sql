-- Buchholz bye handling: legacy, N-1 cut per round, optional virtual opponent (field average)
ALTER TABLE tournament_configs
  ADD COLUMN IF NOT EXISTS buchholz_bye_mode TEXT DEFAULT 'legacy';

ALTER TABLE tournament_configs
  DROP CONSTRAINT IF EXISTS tournament_configs_buchholz_bye_mode_check;

ALTER TABLE tournament_configs
  ADD CONSTRAINT tournament_configs_buchholz_bye_mode_check
  CHECK (
    buchholz_bye_mode IS NULL
    OR buchholz_bye_mode IN (
      'legacy',
      'n_minus_1',
      'legacy_virtual_avg',
      'n_minus_1_virtual_avg'
    )
  );

UPDATE tournament_configs SET buchholz_bye_mode = 'legacy' WHERE buchholz_bye_mode IS NULL;
