-- Places table and tournament place_id
CREATE TABLE IF NOT EXISTS places (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Default place "Online"
INSERT INTO places (name) SELECT 'Online' WHERE NOT EXISTS (SELECT 1 FROM places WHERE name = 'Online');

-- Add place_id to tournaments (nullable first, then backfill, then set NOT NULL)
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS place_id BIGINT REFERENCES places(id);

UPDATE tournaments t
SET place_id = (SELECT id FROM places WHERE name = 'Online' LIMIT 1)
WHERE t.place_id IS NULL;

ALTER TABLE tournaments ALTER COLUMN place_id SET NOT NULL;
