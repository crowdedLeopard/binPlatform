-- Migration 004: Schema Snapshots
-- Tracks schema snapshots for drift detection

CREATE TABLE IF NOT EXISTS schema_snapshots (
  id BIGSERIAL PRIMARY KEY,
  council_id TEXT NOT NULL REFERENCES councils(council_id),
  version INTEGER NOT NULL,
  
  -- Schema structure as JSONB
  fields JSONB NOT NULL,
  
  -- Metadata
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sample_size INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Indexes
  CONSTRAINT schema_snapshots_council_version_unique UNIQUE (council_id, version)
);

-- Index for querying active snapshots
CREATE INDEX idx_schema_snapshots_council_active 
  ON schema_snapshots(council_id, is_active) 
  WHERE is_active = TRUE;

-- Index for temporal queries
CREATE INDEX idx_schema_snapshots_captured_at 
  ON schema_snapshots(captured_at DESC);

-- Comments
COMMENT ON TABLE schema_snapshots IS 
  'Schema snapshots for drift detection - captures structure of adapter responses';

COMMENT ON COLUMN schema_snapshots.fields IS 
  'JSONB structure containing field paths, types, and metadata';

COMMENT ON COLUMN schema_snapshots.version IS 
  'Incremental version number - incremented when schema changes';

COMMENT ON COLUMN schema_snapshots.is_active IS 
  'Whether this is the current/active schema for this council';
