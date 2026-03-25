-- Migration 006: Confidence Log
-- Tracks confidence scores over time per property/council

CREATE TABLE IF NOT EXISTS confidence_log (
  id BIGSERIAL PRIMARY KEY,
  
  -- Identity
  council_id TEXT NOT NULL REFERENCES councils(council_id),
  property_id UUID,
  
  -- Confidence assessment
  confidence_score NUMERIC(3, 2) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
  confidence_level TEXT NOT NULL CHECK (confidence_level IN (
    'confirmed',
    'likely',
    'unverified',
    'stale'
  )),
  
  -- Confidence factors (JSONB for flexibility)
  factors JSONB NOT NULL,
  
  -- Component scores
  component_scores JSONB NOT NULL,
  
  -- Penalties applied
  penalties_applied TEXT[] DEFAULT ARRAY[]::TEXT[],
  
  -- Temporal
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Related acquisition
  acquisition_attempt_id TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'
);

-- Partition by month for time-series analysis
-- (Confidence logs grow rapidly)
CREATE INDEX idx_confidence_log_council_assessed 
  ON confidence_log(council_id, assessed_at DESC);

CREATE INDEX idx_confidence_log_property_assessed 
  ON confidence_log(property_id, assessed_at DESC);

CREATE INDEX idx_confidence_log_level 
  ON confidence_log(confidence_level, assessed_at DESC);

CREATE INDEX idx_confidence_log_score 
  ON confidence_log(confidence_score DESC, assessed_at DESC);

-- GIN index for JSONB factors queries
CREATE INDEX idx_confidence_log_factors 
  ON confidence_log USING GIN(factors);

-- Comments
COMMENT ON TABLE confidence_log IS 
  'Time-series log of confidence scores for acquired data';

COMMENT ON COLUMN confidence_log.confidence_score IS 
  'Numeric confidence score (0.0-1.0)';

COMMENT ON COLUMN confidence_log.confidence_level IS 
  'Interpreted level: confirmed (≥0.8), likely (≥0.6), unverified (≥0.4), stale (<0.4)';

COMMENT ON COLUMN confidence_log.factors IS 
  'JSONB object containing ConfidenceFactors breakdown';

COMMENT ON COLUMN confidence_log.component_scores IS 
  'JSONB object containing weighted component scores (method, freshness, validation, health)';

COMMENT ON COLUMN confidence_log.penalties_applied IS 
  'Array of penalty identifiers applied (e.g., "partial_data", "stale_cache")';
