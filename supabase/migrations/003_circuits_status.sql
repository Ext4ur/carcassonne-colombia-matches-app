-- Add status to circuits: 'active' (default) or 'finalized'
-- When finalized, no more tournaments can be added to the circuit.
ALTER TABLE circuits
  ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'finalized'));
