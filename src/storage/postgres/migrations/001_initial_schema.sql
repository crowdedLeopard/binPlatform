-- Hampshire Bin Collection Data Platform
-- PostgreSQL Database Schema
-- Version: 1.0.0

-- =============================================================================
-- EXTENSIONS
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- ENUMS
-- =============================================================================

CREATE TYPE adapter_status AS ENUM (
    'active',
    'beta',
    'development',
    'disabled',
    'unsupported'
);

CREATE TYPE service_type AS ENUM (
    'general_waste',
    'recycling',
    'garden_waste',
    'food_waste',
    'glass',
    'paper',
    'plastic',
    'textiles',
    'bulky_waste',
    'clinical_waste',
    'hazardous_waste',
    'electrical_waste',
    'other'
);

CREATE TYPE lookup_method AS ENUM (
    'api',
    'hidden_json',
    'html_form',
    'pdf_calendar',
    'browser_automation',
    'unsupported',
    'unknown'
);

CREATE TYPE attempt_status AS ENUM (
    'pending',
    'running',
    'success',
    'failure',
    'timeout',
    'cancelled'
);

CREATE TYPE failure_category AS ENUM (
    'network_error',
    'client_error',
    'server_error',
    'parse_error',
    'validation_error',
    'rate_limited',
    'bot_detection',
    'schema_drift',
    'adapter_error',
    'timeout',
    'auth_required',
    'not_found',
    'unknown'
);

CREATE TYPE health_status AS ENUM (
    'healthy',
    'degraded',
    'unhealthy',
    'unknown'
);

CREATE TYPE evidence_type AS ENUM (
    'html',
    'json',
    'screenshot',
    'pdf',
    'har'
);

CREATE TYPE actor_type AS ENUM (
    'anonymous',
    'api_client',
    'admin_user',
    'system',
    'adapter'
);

CREATE TYPE security_event_type AS ENUM (
    'auth_failure',
    'auth_success',
    'rate_limit_exceeded',
    'suspicious_input',
    'adapter_security_warning',
    'bot_detection_triggered',
    'schema_drift_detected',
    'evidence_access',
    'admin_action',
    'config_change',
    'permission_denied',
    'data_access_anomaly'
);

CREATE TYPE severity_level AS ENUM (
    'info',
    'warning',
    'error',
    'critical'
);

-- =============================================================================
-- COUNCILS
-- =============================================================================

CREATE TABLE councils (
    id                  VARCHAR(50) PRIMARY KEY,
    name                VARCHAR(255) NOT NULL,
    short_name          VARCHAR(100) NOT NULL,
    website             VARCHAR(500) NOT NULL,
    bin_info_url        VARCHAR(500),
    area_code           VARCHAR(20),
    postcode_patterns   TEXT[],
    adapter_status      adapter_status NOT NULL DEFAULT 'development',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT councils_id_format CHECK (id ~ '^[a-z][a-z0-9-]*[a-z0-9]$')
);

COMMENT ON TABLE councils IS 'Local councils providing bin collection services';
COMMENT ON COLUMN councils.id IS 'Sensitivity: public';
COMMENT ON COLUMN councils.name IS 'Sensitivity: public';
COMMENT ON COLUMN councils.adapter_status IS 'Sensitivity: internal';

CREATE INDEX idx_councils_adapter_status ON councils(adapter_status);

-- =============================================================================
-- PROPERTIES
-- =============================================================================

CREATE TABLE properties (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    uprn                    VARCHAR(12),
    council_id              VARCHAR(50) NOT NULL REFERENCES councils(id),
    council_local_ids       JSONB NOT NULL DEFAULT '[]',
    address_display         VARCHAR(500) NOT NULL,
    address_normalised      VARCHAR(500) NOT NULL,
    address_line_1          VARCHAR(200),
    address_line_2          VARCHAR(200),
    address_line_3          VARCHAR(200),
    town                    VARCHAR(100),
    postcode                VARCHAR(10) NOT NULL,
    last_collection_fetch   TIMESTAMPTZ,
    collection_fetch_count  INTEGER NOT NULL DEFAULT 0,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT properties_postcode_format CHECK (
        postcode ~ '^[A-Z]{1,2}[0-9][0-9A-Z]? ?[0-9][A-Z]{2}$'
    ),
    CONSTRAINT properties_uprn_format CHECK (
        uprn IS NULL OR uprn ~ '^[0-9]{1,12}$'
    )
);

