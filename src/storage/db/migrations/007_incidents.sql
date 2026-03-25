-- Hampshire Bin Collection Data Platform
-- Migration 007: Incidents Table
--
-- Creates table for incident tracking tied to security events.
-- Incidents are created automatically when trigger conditions are met.
--
-- Author: Amos (Security Engineer)
-- Date: 2026-03-25

-- =============================================================================
-- INCIDENTS TABLE
-- =============================================================================

CREATE TABLE incidents (
    -- Primary key
    id VARCHAR(100) PRIMARY KEY,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Incident classification
    incident_type VARCHAR(50) NOT NULL CHECK (incident_type IN (
        'adapter_blocked_repeated',
        'enumeration_threshold_hit',
        'critical_security_event',
        'retention_failure',
        'audit_hmac_failure',
        'upstream_anomaly',
        'injection_attack',
        'auth_breach'
    )),
    
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    
    -- Context
    council_id VARCHAR(50),
    trigger_event_id VARCHAR(100) NOT NULL,
    
    -- Status tracking
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
    
    -- Acknowledgement
    acknowledged_by VARCHAR(100),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    
    -- Resolution
    resolved_by VARCHAR(100),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_notes TEXT,
    
    -- Additional notes
    notes TEXT
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Primary query patterns
CREATE INDEX idx_incidents_status ON incidents(status) WHERE status IN ('open', 'acknowledged');
CREATE INDEX idx_incidents_severity ON incidents(severity, created_at DESC);
CREATE INDEX idx_incidents_created_at ON incidents(created_at DESC);
CREATE INDEX idx_incidents_type ON incidents(incident_type);
CREATE INDEX idx_incidents_council_id ON incidents(council_id) WHERE council_id IS NOT NULL;

-- Foreign key to security events (soft reference, no constraint)
CREATE INDEX idx_incidents_trigger_event ON incidents(trigger_event_id);

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE incidents IS 'Incident tracking for security events requiring human review';
COMMENT ON COLUMN incidents.incident_type IS 'Type of incident that triggered creation';
COMMENT ON COLUMN incidents.trigger_event_id IS 'Security event ID that triggered this incident (soft FK)';
COMMENT ON COLUMN incidents.status IS 'open = needs attention, acknowledged = being worked on, resolved = complete';
COMMENT ON COLUMN incidents.severity IS 'Severity classification for prioritization';

-- =============================================================================
-- EXAMPLE QUERIES
-- =============================================================================

-- Get all open incidents ordered by severity
-- SELECT * FROM incidents
-- WHERE status IN ('open', 'acknowledged')
-- ORDER BY
--   CASE severity
--     WHEN 'critical' THEN 1
--     WHEN 'high' THEN 2
--     WHEN 'medium' THEN 3
--     WHEN 'low' THEN 4
--   END,
--   created_at DESC;

-- Get incidents for specific council
-- SELECT * FROM incidents
-- WHERE council_id = 'basingstoke-deane'
--   AND status != 'resolved'
-- ORDER BY created_at DESC;

-- Acknowledge an incident
-- UPDATE incidents
-- SET status = 'acknowledged',
--     acknowledged_by = 'admin@example.com',
--     acknowledged_at = NOW(),
--     notes = 'Investigating...'
-- WHERE id = 'incident-123'
--   AND status = 'open';

-- Resolve an incident
-- UPDATE incidents
-- SET status = 'resolved',
--     resolved_by = 'admin@example.com',
--     resolved_at = NOW(),
--     resolution_notes = 'False positive - council website maintenance'
-- WHERE id = 'incident-123'
--   AND status IN ('open', 'acknowledged');
