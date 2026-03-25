-- Initial schema for Hampshire Bin Collection Data Platform
-- PostgreSQL 16+

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy text search

-- Councils table
CREATE TABLE IF NOT EXISTS councils (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    region VARCHAR(100) NOT NULL,
    website VARCHAR(500),
    contact_email VARCHAR(200),
    contact_phone VARCHAR(50),
    adapter_status VARCHAR(20) NOT NULL DEFAULT 'development' CHECK (adapter_status IN ('active', 'inactive', 'development')),
    last_sync TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_councils_region ON councils(region);
CREATE INDEX idx_councils_adapter_status ON councils(adapter_status);

-- Properties table
CREATE TABLE IF NOT EXISTS properties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    council_id VARCHAR(50) NOT NULL REFERENCES councils(id),
    uprn VARCHAR(20),
    postcode VARCHAR(10) NOT NULL,
    address_line1 VARCHAR(200) NOT NULL,
    address_line2 VARCHAR(200),
    city VARCHAR(100) NOT NULL,
    county VARCHAR(100) NOT NULL,
    latitude DECIMAL(10, 7),
    longitude DECIMAL(10, 7),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(council_id, uprn)
);

CREATE INDEX idx_properties_council_id ON properties(council_id);
CREATE INDEX idx_properties_postcode ON properties(postcode);
CREATE INDEX idx_properties_uprn ON properties(uprn);
CREATE INDEX idx_properties_address_trgm ON properties USING gin(address_line1 gin_trgm_ops);

-- Bin types table
CREATE TABLE IF NOT EXISTS bin_types (
    id SERIAL PRIMARY KEY,
    council_id VARCHAR(50) NOT NULL REFERENCES councils(id),
    code VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    color VARCHAR(50),
    recycling_type VARCHAR(50) CHECK (recycling_type IN ('general-waste', 'recycling', 'garden', 'food', 'glass', 'other')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(council_id, code)
);

CREATE INDEX idx_bin_types_council ON bin_types(council_id);

-- Collections table
CREATE TABLE IF NOT EXISTS collections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    council_id VARCHAR(50) NOT NULL REFERENCES councils(id),
    bin_type VARCHAR(50) NOT NULL,
    next_collection_date DATE NOT NULL,
    frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('weekly', 'fortnightly', 'monthly', 'irregular')),
    notes TEXT,
    source_url VARCHAR(500),
    evidence_ref VARCHAR(500) NOT NULL,
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_collections_property ON collections(property_id);
CREATE INDEX idx_collections_council ON collections(council_id);
CREATE INDEX idx_collections_next_date ON collections(next_collection_date);
CREATE INDEX idx_collections_acquired_at ON collections(acquired_at DESC);

-- API keys table
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    key_hash VARCHAR(200) NOT NULL UNIQUE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('read', 'write', 'admin')),
    max_requests INTEGER NOT NULL DEFAULT 100,
    window_ms INTEGER NOT NULL DEFAULT 900000,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash) WHERE revoked_at IS NULL;

-- Audit log table
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    api_key_id UUID REFERENCES api_keys(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id VARCHAR(200),
    ip_address INET,
    user_agent TEXT,
    success BOOLEAN NOT NULL,
    error_message TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_api_key ON audit_log(api_key_id);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX idx_audit_log_metadata ON audit_log USING gin(metadata);

-- Adapter execution log
CREATE TABLE IF NOT EXISTS adapter_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    council_id VARCHAR(50) NOT NULL REFERENCES councils(id),
    triggered_by VARCHAR(50) NOT NULL CHECK (triggered_by IN ('scheduled', 'manual', 'api')),
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    success BOOLEAN,
    properties_processed INTEGER DEFAULT 0,
    collections_acquired INTEGER DEFAULT 0,
    error_message TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_adapter_executions_council ON adapter_executions(council_id);
CREATE INDEX idx_adapter_executions_started_at ON adapter_executions(started_at DESC);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_councils_updated_at BEFORE UPDATE ON councils
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_properties_updated_at BEFORE UPDATE ON properties
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_collections_updated_at BEFORE UPDATE ON collections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert initial councils
INSERT INTO councils (id, name, region, adapter_status) VALUES
    ('basingstoke', 'Basingstoke and Deane Borough Council', 'Hampshire', 'development'),
    ('east-hampshire', 'East Hampshire District Council', 'Hampshire', 'development'),
    ('eastleigh', 'Eastleigh Borough Council', 'Hampshire', 'development'),
    ('fareham', 'Fareham Borough Council', 'Hampshire', 'development'),
    ('gosport', 'Gosport Borough Council', 'Hampshire', 'development'),
    ('hart', 'Hart District Council', 'Hampshire', 'development'),
    ('havant', 'Havant Borough Council', 'Hampshire', 'development'),
    ('new-forest', 'New Forest District Council', 'Hampshire', 'development'),
    ('portsmouth', 'Portsmouth City Council', 'Hampshire', 'development'),
    ('rushmoor', 'Rushmoor Borough Council', 'Hampshire', 'development'),
    ('southampton', 'Southampton City Council', 'Hampshire', 'development'),
    ('test-valley', 'Test Valley Borough Council', 'Hampshire', 'development'),
    ('winchester', 'Winchester City Council', 'Hampshire', 'development')
ON CONFLICT (id) DO NOTHING;
