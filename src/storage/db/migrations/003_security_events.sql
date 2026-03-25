-- Hampshire Bin Collection Data Platform
-- Migration 003: Security Events Table
--
-- Creates table for persisting security events that need to be queryable.
-- Events are written asynchronously and never block the request path.
--
-- Author: Amos (Security Engineer)
-- Date: 2026-03-25

-- =============================================================================
-- SECURITY EVENTS TABLE
-- =============================================================================

CREATE TABLE security_events (
    -- Primary key
    id VARCHAR(100) PRIMARY KEY,
    
    -- Event classification
    event_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    
    -- Resource context
    council_id VARCHAR(50),
    
    -- Actor (who performed the action)
    actor_type VARCHAR(50) NOT NULL CHECK (actor_type IN ('api_client', 'adapter', 'admin', 'system')),
    actor_id VARCHAR(100),
    actor_ip_anon VARCHAR(50), -- IP address anonymised (last octet zeroed)
    
    -- Action details
    action VARCHAR(255) NOT NULL,
    outcome VARCHAR(20) NOT NULL CHECK (outcome IN ('success', 'failure', 'blocked')),
    
    -- Metadata (JSON, no secrets allowed)
    metadata_json JSONB DEFAULT '{}'::jsonb,
    
    -- Tracing
    request_id VARCHAR(100),
    
    -- Timestamp
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Primary query patterns
CREATE INDEX idx_security_events_created_at ON security_events(created_at DESC);
CREATE INDEX idx_security_events_severity ON security_events(severity) WHERE severity IN ('warning', 'critical');
CREATE INDEX idx_security_events_event_type ON security_events(event_type);
CREATE INDEX idx_security_events_council_id ON security_events(council_id) WHERE council_id IS NOT NULL;

-- Abuse detection queries
CREATE INDEX idx_security_events_actor_ip ON security_events(actor_ip_anon, created_at DESC) WHERE actor_ip_anon IS NOT NULL;
CREATE INDEX idx_security_events_abuse ON security_events(event_type, created_at DESC) WHERE event_type LIKE 'abuse.%';

-- Admin action queries
CREATE INDEX idx_security_events_admin ON security_events(actor_type, created_at DESC) WHERE actor_type = 'admin';

-- Request correlation
CREATE INDEX idx_security_events_request_id ON security_events(request_id) WHERE request_id IS NOT NULL;

-- JSONB metadata queries (optional, evaluate based on query patterns)
CREATE INDEX idx_security_events_metadata ON security_events USING GIN (metadata_json);

-- =============================================================================
-- RETENTION POLICY
-- =============================================================================

-- Security events are retained for 1 year
-- After 1 year, events are archived or deleted based on compliance requirements
-- Implement as scheduled job or PostgreSQL partition management

COMMENT ON TABLE security_events IS 'Security events requiring queryability (audit trail)';
COMMENT ON COLUMN security_events.actor_ip_anon IS 'IP address anonymised: IPv4 last octet zeroed, IPv6 last 80 bits zeroed';
COMMENT ON COLUMN security_events.metadata_json IS 'Additional context, NEVER contains secrets or full addresses';

-- =============================================================================
-- EXAMPLE QUERIES
-- =============================================================================

-- Get critical events in last 24 hours
-- SELECT * FROM security_events
-- WHERE severity = 'critical'
--   AND created_at >= NOW() - INTERVAL '24 hours'
-- ORDER BY created_at DESC;

-- Get abuse events for specific anonymised IP
-- SELECT * FROM security_events
-- WHERE actor_ip_anon = '192.168.1.0'
--   AND event_type LIKE 'abuse.%'
--   AND created_at >= NOW() - INTERVAL '1 hour'
-- ORDER BY created_at DESC;

-- Get all admin actions in date range
-- SELECT * FROM security_events
-- WHERE actor_type = 'admin'
--   AND created_at BETWEEN '2026-03-25' AND '2026-03-26'
-- ORDER BY created_at DESC;

-- Get events for specific council
-- SELECT * FROM security_events
-- WHERE council_id = 'basingstoke-deane'
--   AND severity IN ('warning', 'critical')
-- ORDER BY created_at DESC
-- LIMIT 100;
