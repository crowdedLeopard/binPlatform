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

---

### 2026-03-25: Phase 2 — First Two Production Adapters Implemented

**Delivered:** Production-ready adapters for Eastleigh and Rushmoor councils.

**Eastleigh Adapter (API-based):**
- **Method:** Oracle APEX machine-readable endpoint (`my.eastleigh.gov.uk/apex/EBC_Waste_Calendar`)
- **Input:** UPRN (Unique Property Reference Number)
- **Risk Level:** MEDIUM (bot protection present, rate limiting required)
- **Key Patterns:**
  - HTTP GET with honest User-Agent header
  - UPRN validation (numeric, 1-12 digits)
  - Multi-format date parsing (ISO, DD/MM/YYYY, day names)
  - Service type mapping (Refuse→GENERAL_WASTE, Recycling→RECYCLING, etc.)
  - Timeout enforcement (15s connect, 30s total)
  - Error categorization (403→BOT_DETECTION, 429→RATE_LIMITED, 404→NOT_FOUND)
  - Evidence capture (JSON responses stored to blob storage)
  - Kill switch support (`ADAPTER_KILL_SWITCH_EASTLEIGH`)
  - Confidence scoring based on data completeness
- **Challenges:** 
  - Bot protection triggers on automated access (requires rate limiting)
  - UPRN dependency (requires external resolution service)
  - HTML fallback parsing if JSON not returned
- **Lessons:** API-based adapters are fast (1-2s) but fragile due to bot protection

**Rushmoor Adapter (Browser Automation):**
- **Method:** Playwright browser automation with HTML form submission
- **Input:** Postcode (with optional address disambiguation)
- **Risk Level:** MEDIUM (browser automation overhead, page structure brittleness)
- **Key Patterns:**
  - Playwright with security hardening (domain allowlist, timeout enforcement)
  - Network isolation (rushmoor.gov.uk only, cloud metadata blocked)
  - Screenshot capture on failure (stored as evidence)
  - Network request logging (HAR capture for debugging)
  - Multi-selector fallback (select dropdown, list items, table rows)
  - Schema drift detection (selector presence checks)
  - Postcode validation (UK format with normalization)
  - Browser instance cleanup (prevent resource leaks)
- **Challenges:**
  - Resource intensive (200-400MB memory, 8-15s execution time)
  - Page structure changes break selectors
  - Cookie consent banners (automated dismissal needed)
- **Lessons:** Browser automation works but is 5-10x slower than API; aggressive caching essential

**Shared Infrastructure Built:**

1. **Browser Adapter Base (`src/adapters/base/browser-adapter.ts`)**
   - Reusable Playwright wrapper for all browser-based adapters
   - Security controls: domain allowlist, navigation blocking, sandbox config
   - Error handling: timeout, network error, schema drift classification
   - Evidence capture: screenshots, HAR, network logs
   - Pattern: `executeBrowserTask()` wraps automation with safety nets

2. **Evidence Storage Layer (`src/storage/evidence/store-evidence.ts`)**
   - Stores raw responses (JSON, HTML, PDF, screenshots) for audit
   - SHA-256 content hashing for integrity
   - 90-day retention (automated deletion via blob lifecycle policy)
   - Environment-aware: Azure Blob (production), filesystem (dev), memory (test)
   - PII awareness: evidence marked with `containsPii` flag
   - Storage path: `{councilId}/{date}/{uuid}.{ext}`

3. **Adapter Registry (`src/adapters/registry.ts`)**
   - Centralized registration with kill switch support
   - Global kill switch: `ADAPTER_KILL_SWITCH_GLOBAL`
   - Per-adapter kill switch: `ADAPTER_KILL_SWITCH_EASTLEIGH`, `ADAPTER_KILL_SWITCH_RUSHMOOR`
   - AdapterDisabledError exception when adapter unavailable
   - Council discovery: `getSupportedCouncils()`, `isCouncilSupported()`

**Adapter Interface Patterns Established:**

- **UPRN Validation:** Numeric, 1-12 digits, range 1-999999999999
- **Postcode Validation:** UK format (AA9A 9AA), normalized with single space
- **Date Parsing:** Multi-format support (ISO, DD/MM/YYYY, day names with ordinals)
- **Service Type Mapping:** Fuzzy matching (case-insensitive, substring matching)
- **Confidence Scoring:** 0-1 scale based on data completeness (UPRN, address, collections count)
- **Error Categories:** 13 categories (NETWORK_ERROR, BOT_DETECTION, RATE_LIMITED, PARSE_ERROR, etc.)
- **Metadata Capture:** attemptId, timestamps, duration, HTTP count, bytes, browser usage, risk level
- **Evidence Reference:** UUID-based reference, content hash, storage path, expiry date

**Discovery API Shapes:**

**Eastleigh Response Structure:**
```json
{
  "uprn": "100060321174",
  "address": "1 Example Road",
  "postcode": "SO50 4XX",
  "collections": [
    {
      "service": "Refuse",
      "collectionDate": "2026-04-01",
      "frequency": "Fortnightly",
      "containerType": "240L wheeled bin",
      "containerColour": "Black"
    }
  ]
}
```

