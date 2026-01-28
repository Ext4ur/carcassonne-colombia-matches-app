-- Row Level Security (RLS) Policies
-- Por ahora, políticas básicas que permiten todo (se ajustarán cuando agreguemos autenticación)

-- Habilitar RLS en todas las tablas
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE circuits ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_byes ENABLE ROW LEVEL SECURITY;

-- Políticas temporales: Permitir todo (se actualizarán en Sprint 4 con autenticación)
-- Estas políticas permiten acceso completo para desarrollo
-- TODO: Actualizar en Sprint 4 con políticas basadas en location_id y autenticación

-- Players: Permitir todo por ahora
CREATE POLICY "Allow all operations on players" ON players
  FOR ALL USING (true) WITH CHECK (true);

-- Circuits: Permitir todo por ahora
CREATE POLICY "Allow all operations on circuits" ON circuits
  FOR ALL USING (true) WITH CHECK (true);

-- Tournaments: Permitir todo por ahora
CREATE POLICY "Allow all operations on tournaments" ON tournaments
  FOR ALL USING (true) WITH CHECK (true);

-- Tournament configs: Permitir todo por ahora
CREATE POLICY "Allow all operations on tournament_configs" ON tournament_configs
  FOR ALL USING (true) WITH CHECK (true);

-- Tournament players: Permitir todo por ahora
CREATE POLICY "Allow all operations on tournament_players" ON tournament_players
  FOR ALL USING (true) WITH CHECK (true);

-- Rounds: Permitir todo por ahora
CREATE POLICY "Allow all operations on rounds" ON rounds
  FOR ALL USING (true) WITH CHECK (true);

-- Matches: Permitir todo por ahora
CREATE POLICY "Allow all operations on matches" ON matches
  FOR ALL USING (true) WITH CHECK (true);

-- Match players: Permitir todo por ahora
CREATE POLICY "Allow all operations on match_players" ON match_players
  FOR ALL USING (true) WITH CHECK (true);

-- Match results: Permitir todo por ahora
CREATE POLICY "Allow all operations on match_results" ON match_results
  FOR ALL USING (true) WITH CHECK (true);

-- Player byes: Permitir todo por ahora
CREATE POLICY "Allow all operations on player_byes" ON player_byes
  FOR ALL USING (true) WITH CHECK (true);

-- NOTA: Estas políticas serán actualizadas en Sprint 4 para:
-- 1. Filtrar por location_id (multi-tenancy)
-- 2. Usar auth.uid() para autenticación
-- 3. Implementar permisos más granulares según el rol del usuario