COMMENT ON TABLE properties IS 'Residential or commercial properties with bin collection services';
COMMENT ON COLUMN properties.id IS 'Sensitivity: internal';
COMMENT ON COLUMN properties.uprn IS 'Sensitivity: public';
COMMENT ON COLUMN properties.address_display IS 'Sensitivity: internal (personal data)';
COMMENT ON COLUMN properties.postcode IS 'Sensitivity: public';

CREATE INDEX idx_properties_uprn ON properties(uprn) WHERE uprn IS NOT NULL;
CREATE INDEX idx_properties_council_id ON properties(council_id);
CREATE INDEX idx_properties_postcode ON properties(postcode);
CREATE INDEX idx_properties_address_normalised ON properties(address_normalised);
CREATE INDEX idx_properties_last_fetch ON properties(last_collection_fetch);

-- GIN index for council_local_ids JSONB queries
CREATE INDEX idx_properties_council_local_ids ON properties USING GIN (council_local_ids);

-- =============================================================================
-- COLLECTION SERVICES
-- =============================================================================

CREATE TABLE collection_services (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id             UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    council_id              VARCHAR(50) NOT NULL REFERENCES councils(id),
    council_service_id      VARCHAR(100),
    service_type            service_type NOT NULL,
    service_name_raw        VARCHAR(200),
    service_name_display    VARCHAR(200) NOT NULL,
    frequency               VARCHAR(50),
    container_type          VARCHAR(100),
    container_colour        VARCHAR(50),
    is_active               BOOLEAN NOT NULL DEFAULT true,
    requires_subscription   BOOLEAN NOT NULL DEFAULT false,
    notes                   TEXT,
    last_fetched_at         TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT unique_service_per_property_type UNIQUE (property_id, service_type)
);

COMMENT ON TABLE collection_services IS 'Bin collection service types available at properties';
COMMENT ON COLUMN collection_services.service_type IS 'Sensitivity: public';

CREATE INDEX idx_collection_services_property_id ON collection_services(property_id);
CREATE INDEX idx_collection_services_council_id ON collection_services(council_id);
CREATE INDEX idx_collection_services_service_type ON collection_services(service_type);

-- =============================================================================
-- COLLECTION EVENTS (Partitioned by collection_date)
-- =============================================================================

CREATE TABLE collection_events (
    id                      UUID NOT NULL DEFAULT uuid_generate_v4(),
    property_id             UUID NOT NULL,
    service_id              UUID NOT NULL,
    council_id              VARCHAR(50) NOT NULL,
    service_type            service_type NOT NULL,
    collection_date         DATE NOT NULL,
    time_window_start       TIME,
    time_window_end         TIME,
    is_confirmed            BOOLEAN NOT NULL DEFAULT true,
    is_rescheduled          BOOLEAN NOT NULL DEFAULT false,
    original_date           DATE,
    reschedule_reason       VARCHAR(200),
    notes                   TEXT,
    source_attempt_id       UUID,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    PRIMARY KEY (id, collection_date),
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
    FOREIGN KEY (service_id) REFERENCES collection_services(id) ON DELETE CASCADE,
    FOREIGN KEY (council_id) REFERENCES councils(id)
) PARTITION BY RANGE (collection_date);

COMMENT ON TABLE collection_events IS 'Scheduled bin collection events (partitioned by date)';
COMMENT ON COLUMN collection_events.collection_date IS 'Sensitivity: public';

-- Create partitions for next 2 years (monthly)
DO $$
DECLARE
    start_date DATE := DATE_TRUNC('month', CURRENT_DATE);
    end_date DATE := DATE_TRUNC('month', CURRENT_DATE + INTERVAL '2 years');
    partition_date DATE;
    partition_name TEXT;
BEGIN
    partition_date := start_date;
    WHILE partition_date < end_date LOOP
        partition_name := 'collection_events_' || TO_CHAR(partition_date, 'YYYY_MM');
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I PARTITION OF collection_events
             FOR VALUES FROM (%L) TO (%L)',
            partition_name,
            partition_date,
            partition_date + INTERVAL '1 month'
        );
        partition_date := partition_date + INTERVAL '1 month';
    END LOOP;
END $$;

-- Default partition for dates outside range
CREATE TABLE IF NOT EXISTS collection_events_default 
    PARTITION OF collection_events DEFAULT;

CREATE INDEX idx_collection_events_property_id ON collection_events(property_id);
CREATE INDEX idx_collection_events_collection_date ON collection_events(collection_date);
CREATE INDEX idx_collection_events_council_id ON collection_events(council_id);

