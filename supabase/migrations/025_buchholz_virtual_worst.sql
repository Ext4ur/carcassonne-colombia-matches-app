-- Buchholz bye: virtual opponent = worst field score in that round (optional modes)
-- Column is created in 024; keep ADD here so 025 is safe if 024 was never applied on this DB.
ALTER TABLE tournament_configs
  ADD COLUMN IF NOT EXISTS buchholz_bye_mode TEXT DEFAULT 'legacy';

UPDATE tournament_configs SET buchholz_bye_mode = 'legacy' WHERE buchholz_bye_mode IS NULL;

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
      'n_minus_1_virtual_avg',
      'legacy_virtual_worst',
      'n_minus_1_virtual_worst'
    )
  );