**Rushmoor HTML Patterns:**
- Postcode input: `input[name*="postcode" i]`
- Submit button: `button[type="submit"]`
- Address select: `select[name*="address" i]` or list items `ul li a`
- Collection data: Table rows, div containers, or list items with date/service extraction

**Security Hardening Applied:**

1. **Input Validation:**
   - UPRN: Numeric only, range check, sanitization
   - Postcode: UK format regex, normalization
   - All string inputs: Trim, length limit (500 chars), HTML tag removal

2. **Network Controls:**
   - Timeout enforcement (connect 15s, total 30s)
   - Abort controller for timeout handling
   - Honest User-Agent (not browser impersonation)
   - Domain allowlisting (browser automation)

3. **Error Handling:**
   - Explicit categorization (no generic errors)
   - Security warnings separate from functional warnings
   - Bot detection logging as security event
   - No sensitive data in error messages

4. **Evidence & Logging:**
   - No raw response body in logs (metadata only)
   - Content-length logged, not content
   - PII flag set on all evidence
   - Automatic redaction in future logging layer

**Performance Benchmarks:**
- Eastleigh (API): 1-2s per request
- Rushmoor (Browser): 8-15s per request
- Cache hit ratio target: >80% (7-day TTL on schedules)

**Rate Limiting Strategy:**
- Eastleigh: 30 requests/minute (conservative)
- Rushmoor: 10 requests/minute (browser overhead)
- Backoff on 403/429: 10s → 20s → 40s → max 5min
- Circuit breaker: 5 consecutive failures → 1 hour pause

**Testing Approach:**
- Unit tests: Validation, parsing, date handling, service mapping
- Integration tests: Real network calls with test data
- Health checks: Automated daily smoke tests
- Schema drift: Selector presence validation

**Monitoring Metrics:**
- Success rate (target: >95% for Eastleigh, >90% for Rushmoor)
- Response time (P50, P95, P99)
- Cache hit rate
- Error rate by category
- Bot detection frequency

**Next Steps for Phase 3:**
- Apply Rushmoor browser pattern to 8 other form-based councils (Hart, Gosport, Havant, Test Valley, Portsmouth, Winchester, Basingstoke, New Forest)
- Build UPRN resolution service for Eastleigh dependency
- Implement Fareham Bartec adapter (reusable SOAP pattern)
- Add PDF parsing for East Hampshire

---

### 2026-03-25: Phase 3 — Bartec and PDF Calendar Adapters Implemented

**Delivered:** Production-ready adapters for Fareham (Bartec) and East Hampshire (PDF calendars).

**Fareham Adapter (Bartec Collective Platform):**
- **Method:** SOAP/XML API integration with Bartec Municipal Technologies platform
- **Platform Pattern:** High reusability — Bartec used by many UK councils
- **Input:** UPRN (Unique Property Reference Number)
- **Risk Level:** MEDIUM (SOAP-based, may require authentication)
- **Key Patterns:**
  - SOAP envelope construction (XML-based web service)
  - XML response parsing with `fast-xml-parser`
  - Bartec service code mapping (RES→GENERAL_WASTE, REC→RECYCLING, GW→GARDEN_WASTE)
  - SOAP fault handling (structured error extraction)
  - Authentication support (Basic Auth over HTTPS)
  - Endpoint configuration via environment variable (`FAREHAM_API_ENDPOINT`)
- **Challenges:**
  - Bartec endpoint may require council partnership or API credentials
  - XML schema variance between Bartec implementations
  - Service code mapping varies by council (documented common patterns)
- **Lessons:**
  - SOAP APIs require more boilerplate than REST but offer structured contracts
  - XML parsing must handle multiple namespace formats
  - Bartec platform widely used — investment in base adapter pays dividends

**East Hampshire Adapter (PDF Calendar System):**
- **Method:** Two-phase acquisition (postcode→area→PDF download→parse)
- **Input:** Postcode (GU30-GU35 range)
- **Risk Level:** MEDIUM (PDF parsing, text extraction)
- **Key Patterns:**
  - Postcode-to-area static lookup with dynamic fallback capability
  - PDF download with security validation (domain allowlist, size limit, content-type check)
  - Text extraction using `pdf-parse` library
  - Date pattern matching (multiple UK formats: DD/MM/YYYY, DD Month YYYY, ISO)
  - Service type inference from text context (keyword analysis in 200-char window)
  - Content hash calculation for change detection
  - PDF security validation (JavaScript detection, embedded file warnings)
- **Challenges:**
  - PDF structure changes break parser (calendar redesigns)
  - Service type inference is probabilistic (0.75 confidence vs 0.9+ for API)
  - Static area mapping may not cover all postcodes (requires fallback)
  - 13-month calendar coverage only (no historical data)
- **Lessons:**
  - PDF parsing is inherently less reliable than API but viable for calendar-based councils
  - Aggressive caching essential (12h TTL) due to PDF download overhead
  - Text-based PDFs work well; image-based PDFs would require OCR
  - Context-based service type inference surprisingly effective

**Shared Base Adapters Built:**

