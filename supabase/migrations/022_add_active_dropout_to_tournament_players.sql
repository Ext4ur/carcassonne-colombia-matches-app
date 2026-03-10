-- Add active and dropout_round to tournament_players in Supabase

ALTER TABLE tournament_players 
ADD COLUMN IF NOT EXISTS active INTEGER DEFAULT 1;

ALTER TABLE tournament_players 
ADD COLUMN IF NOT EXISTS dropout_round INTEGER;
