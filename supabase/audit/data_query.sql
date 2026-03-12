-- Query to export a sample of data for verification
-- Useful to check if latest records are syncing correctly
SELECT 'TOURNAMENTS' as label;
SELECT * FROM tournaments LIMIT 10;

SELECT 'RECENT MATCH RESULTS' as label;
SELECT * FROM match_results ORDER BY id DESC LIMIT 10;

SELECT 'TOURNAMEST CONFIGS' as label;
SELECT * FROM tournament_configs LIMIT 5;