-- =============================================================================
-- ACQUISITION ATTEMPTS (Partitioned by started_at)
-- =============================================================================

CREATE TABLE acquisition_attempts (
    id                      UUID NOT NULL DEFAULT uuid_generate_v4(),
    council_id              VARCHAR(50) NOT NULL,
    property_id             UUID,
    adapter_id              VARCHAR(100) NOT NULL,
    adapter_version         VARCHAR(50),
    operation_type          VARCHAR(50) NOT NULL,
    lookup_method           lookup_method NOT NULL DEFAULT 'unknown',
    status                  attempt_status NOT NULL DEFAULT 'pending',
    failure_category        failure_category,
    error_message           TEXT,
    http_status_code        SMALLINT,
    http_request_count      SMALLINT NOT NULL DEFAULT 0,
    bytes_received          INTEGER NOT NULL DEFAULT 0,
    duration_ms             INTEGER,
    evidence_ref            UUID,
    confidence              DECIMAL(3,2),
    used_browser_automation BOOLEAN NOT NULL DEFAULT false,
    worker_id               VARCHAR(100),
    correlation_id          VARCHAR(100),
    started_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at            TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    PRIMARY KEY (id, started_at),
    FOREIGN KEY (council_id) REFERENCES councils(id),
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL,
    
    CONSTRAINT acquisition_attempts_confidence_range CHECK (
        confidence IS NULL OR (confidence >= 0 AND confidence <= 1)
    )
) PARTITION BY RANGE (started_at);

COMMENT ON TABLE acquisition_attempts IS 'Data acquisition attempt records';
COMMENT ON COLUMN acquisition_attempts.error_message IS 'Sensitivity: internal';

-- Create partitions for last 90 days and next 7 days
DO $$
DECLARE
    start_date DATE := DATE_TRUNC('week', CURRENT_DATE - INTERVAL '90 days');
    end_date DATE := DATE_TRUNC('week', CURRENT_DATE + INTERVAL '14 days');
    partition_date DATE;
    partition_name TEXT;
BEGIN
    partition_date := start_date;
    WHILE partition_date < end_date LOOP
        partition_name := 'acquisition_attempts_' || TO_CHAR(partition_date, 'YYYY_WW');
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I PARTITION OF acquisition_attempts
             FOR VALUES FROM (%L) TO (%L)',
            partition_name,
            partition_date,
            partition_date + INTERVAL '1 week'
        );
        partition_date := partition_date + INTERVAL '1 week';
    END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS acquisition_attempts_default 
    PARTITION OF acquisition_attempts DEFAULT;

CREATE INDEX idx_acquisition_attempts_council_id ON acquisition_attempts(council_id);
CREATE INDEX idx_acquisition_attempts_status ON acquisition_attempts(status);
CREATE INDEX idx_acquisition_attempts_started_at ON acquisition_attempts(started_at);
CREATE INDEX idx_acquisition_attempts_failure_category ON acquisition_attempts(failure_category) 
    WHERE failure_category IS NOT NULL;

-- =============================================================================
-- SOURCE EVIDENCE
-- =============================================================================

CREATE TABLE source_evidence (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    attempt_id          UUID NOT NULL,
    attempt_started_at  TIMESTAMPTZ NOT NULL,
    evidence_type       evidence_type NOT NULL,
    storage_path        VARCHAR(500) NOT NULL,
    content_hash        CHAR(64) NOT NULL,
    size_bytes          INTEGER NOT NULL,
    mime_type           VARCHAR(100),
    contains_pii        BOOLEAN NOT NULL DEFAULT false,
    captured_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at          TIMESTAMPTZ NOT NULL,
    
    FOREIGN KEY (attempt_id, attempt_started_at) 
        REFERENCES acquisition_attempts(id, started_at) ON DELETE CASCADE,
        
    CONSTRAINT source_evidence_hash_format CHECK (
        content_hash ~ '^[a-f0-9]{64}$'
    )
);

COMMENT ON TABLE source_evidence IS 'Evidence artifacts from acquisitions';
COMMENT ON COLUMN source_evidence.storage_path IS 'Sensitivity: restricted';

CREATE INDEX idx_source_evidence_attempt_id ON source_evidence(attempt_id);
CREATE INDEX idx_source_evidence_expires_at ON source_evidence(expires_at);

-- =============================================================================
-- ADAPTER HEALTH
-- =============================================================================

