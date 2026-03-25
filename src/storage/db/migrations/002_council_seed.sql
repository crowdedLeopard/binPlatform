-- Hampshire Bin Collection Data Platform
-- Council Registry Seed Data
-- 
-- Seeds all 13 Hampshire councils with metadata from discovery phase.

INSERT INTO councils (id, name, region, website, adapter_status) VALUES
('basingstoke-deane', 'Basingstoke and Deane Borough Council', 'Hampshire', 'https://www.basingstoke.gov.uk', 'development'),
('east-hampshire', 'East Hampshire District Council', 'Hampshire', 'https://www.easthants.gov.uk', 'development'),
('eastleigh', 'Eastleigh Borough Council', 'Hampshire', 'https://www.eastleigh.gov.uk', 'development'),
('fareham', 'Fareham Borough Council', 'Hampshire', 'https://www.fareham.gov.uk', 'development'),
('gosport', 'Gosport Borough Council', 'Hampshire', 'https://www.gosport.gov.uk', 'development'),
('hart', 'Hart District Council', 'Hampshire', 'https://www.hart.gov.uk', 'development'),
('havant', 'Havant Borough Council', 'Hampshire', 'https://www.havant.gov.uk', 'development'),
('new-forest', 'New Forest District Council', 'Hampshire', 'https://www.newforest.gov.uk', 'development'),
('portsmouth', 'Portsmouth City Council', 'Hampshire', 'https://www.portsmouth.gov.uk', 'development'),
('rushmoor', 'Rushmoor Borough Council', 'Hampshire', 'https://www.rushmoor.gov.uk', 'development'),
('southampton', 'Southampton City Council', 'Hampshire', 'https://www.southampton.gov.uk', 'development'),
('test-valley', 'Test Valley Borough Council', 'Hampshire', 'https://www.testvalley.gov.uk', 'development'),
('winchester', 'Winchester City Council', 'Hampshire', 'https://www.winchester.gov.uk', 'development')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    website = EXCLUDED.website,
    updated_at = NOW();

-- Council adapter registry table for kill switches and metadata
CREATE TABLE IF NOT EXISTS council_adapters (
    council_id VARCHAR(50) PRIMARY KEY REFERENCES councils(id),
    lookup_method VARCHAR(50) NOT NULL CHECK (lookup_method IN ('api', 'hidden_json', 'html_form', 'pdf_calendar', 'browser_automation', 'unsupported', 'unknown')),
    required_input TEXT[], -- e.g., ['postcode', 'house_number'] or ['uprn']
    confidence_score DECIMAL(3, 2) NOT NULL DEFAULT 0.0 CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
    upstream_risk_level VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (upstream_risk_level IN ('low', 'medium', 'high', 'critical')),
    kill_switch_active BOOLEAN NOT NULL DEFAULT FALSE,
    last_health_check TIMESTAMPTZ,
    last_error TEXT,
    adapter_version VARCHAR(20),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed adapter metadata (placeholder values - to be updated as adapters are implemented)
INSERT INTO council_adapters (council_id, lookup_method, required_input, confidence_score, upstream_risk_level) VALUES
('basingstoke-deane', 'unknown', ARRAY['postcode'], 0.0, 'medium'),
('east-hampshire', 'unknown', ARRAY['postcode'], 0.0, 'medium'),
('eastleigh', 'api', ARRAY['uprn'], 0.9, 'low'),
('fareham', 'api', ARRAY['uprn'], 0.85, 'low'),
('gosport', 'unknown', ARRAY['postcode'], 0.0, 'medium'),
('hart', 'unknown', ARRAY['postcode'], 0.0, 'medium'),
('havant', 'unknown', ARRAY['postcode'], 0.0, 'medium'),
('new-forest', 'unknown', ARRAY['postcode'], 0.0, 'high'),
('portsmouth', 'unknown', ARRAY['postcode'], 0.0, 'medium'),
('rushmoor', 'html_form', ARRAY['postcode', 'house_number'], 0.7, 'medium'),
('southampton', 'unknown', ARRAY['postcode'], 0.0, 'high'),
('test-valley', 'unknown', ARRAY['postcode'], 0.0, 'medium'),
('winchester', 'browser_automation', ARRAY['postcode'], 0.6, 'high')
ON CONFLICT (council_id) DO UPDATE SET
    lookup_method = EXCLUDED.lookup_method,
    required_input = EXCLUDED.required_input,
    confidence_score = EXCLUDED.confidence_score,
    upstream_risk_level = EXCLUDED.upstream_risk_level,
    updated_at = NOW();

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_council_adapters_kill_switch ON council_adapters(kill_switch_active);
CREATE INDEX IF NOT EXISTS idx_council_adapters_risk_level ON council_adapters(upstream_risk_level);
