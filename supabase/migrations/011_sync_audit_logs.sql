-- Migration 011: Sync Audit Logs
-- This migration creates a central table to track all changes (INSERT, UPDATE, DELETE)
-- which allows the application to perform efficient delta-based synchronization.

-- 1. Create the Audit Log table
CREATE TABLE IF NOT EXISTS sync_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_uuid UUID NOT NULL,
  operation TEXT NOT NULL CHECK(operation IN ('INSERT', 'UPDATE', 'DELETE')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Create the trigger function
CREATE OR REPLACE FUNCTION fn_process_sync_audit_log()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    INSERT INTO sync_audit_logs (table_name, record_uuid, operation)
    VALUES (TG_TABLE_NAME, OLD.uuid, TG_OP);
  ELSE
    INSERT INTO sync_audit_logs (table_name, record_uuid, operation)
    VALUES (TG_TABLE_NAME, NEW.uuid, TG_OP);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Apply triggers to all synchronized tables
-- Players
DROP TRIGGER IF EXISTS tr_audit_players ON players;
CREATE TRIGGER tr_audit_players AFTER INSERT OR UPDATE OR DELETE ON players
  FOR EACH ROW EXECUTE FUNCTION fn_process_sync_audit_log();

-- Circuits
DROP TRIGGER IF EXISTS tr_audit_circuits ON circuits;
CREATE TRIGGER tr_audit_circuits AFTER INSERT OR UPDATE OR DELETE ON circuits
  FOR EACH ROW EXECUTE FUNCTION fn_process_sync_audit_log();

-- Cities
DROP TRIGGER IF EXISTS tr_audit_cities ON cities;
CREATE TRIGGER tr_audit_cities AFTER INSERT OR UPDATE OR DELETE ON cities
  FOR EACH ROW EXECUTE FUNCTION fn_process_sync_audit_log();

-- Places
DROP TRIGGER IF EXISTS tr_audit_places ON places;
CREATE TRIGGER tr_audit_places AFTER INSERT OR UPDATE OR DELETE ON places
  FOR EACH ROW EXECUTE FUNCTION fn_process_sync_audit_log();

-- Tournaments
DROP TRIGGER IF EXISTS tr_audit_tournaments ON tournaments;
CREATE TRIGGER tr_audit_tournaments AFTER INSERT OR UPDATE OR DELETE ON tournaments
  FOR EACH ROW EXECUTE FUNCTION fn_process_sync_audit_log();

-- Tournament Configs
DROP TRIGGER IF EXISTS tr_audit_tournament_configs ON tournament_configs;
CREATE TRIGGER tr_audit_tournament_configs AFTER INSERT OR UPDATE OR DELETE ON tournament_configs
  FOR EACH ROW EXECUTE FUNCTION fn_process_sync_audit_log();

-- Tournament Players
DROP TRIGGER IF EXISTS tr_audit_tournament_players ON tournament_players;
CREATE TRIGGER tr_audit_tournament_players AFTER INSERT OR UPDATE OR DELETE ON tournament_players
  FOR EACH ROW EXECUTE FUNCTION fn_process_sync_audit_log();

-- Rounds
DROP TRIGGER IF EXISTS tr_audit_rounds ON rounds;
CREATE TRIGGER tr_audit_rounds AFTER INSERT OR UPDATE OR DELETE ON rounds
  FOR EACH ROW EXECUTE FUNCTION fn_process_sync_audit_log();

-- Matches
DROP TRIGGER IF EXISTS tr_audit_matches ON matches;
CREATE TRIGGER tr_audit_matches AFTER INSERT OR UPDATE OR DELETE ON matches
  FOR EACH ROW EXECUTE FUNCTION fn_process_sync_audit_log();

-- Match Players
DROP TRIGGER IF EXISTS tr_audit_match_players ON match_players;
CREATE TRIGGER tr_audit_match_players AFTER INSERT OR UPDATE OR DELETE ON match_players
  FOR EACH ROW EXECUTE FUNCTION fn_process_sync_audit_log();

-- Match Results
DROP TRIGGER IF EXISTS tr_audit_match_results ON match_results;
CREATE TRIGGER tr_audit_match_results AFTER INSERT OR UPDATE OR DELETE ON match_results
  FOR EACH ROW EXECUTE FUNCTION fn_process_sync_audit_log();

-- Player Byes
DROP TRIGGER IF EXISTS tr_audit_player_byes ON player_byes;
CREATE TRIGGER tr_audit_player_byes AFTER INSERT OR UPDATE OR DELETE ON player_byes
  FOR EACH ROW EXECUTE FUNCTION fn_process_sync_audit_log();

-- 4. Backfill existing records (Optional but recommended)
-- This ensures that records already in the database are also synced to new local instances.
-- We TRUNCATE first to allow re-running this migration if needed and to ensure correct order.
TRUNCATE sync_audit_logs;

-- Order matters here: dependencies FIRST so they are processed FIRST!
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) SELECT 'cities', uuid, 'INSERT' FROM cities WHERE uuid IS NOT NULL;
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) SELECT 'places', uuid, 'INSERT' FROM places WHERE uuid IS NOT NULL;
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) SELECT 'circuits', uuid, 'INSERT' FROM circuits WHERE uuid IS NOT NULL;
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) SELECT 'players', uuid, 'INSERT' FROM players WHERE uuid IS NOT NULL;
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) SELECT 'tournaments', uuid, 'INSERT' FROM tournaments WHERE uuid IS NOT NULL;
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) SELECT 'tournament_configs', uuid, 'INSERT' FROM tournament_configs WHERE uuid IS NOT NULL;
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) SELECT 'tournament_players', uuid, 'INSERT' FROM tournament_players WHERE uuid IS NOT NULL;
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) SELECT 'rounds', uuid, 'INSERT' FROM rounds WHERE uuid IS NOT NULL;
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) SELECT 'matches', uuid, 'INSERT' FROM matches WHERE uuid IS NOT NULL;
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) SELECT 'match_players', uuid, 'INSERT' FROM match_players WHERE uuid IS NOT NULL;
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) SELECT 'match_results', uuid, 'INSERT' FROM match_results WHERE uuid IS NOT NULL;
INSERT INTO sync_audit_logs (table_name, record_uuid, operation) SELECT 'player_byes', uuid, 'INSERT' FROM player_byes WHERE uuid IS NOT NULL;

-- 5. Enable RLS for the audit logs table (Optional, adjust as needed)
ALTER TABLE sync_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable read access for all users" ON sync_audit_logs;
CREATE POLICY "Enable read access for all users" ON sync_audit_logs FOR SELECT USING (true);
DROP POLICY IF EXISTS "Enable insert for all users" ON sync_audit_logs;
CREATE POLICY "Enable insert for all users" ON sync_audit_logs FOR INSERT WITH CHECK (true);
