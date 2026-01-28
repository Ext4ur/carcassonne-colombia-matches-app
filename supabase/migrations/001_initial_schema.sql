-- Migración inicial: Esquema completo de la base de datos
-- Convierte el esquema SQLite a PostgreSQL

-- Players table
CREATE TABLE IF NOT EXISTS players (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  bga_username TEXT,
  phone TEXT,
  email TEXT,
  age INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Circuits table
CREATE TABLE IF NOT EXISTS circuits (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tournaments table
CREATE TABLE IF NOT EXISTS tournaments (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('qualifier', 'circuit')),
  circuit_id BIGINT REFERENCES circuits(id),
  date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'in_progress', 'completed')),
  players_per_match INTEGER NOT NULL DEFAULT 2,
  number_of_rounds INTEGER, -- Agregado en migración
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tournament configs table
CREATE TABLE IF NOT EXISTS tournament_configs (
  id BIGSERIAL PRIMARY KEY,
  tournament_id BIGINT NOT NULL UNIQUE REFERENCES tournaments(id) ON DELETE CASCADE,
  avoid_rematches INTEGER NOT NULL DEFAULT 1,
  tiebreak_criteria TEXT NOT NULL,
  scoring_system TEXT NOT NULL,
  bye_selection TEXT DEFAULT 'worst', -- Agregado en migración
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tournament players (registrations)
CREATE TABLE IF NOT EXISTS tournament_players (
  id BIGSERIAL PRIMARY KEY,
  tournament_id BIGINT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tournament_id, player_id)
);

-- Rounds table
CREATE TABLE IF NOT EXISTS rounds (
  id BIGSERIAL PRIMARY KEY,
  tournament_id BIGINT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed')),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  UNIQUE(tournament_id, round_number)
);

-- Matches table
CREATE TABLE IF NOT EXISTS matches (
  id BIGSERIAL PRIMARY KEY,
  round_id BIGINT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  match_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'completed')),
  completed_at TIMESTAMP,
  first_player_id BIGINT REFERENCES players(id), -- Agregado en migración
  UNIQUE(round_id, match_number)
);

-- Match players table (jugadores asignados a cada partida)
CREATE TABLE IF NOT EXISTS match_players (
  id BIGSERIAL PRIMARY KEY,
  match_id BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  UNIQUE(match_id, player_id)
);

-- Match results table
CREATE TABLE IF NOT EXISTS match_results (
  id BIGSERIAL PRIMARY KEY,
  match_id BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  points INTEGER NOT NULL,
  tournament_points REAL NOT NULL,
  UNIQUE(match_id, player_id)
);

-- Player byes table (historial de byes por jugador)
CREATE TABLE IF NOT EXISTS player_byes (
  id BIGSERIAL PRIMARY KEY,
  tournament_id BIGINT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tournament_id, player_id, round_number)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_tournament_players_tournament ON tournament_players(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_players_player ON tournament_players(player_id);
CREATE INDEX IF NOT EXISTS idx_rounds_tournament ON rounds(tournament_id);
CREATE INDEX IF NOT EXISTS idx_rounds_tournament_round ON rounds(tournament_id, round_number);
CREATE INDEX IF NOT EXISTS idx_matches_round ON matches(round_id);
CREATE INDEX IF NOT EXISTS idx_match_results_match ON match_results(match_id);
CREATE INDEX IF NOT EXISTS idx_match_results_player ON match_results(player_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_circuit ON tournaments(circuit_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
CREATE INDEX IF NOT EXISTS idx_match_players_match ON match_players(match_id);
CREATE INDEX IF NOT EXISTS idx_match_players_player ON match_players(player_id);
CREATE INDEX IF NOT EXISTS idx_player_byes_tournament ON player_byes(tournament_id);
CREATE INDEX IF NOT EXISTS idx_player_byes_player ON player_byes(player_id);

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para actualizar updated_at
CREATE TRIGGER update_players_updated_at BEFORE UPDATE ON players
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_circuits_updated_at BEFORE UPDATE ON circuits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tournaments_updated_at BEFORE UPDATE ON tournaments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tournament_configs_updated_at BEFORE UPDATE ON tournament_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