CREATE TABLE adapter_health (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    council_id              VARCHAR(50) NOT NULL REFERENCES councils(id),
    status                  health_status NOT NULL DEFAULT 'unknown',
    last_success_at         TIMESTAMPTZ,
    last_failure_at         TIMESTAMPTZ,
    last_failure_category   failure_category,
    last_failure_message    TEXT,
    success_rate_24h        DECIMAL(5,4),
    avg_response_time_ms_24h DECIMAL(10,2),
    acquisition_count_24h   INTEGER NOT NULL DEFAULT 0,
    upstream_reachable      BOOLEAN,
    detected_schema_version VARCHAR(50),
    expected_schema_version VARCHAR(50),
    schema_drift_detected   BOOLEAN NOT NULL DEFAULT false,
    checked_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE adapter_health IS 'Adapter health snapshots';

CREATE INDEX idx_adapter_health_council_id ON adapter_health(council_id);
CREATE INDEX idx_adapter_health_checked_at ON adapter_health(checked_at);
CREATE INDEX idx_adapter_health_status ON adapter_health(status);

-- Keep only latest 1000 health records per council
CREATE OR REPLACE FUNCTION cleanup_old_adapter_health()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM adapter_health 
    WHERE council_id = NEW.council_id 
    AND id NOT IN (
        SELECT id FROM adapter_health 
        WHERE council_id = NEW.council_id 
        ORDER BY checked_at DESC 
        LIMIT 1000
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_cleanup_adapter_health
    AFTER INSERT ON adapter_health
    FOR EACH ROW
    EXECUTE FUNCTION cleanup_old_adapter_health();

-- =============================================================================
-- DATA FRESHNESS STATE
-- =============================================================================

CREATE TABLE data_freshness_state (
    property_id         UUID PRIMARY KEY REFERENCES properties(id) ON DELETE CASCADE,
    council_id          VARCHAR(50) NOT NULL REFERENCES councils(id),
    services_last_fetch TIMESTAMPTZ,
    services_stale      BOOLEAN NOT NULL DEFAULT true,
    events_last_fetch   TIMESTAMPTZ,
    events_stale        BOOLEAN NOT NULL DEFAULT true,
    next_refresh_due    TIMESTAMPTZ,
    refresh_priority    SMALLINT NOT NULL DEFAULT 5,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT data_freshness_priority_range CHECK (
        refresh_priority >= 0 AND refresh_priority <= 10
    )
);

COMMENT ON TABLE data_freshness_state IS 'Data freshness tracking per property';

CREATE INDEX idx_data_freshness_next_refresh ON data_freshness_state(next_refresh_due)
    WHERE next_refresh_due IS NOT NULL;
CREATE INDEX idx_data_freshness_priority ON data_freshness_state(refresh_priority DESC);

-- =============================================================================
-- SECURITY EVENTS (Partitioned by occurred_at)
-- =============================================================================

CREATE TABLE security_events (
    id                  UUID NOT NULL DEFAULT uuid_generate_v4(),
    event_type          security_event_type NOT NULL,
    severity            severity_level NOT NULL,
    source              VARCHAR(100) NOT NULL,
    actor_type          actor_type NOT NULL,
    actor_id            VARCHAR(100),
    ip_address_hash     CHAR(64),
    user_agent          VARCHAR(500),
    resource_type       VARCHAR(100),
    resource_id         VARCHAR(100),
    details             JSONB,
    correlation_id      VARCHAR(100),
    occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);

COMMENT ON TABLE security_events IS 'Security-relevant events for audit and alerting';
COMMENT ON COLUMN security_events.ip_address_hash IS 'SHA-256 hash of IP for privacy';
COMMENT ON COLUMN security_events.details IS 'Sensitivity: restricted';

-- Create partitions for 1 year retention (monthly)
DO $$
DECLARE
    start_date DATE := DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month');
    end_date DATE := DATE_TRUNC('month', CURRENT_DATE + INTERVAL '13 months');
    partition_date DATE;
    partition_name TEXT;
BEGIN
    partition_date := start_date;
    WHILE partition_date < end_date LOOP
        partition_name := 'security_events_' || TO_CHAR(partition_date, 'YYYY_MM');
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I PARTITION OF security_events
             FOR VALUES FROM (%L) TO (%L)',
            partition_name,
            partition_date,
            partition_date + INTERVAL '1 month'
        );
        partition_date := partition_date + INTERVAL '1 month';
    END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS security_events_default 
    PARTITION OF security_events DEFAULT;

CREATE INDEX idx_security_events_event_type ON security_events(event_type);
CREATE INDEX idx_security_events_severity ON security_events(severity);
CREATE INDEX idx_security_events_occurred_at ON security_events(occurred_at);
CREATE INDEX idx_security_events_actor_id ON security_events(actor_id) WHERE actor_id IS NOT NULL;

-- =============================================================================
-- AUDIT ENTRIES (Partitioned by occurred_at)
-- =============================================================================

CREATE TABLE audit_entries (
    id                  UUID NOT NULL DEFAULT uuid_generate_v4(),
    action              VARCHAR(100) NOT NULL,
    resource_type       VARCHAR(100) NOT NULL,
    resource_id         VARCHAR(100),
    actor_type          actor_type NOT NULL,
    actor_id            VARCHAR(100),
    previous_state      JSONB,
    new_state           JSONB,
    metadata            JSONB,
    correlation_id      VARCHAR(100),
    occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);

COMMENT ON TABLE audit_entries IS 'General audit log entries';
COMMENT ON COLUMN audit_entries.previous_state IS 'Sensitivity: restricted';
COMMENT ON COLUMN audit_entries.new_state IS 'Sensitivity: restricted';

-- Create partitions for 2 year retention (monthly)
DO $$
DECLARE
    start_date DATE := DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month');
    end_date DATE := DATE_TRUNC('month', CURRENT_DATE + INTERVAL '25 months');
    partition_date DATE;
    partition_name TEXT;
BEGIN
    partition_date := start_date;
    WHILE partition_date < end_date LOOP
        partition_name := 'audit_entries_' || TO_CHAR(partition_date, 'YYYY_MM');
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I PARTITION OF audit_entries
             FOR VALUES FROM (%L) TO (%L)',
            partition_name,
            partition_date,
            partition_date + INTERVAL '1 month'
        );
        partition_date := partition_date + INTERVAL '1 month';
    END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS audit_entries_default 
    PARTITION OF audit_entries DEFAULT;