1. **Bartec Base Adapter (`src/adapters/base/bartec-adapter.ts`)**
   - Reusable SOAP client for all Bartec Collective councils
   - SOAP envelope construction with XML escaping
   - XML parsing with namespace handling
   - SOAP fault extraction and categorization
   - Common Bartec service code mappings (RES, REC, GW, FOOD, GLASS)
   - Bartec date format parsing (DD/MM/YYYY, ISO)
   - Authentication flow (Basic Auth with credentials from Key Vault)
   - Pattern: `sendSoapRequest()`, `parseXmlResponse()`, `extractSoapFault()`

2. **PDF Calendar Base Adapter (`src/adapters/base/pdf-calendar-adapter.ts`)**
   - Reusable PDF download and parsing for all calendar-based councils
   - Secure PDF download with validation (domain, content-type, size)
   - Text extraction using `pdf-parse`
   - Multi-pattern date extraction (DD/MM/YYYY, DD Month YYYY, ISO)
   - Service type inference from context keywords
   - PDF security validation (JavaScript, embedded files)
   - SHA-256 content hashing for change detection
   - Pattern: `downloadPdf()`, `extractDatesFromText()`, `inferServiceTypeFromContext()`

**Bartec Service Code Mapping (Reusable):**
```
RES, REFUSE, RESIDUAL → general_waste
REC, RECYCLE, RECYCLING → recycling
GW, GARDEN, GREEN → garden_waste
FOOD, FW → food_waste
GLASS, GL → glass
```

**PDF Date Patterns (Reusable):**
- Slash/dash format: `\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b`
- Month name format: `\b(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|...|Dec)\s+(\d{4})\b`
- ISO format: `\b(\d{4})-(\d{2})-(\d{2})\b`

**Dependencies Added:**
- `fast-xml-parser@^4.5.0` — Safe XML parsing (no code execution)
- `pdf-parse@^1.1.1` — PDF text extraction (Node.js, no rendering)
- `uuid@^11.0.3` — UUID generation for evidence references
- `@types/pdf-parse@^1.1.4` — TypeScript types for pdf-parse
- `@types/uuid@^10.0.0` — TypeScript types for uuid

**Security Hardening Applied:**

1. **Bartec Adapter:**
   - SOAP-based — no JavaScript execution
   - XML parsing with `fast-xml-parser` (safe, configurable)
   - Domain allowlist: `farehamgw.bartecmunicipal.com`, `fareham.gov.uk`
   - Input sanitization (XML escaping for SOAP parameters)
   - Credentials stored in Azure Key Vault (accessed via managed identity)
   - Basic Auth over HTTPS only (never plaintext)
   - Timeout enforcement (30s)

2. **PDF Calendar Adapter:**
   - PDF download validation (domain, content-type, size limit 5MB)
   - `pdf-parse` library does not execute JavaScript or render PDFs
   - Text extraction only (no DOM manipulation)
   - PDF security scan (detects JavaScript, embedded files — warning logged)
   - Domain allowlist: `easthants.gov.uk`
   - Cloud metadata blocked (169.254.169.254)
   - Timeout enforcement (30s)

**Adapter Registry Updated:**
- Registry now supports 4 councils (Eastleigh, Rushmoor, Fareham, East Hampshire)
- Phase 2 and Phase 3 adapters registered
- Kill switches: `ADAPTER_KILL_SWITCH_FAREHAM`, `ADAPTER_KILL_SWITCH_EAST_HAMPSHIRE`

**Evidence Capture:**
- Fareham: Raw XML stored with SHA-256 hash
- East Hampshire: PDF content hash, download URL, extracted text

**Caching Strategy:**
- Fareham: 7-day TTL on collection schedules (same as API adapters)
- East Hampshire: 12-hour TTL on PDF calendars (aggressive due to infrequent updates)

**Performance Characteristics:**
- Fareham (SOAP): 2-3s per request (similar to REST APIs)
- East Hampshire (PDF): 5-10s per request (download + parsing overhead)

**Rate Limiting Strategy:**
- Fareham: 30 requests/minute (same as API adapters)
- East Hampshire: 10 requests/minute (PDF download bandwidth consideration)

**Testing Approach:**
- Unit tests: Service code mapping, date parsing, XML/PDF parsing
- Integration tests: Real SOAP/PDF downloads with test data
- Health checks: Automated daily smoke tests
- Schema drift detection: Content hash comparison

**Monitoring Metrics:**
- Fareham: Success rate (target >90%), SOAP fault frequency, authentication failures
- East Hampshire: PDF download success, parsing success, date extraction count

**Next Steps for Phase 4:**
- Apply PDF calendar pattern to Gosport and Havant (similar PDF systems)
- Apply Bartec pattern to any other Bartec councils discovered
- Implement standard form adapters (Hart, Test Valley, Portsmouth)
- Build Winchester browser automation adapter

**Reusability Impact:**
- Bartec base adapter applicable to any UK council using Bartec Collective
- PDF calendar base adapter applicable to Gosport, Havant, and future calendar-based councils
- Estimated 50% code reuse for next Bartec council
- Estimated 60% code reuse for next PDF calendar council

