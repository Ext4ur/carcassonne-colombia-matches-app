-- Add player_display_mode to tournament_configs (configurable tournaments only)
-- per_player = use each player's preference; names_only = first two words; usernames_only = BGA username
ALTER TABLE tournament_configs
  ADD COLUMN IF NOT EXISTS player_display_mode TEXT NOT NULL DEFAULT 'per_player'
  CHECK (player_display_mode IN ('per_player', 'names_only', 'usernames_only'));
