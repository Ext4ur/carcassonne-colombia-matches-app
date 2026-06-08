-- Add pairing_algorithm to tournament_configs
-- 'greedy' (basic) or 'backtracking' (advanced)
ALTER TABLE tournament_configs
  ADD COLUMN IF NOT EXISTS pairing_algorithm TEXT NOT NULL DEFAULT 'greedy'
  CHECK (pairing_algorithm IN ('greedy', 'backtracking'));
