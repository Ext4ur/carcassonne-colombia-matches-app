-- Restrict remote data access to authenticated sync users (replaces open anon policies).
-- Create one Supabase Auth user per project and set VITE_SUPABASE_SYNC_EMAIL / VITE_SUPABASE_SYNC_PASSWORD in .env.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'players',
    'circuits',
    'tournaments',
    'tournament_configs',
    'tournament_players',
    'rounds',
    'matches',
    'match_players',
    'match_results',
    'player_byes',
    'cities',
    'places',
    'tournament_knockout_seeds',
    'sync_audit_logs'
  ];
  pol record;
BEGIN
  FOREACH t IN ARRAY tables LOOP
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
  END LOOP;
END $$;
