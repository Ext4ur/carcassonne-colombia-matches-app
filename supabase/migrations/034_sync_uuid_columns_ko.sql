-- 034: Columnas *_uuid que el cliente empuja en sync pero no estaban en 026–028.
-- Incluye series_winner_uuid (error PostgREST "schema cache") y FKs de KO seeds.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- matches: ganador de serie KO
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS series_winner_uuid UUID;

UPDATE matches m
SET series_winner_uuid = p.uuid
FROM players p
WHERE m.series_winner_id = p.id
  AND m.series_winner_uuid IS NULL;

-- rounds: sync usa tournament_uuid
ALTER TABLE rounds
  ADD COLUMN IF NOT EXISTS tournament_uuid UUID;

UPDATE rounds r
SET tournament_uuid = t.uuid
FROM tournaments t
WHERE r.tournament_id = t.id
  AND r.tournament_uuid IS NULL;

-- match_results: sync usa match_uuid / player_uuid (012 pudo no aplicarse)
ALTER TABLE match_results
  ADD COLUMN IF NOT EXISTS match_uuid UUID;

ALTER TABLE match_results
  ADD COLUMN IF NOT EXISTS player_uuid UUID;

UPDATE match_results mr
SET match_uuid = m.uuid
FROM matches m
WHERE mr.match_id = m.id
  AND mr.match_uuid IS NULL;

UPDATE match_results mr
SET player_uuid = p.uuid
FROM players p
WHERE mr.player_id = p.id
  AND mr.player_uuid IS NULL;

-- tournament_knockout_seeds: push manda UUIDs, no IDs
ALTER TABLE tournament_knockout_seeds
  ADD COLUMN IF NOT EXISTS tournament_uuid UUID;

ALTER TABLE tournament_knockout_seeds
  ADD COLUMN IF NOT EXISTS player_uuid UUID;

UPDATE tournament_knockout_seeds ks
SET tournament_uuid = t.uuid
FROM tournaments t
WHERE ks.tournament_id = t.id
  AND ks.tournament_uuid IS NULL;

UPDATE tournament_knockout_seeds ks
SET player_uuid = p.uuid
FROM players p
WHERE ks.player_id = p.id
  AND ks.player_uuid IS NULL;

-- matches: asegurar round_uuid / first_player_uuid por si faltan
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS round_uuid UUID;

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS first_player_uuid UUID;

UPDATE matches m
SET round_uuid = r.uuid
FROM rounds r
WHERE m.round_id = r.id
  AND m.round_uuid IS NULL;

UPDATE matches m
SET first_player_uuid = p.uuid
FROM players p
WHERE m.first_player_id = p.id
  AND m.first_player_uuid IS NULL;
