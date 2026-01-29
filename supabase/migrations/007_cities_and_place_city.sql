-- Cities table
CREATE TABLE IF NOT EXISTS cities (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed default cities
INSERT INTO cities (name) SELECT 'Bogotá' WHERE NOT EXISTS (SELECT 1 FROM cities WHERE name = 'Bogotá');
INSERT INTO cities (name) SELECT 'Chía' WHERE NOT EXISTS (SELECT 1 FROM cities WHERE name = 'Chía');
INSERT INTO cities (name) SELECT 'Medellín' WHERE NOT EXISTS (SELECT 1 FROM cities WHERE name = 'Medellín');
INSERT INTO cities (name) SELECT 'Cali' WHERE NOT EXISTS (SELECT 1 FROM cities WHERE name = 'Cali');
INSERT INTO cities (name) SELECT 'Ibagué' WHERE NOT EXISTS (SELECT 1 FROM cities WHERE name = 'Ibagué');
INSERT INTO cities (name) SELECT 'Neiva' WHERE NOT EXISTS (SELECT 1 FROM cities WHERE name = 'Neiva');

-- Add city_id to places
ALTER TABLE places ADD COLUMN IF NOT EXISTS city_id BIGINT REFERENCES cities(id);

UPDATE places p
SET city_id = (SELECT id FROM cities WHERE name = 'Bogotá' LIMIT 1)
WHERE p.city_id IS NULL;

ALTER TABLE places ALTER COLUMN city_id SET NOT NULL;
