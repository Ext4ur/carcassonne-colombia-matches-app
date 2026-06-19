-- 036: Reparar RLS en todas las tablas de sync (incluye tablas creadas tras 029).
-- Si 029 falló en tournament_knockout_seeds (tabla inexistente), quedó RLS sin política.
-- Idempotente: seguro re-ejecutar.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'players',
    'circuits',
    'cities',
    'places',
    'tournaments',
    'tournament_configs',
    'tournament_players',
    'tournament_knockout_seeds',
    'rounds',
    'matches',
    'match_players',
    'match_results',
    'player_byes',
    'sync_audit_logs',
    'store_activations'
  ];
  pol record;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      RAISE NOTICE '036 RLS: omitiendo tabla inexistente %', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    FOR pol IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, t);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY "authenticated_sync_all" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      t
    );

    RAISE NOTICE '036 RLS: política authenticated_sync_all en %', t;
  END LOOP;
END $$;

-- Permisos base para rol authenticated (RLS sigue aplicando)
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
