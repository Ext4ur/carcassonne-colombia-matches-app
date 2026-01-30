-- Add display_preference to players: 'name' (default) or 'username'
-- When both exist, this controls which is shown by default for this player.
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS display_preference TEXT NOT NULL DEFAULT 'name'
  CHECK (display_preference IN ('name', 'username'));
