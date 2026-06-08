-- Query to extract the complete schema of the main tables
-- This helps verify if columns like pairing_algorithm or dropout_round are present.
SELECT 
    table_name, 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM 
    information_schema.columns 
WHERE 
    table_schema = 'public'
    AND table_name IN (
        'players', 
        'tournaments', 
        'tournament_configs', 
        'rounds', 
        'matches', 
        'match_results', 
        'tournament_players', 
        'player_byes',
        'circuits',
        'cities',
        'places'
    )
ORDER BY 
    table_name, 
    ordinal_position;
