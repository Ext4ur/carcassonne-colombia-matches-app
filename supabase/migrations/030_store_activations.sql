-- Activaciones Devir: un código por torneo clasificatorio asignado por admin.
-- Requiere que el torneo ya exista en `tournaments` (uuid) antes de insertar el código.

CREATE TABLE IF NOT EXISTS store_activations (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  place_name TEXT,
  tournament_uuid UUID NOT NULL,
  valid_until DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'active', 'completed')),
  redeemed_at TIMESTAMPTZ,
  machine_fingerprint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT store_activations_tournament_uuid_fkey
    FOREIGN KEY (tournament_uuid) REFERENCES tournaments(uuid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_store_activations_tournament_uuid
  ON store_activations(tournament_uuid);

CREATE INDEX IF NOT EXISTS idx_store_activations_status
  ON store_activations(status);

ALTER TABLE store_activations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_sync_all" ON store_activations;
CREATE POLICY "authenticated_sync_all" ON store_activations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Canje de código (tienda / 2.º PC).
CREATE OR REPLACE FUNCTION redeem_store_activation(p_code text, p_fingerprint text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row store_activations%ROWTYPE;
  v_tournament_status text;
  v_mode text;
BEGIN
  SELECT * INTO v_row
  FROM store_activations
  WHERE UPPER(TRIM(code)) = UPPER(TRIM(p_code))
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'store_activation.errors.invalid_code');
  END IF;

  IF v_row.valid_until < CURRENT_DATE THEN
    RETURN jsonb_build_object('success', false, 'error', 'store_activation.errors.expired');
  END IF;

  SELECT status INTO v_tournament_status
  FROM tournaments
  WHERE uuid = v_row.tournament_uuid;

  IF v_tournament_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'store_activation.errors.tournament_missing');
  END IF;

  IF v_row.status = 'completed' OR v_tournament_status = 'completed' THEN
    v_mode := 'readonly';
  ELSIF v_row.status = 'available' THEN
    UPDATE store_activations
    SET status = 'active',
        redeemed_at = COALESCE(redeemed_at, NOW()),
        machine_fingerprint = COALESCE(machine_fingerprint, p_fingerprint)
    WHERE id = v_row.id;
    v_mode := 'manage';
  ELSE
    v_mode := 'join';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'code', v_row.code,
    'tournament_uuid', v_row.tournament_uuid,
    'place_name', v_row.place_name,
    'mode', v_mode
  );
END;
$$;

-- Marcar activación completada al finalizar torneo en tienda.
CREATE OR REPLACE FUNCTION complete_store_activation(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row store_activations%ROWTYPE;
BEGIN
  SELECT * INTO v_row
  FROM store_activations
  WHERE UPPER(TRIM(code)) = UPPER(TRIM(p_code))
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'store_activation.errors.invalid_code');
  END IF;

  UPDATE store_activations
  SET status = 'completed'
  WHERE id = v_row.id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION redeem_store_activation(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION complete_store_activation(text) TO authenticated;
