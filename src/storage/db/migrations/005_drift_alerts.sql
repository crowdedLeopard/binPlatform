-- Migration 005: Drift Alerts
-- Tracks detected schema drift events

CREATE TABLE IF NOT EXISTS drift_alerts (
  id BIGSERIAL PRIMARY KEY,
  alert_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  council_id TEXT NOT NULL REFERENCES councils(council_id),
  
  -- Drift details
  drift_type TEXT NOT NULL CHECK (drift_type IN (
    'new_fields',
    'missing_fields', 
    'type_change',
    'value_range_change',
    'none'
  )),
  
  severity TEXT NOT NULL CHECK (severity IN ('minor', 'major', 'breaking')),
  
  affected_fields JSONB NOT NULL DEFAULT '[]',
  
  description TEXT NOT NULL,
  
  recommendation TEXT NOT NULL CHECK (recommendation IN (
    'log_and_continue',
    'flag_for_review',
    'fail_acquisition'
  )),
  
  -- Schema versions involved
  previous_schema_version INTEGER,
  current_schema_version INTEGER,
  
  -- Lifecycle
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by TEXT,
  
  -- Related acquisition
  acquisition_attempt_id TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'
);

-- Partition by month for better performance
-- (Drift alerts accumulate over time)
CREATE INDEX idx_drift_alerts_council_detected 
  ON drift_alerts(council_id, detected_at DESC);

CREATE INDEX idx_drift_alerts_severity 
  ON drift_alerts(severity, acknowledged) 
  WHERE acknowledged = FALSE;

CREATE INDEX idx_drift_alerts_unacknowledged 
  ON drift_alerts(detected_at DESC) 
  WHERE acknowledged = FALSE;

-- Security event integration
-- Drift alerts of severity 'breaking' trigger SECURITY_SCHEMA_MISMATCH events
CREATE INDEX idx_drift_alerts_breaking 
  ON drift_alerts(council_id, detected_at DESC) 
  WHERE severity = 'breaking' AND acknowledged = FALSE;

-- Comments
COMMENT ON TABLE drift_alerts IS 
  'Schema drift detection events - tracks unexpected upstream data changes';

COMMENT ON COLUMN drift_alerts.drift_type IS 
  'Type of drift detected: new_fields, missing_fields, type_change, etc.';

COMMENT ON COLUMN drift_alerts.severity IS 
  'Severity level: minor (log), major (review), breaking (fail acquisition)';

COMMENT ON COLUMN drift_alerts.affected_fields IS 
  'JSON array of field paths affected by drift';

COMMENT ON COLUMN drift_alerts.recommendation IS 
  'Recommended action: log_and_continue, flag_for_review, fail_acquisition';

COMMENT ON COLUMN drift_alerts.acknowledged IS 
  'Whether admin has reviewed and acknowledged this alert';
