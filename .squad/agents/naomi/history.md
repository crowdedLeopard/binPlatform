# Project Context

- **Owner:** crowdedLeopard
- **Project:** Hampshire Bin Collection Data Platform — a production-grade, security-hardened platform to acquire, normalise, and expose household bin collection schedules from Hampshire local authorities via a well-governed API.
- **Stack:** TypeScript or Python, FastAPI or Node.js, PostgreSQL, Redis, Playwright (browser automation), Terraform/Bicep, Docker, OpenAPI
- **Created:** 2026-03-25

## Learnings

### 2026-03-25: Hampshire Council Discovery Complete

**Researched 13 Hampshire councils** for bin collection data acquisition mechanisms.

**Key Platforms Identified:**
1. **Bartec Collective** (Fareham) - SOAP API, reusable across UK councils
2. **Oracle APEX** (Eastleigh) - UPRN-based endpoint, bot protection recently added
3. **Whitespace** (Basingstoke, community-reported) - Common platform but no public API
4. **Granicus** (Portsmouth) - Customer portal, form-based with likely XHR endpoints

**Acquisition Patterns:**
- **API/Machine-readable:** 2 councils (Eastleigh UPRN endpoint, Fareham Bartec API)
- **HTML Form:** 9 councils (majority pattern)
- **Browser Automation Required:** 1 council (Winchester React SPA)
- **PDF Calendar System:** 1 council (East Hampshire)

**Bot Protection Identified:**
- **HIGH:** Southampton (Incapsula/Imperva), New Forest (403 blocks)
- **MEDIUM:** Eastleigh (recent bot protection addition)
- **LOW:** Most form-based councils

**Third-party Platforms:**
- Bartec (Fareham) - SOAP API with Features_Get endpoint, used across many UK councils
- bin-calendar.nova.do - Third-party UPRN service for Southampton (workaround for Incapsula)
- UKBinCollectionData community project has working scrapers for several councils

**UPRN Resolution Critical:**
- Eastleigh requires UPRN (Unique Property Reference Number)
- Need postcode → UPRN lookup service (OS AddressBase or council API)
- Reusable across councils (Fareham also benefits from UPRN)

**Recommended Implementation Order:**
1. **Phase 1:** Eastleigh (API, UPRN pattern), Rushmoor (form automation framework)
2. **Phase 2:** Fareham (Bartec pattern), East Hampshire (PDF calendar pattern)
3. **Phase 3:** Standard forms (Hart, Gosport, Havant, Test Valley, Portsmouth)
4. **Phase 4:** Complex cases (Winchester, Basingstoke)
5. **POSTPONE:** New Forest (bot protection + phased rollout), Southampton (Incapsula)

**Adapter Design Patterns Needed:**
- Form automation framework (CSRF, cookie handling, input sanitisation) - reusable for 9 councils
- UPRN resolution service (postcode → UPRN lookup)
- PDF parsing infrastructure (East Hampshire, Gosport, Havant calendars)
- Browser automation (Playwright) for Winchester and high-risk councils
- SOAP client for Bartec integration (Fareham, potentially other councils)
- Rate limiting and circuit breaker (all councils)

**Caching Strategy:**
- Collection schedules: 7 days TTL (collections weekly/fortnightly)
- PDF calendars: 365 days (annual) or 13 months (East Hampshire)
- UPRN mappings: 90 days (property references stable)
- Aggressive caching reduces upstream load and brittleness risk

**Security Findings:**
- Input sanitisation required on all form fields (postcode, address, street name)
- CSRF token handling for form submissions
- Cookie consent banner automation for several councils
- User-Agent and session management for bot protection mitigation
- Rate limiting essential (1-2 req/sec max, conservative approach)
- Exponential backoff on 403/429 responses

**Brittleness Concerns:**
- HTML structure changes (form-based councils)
- Bot protection tightening (Eastleigh, Southampton, New Forest)
- Platform updates (Bartec versioning, Oracle APEX changes, Granicus updates)
- Service changes during rollout (New Forest phased wheelie bins)

**Evidence Capture Required:**
- Store raw responses for debugging and audit trail
- Version detection (HTML fingerprinting) to alert on upstream changes
- Automated smoke tests for early breakage detection
