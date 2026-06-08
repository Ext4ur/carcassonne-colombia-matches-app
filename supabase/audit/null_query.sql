-- Query to count null values in critical columns
-- Helps detect data corruption or missing sync fields (like UUIDs)
SELECT 'players' as table_name, count(*) as null_count, 'bga_username' as column_name FROM players WHERE bga_username IS NULL
UNION ALL
SELECT 'tournaments' as table_name, count(*) as null_count, 'circuit_id' as column_name FROM tournaments WHERE circuit_id IS NULL
UNION ALL
SELECT 'tournament_configs' as table_name, count(*) as null_count, 'pairing_algorithm' as column_name FROM tournament_configs WHERE pairing_algorithm IS NULL
UNION ALL
SELECT 'tournament_players' as table_name, count(*) as null_count, 'dropout_round' as column_name FROM tournament_players WHERE dropout_round IS NULL
UNION ALL
SELECT 'matches' as table_name, count(*) as null_count, 'first_player_id' as column_name FROM matches WHERE first_player_id IS NULL;
-- Add more columns as needed for deep audit