CREATE INDEX idx_audit_entries_action ON audit_entries(action);
CREATE INDEX idx_audit_entries_resource_type ON audit_entries(resource_type);
CREATE INDEX idx_audit_entries_actor_id ON audit_entries(actor_id) WHERE actor_id IS NOT NULL;
CREATE INDEX idx_audit_entries_occurred_at ON audit_entries(occurred_at);

-- =============================================================================
-- API KEYS (for public API authentication)
-- =============================================================================

CREATE TABLE api_keys (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key_hash            CHAR(64) NOT NULL UNIQUE,
    key_prefix          CHAR(8) NOT NULL,
    name                VARCHAR(100) NOT NULL,
    description         TEXT,
    scopes              TEXT[] NOT NULL DEFAULT '{}',
    rate_limit_rpm      INTEGER NOT NULL DEFAULT 60,
    is_active           BOOLEAN NOT NULL DEFAULT true,
    expires_at          TIMESTAMPTZ,
    last_used_at        TIMESTAMPTZ,
    usage_count         BIGINT NOT NULL DEFAULT 0,
    created_by          VARCHAR(100),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT api_keys_hash_format CHECK (key_hash ~ '^[a-f0-9]{64}$')
);

COMMENT ON TABLE api_keys IS 'API keys for public API authentication';
COMMENT ON COLUMN api_keys.key_hash IS 'SHA-256 hash of API key';
COMMENT ON COLUMN api_keys.key_prefix IS 'First 8 chars for identification';

CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_is_active ON api_keys(is_active);

-- =============================================================================
-- UPDATED_AT TRIGGER
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOR table_name IN 
        SELECT t.table_name 
        FROM information_schema.columns c
        JOIN information_schema.tables t ON c.table_name = t.table_name
        WHERE c.column_name = 'updated_at' 
        AND t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
    LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS trigger_update_updated_at ON %I',
            table_name
        );
        EXECUTE format(
            'CREATE TRIGGER trigger_update_updated_at
             BEFORE UPDATE ON %I
             FOR EACH ROW
             EXECUTE FUNCTION update_updated_at_column()',
            table_name
        );
    END LOOP;
END $$;

-- =============================================================================
-- ROW LEVEL SECURITY (Prepared for future multi-tenancy)
-- =============================================================================

-- Enable RLS on sensitive tables (policies to be added when needed)
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_entries ENABLE ROW LEVEL SECURITY;

-- Default policy: allow all for service role (policies restrict non-service roles)
-- Actual restrictive policies will be added when multi-tenancy is implemented
