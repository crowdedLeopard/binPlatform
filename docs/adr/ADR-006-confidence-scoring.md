# ADR-006: Confidence Scoring Design

**Status:** Approved  
**Date:** 2026-03-25  
**Authors:** Holden (Lead Architect)  
**Decision Owner:** Holden  

---

## Context

Adapters acquire bin collection data from 13 Hampshire councils using varied methods: APIs, hidden JSON endpoints, HTML forms, browser automation, and PDF parsing. Each method has different reliability characteristics. API responses are highly structured and stable; browser automation is fragile and prone to breakage.

**Problem:**  
Users need to know how reliable acquired data is. Not all collection dates are created equal:
- API data from Eastleigh acquired 2 hours ago: **highly reliable**
- PDF parse from Winchester acquired 3 days ago: **less reliable**
- Browser scrape that hit warnings: **uncertain reliability**

Without confidence scoring, all data appears equally trustworthy. This prevents informed decision-making and risks presenting unreliable data as authoritative.

---

## Decision

Implement a **weighted multi-factor confidence scoring system** that assigns every `CollectionEventResult` a numeric confidence score (0.0–1.0) computed from:

1. **Acquisition method score** (35% weight):
   - API: 1.0
   - Hidden JSON: 0.95
   - HTML form: 0.85
   - Browser automation: 0.75
   - PDF calendar: 0.7
   - Unknown: 0.3

2. **Freshness score** (25% weight):
   - Time-based decay from acquisition timestamp
   - API/browser: fresh for 4h, then linear decay
   - PDF/calendar: fresh for 24h (calendars change less frequently)
   - Decay rate varies by method

3. **Validation score** (25% weight):
   - Based on field validations passed/failed
   - Each failed validation: -10%
   - Parse warnings: -5% per warning (multiplicative penalty)

4. **Adapter health score** (15% weight):
   - 0.0–1.0 from recent health checks
   - Reflects upstream stability

**Multiplicative penalties:**
- Partial data (missing expected fields): -15%
- Stale cache: -10%

**Named thresholds:**
- **Confirmed** (≥0.8): Display as "confirmed"
- **Likely** (≥0.6): Display as "likely"
- **Unverified** (≥0.4): Display as "unverified"
- **Stale** (<0.4): Trigger re-acquisition

---

## Alternatives Considered

### 1. Simple boolean flag (fresh/stale)
**Pros:** Easy to implement, clear to users  
**Cons:** Loses nuance between "API data 1h old" vs "PDF data 23h old" – both would be "fresh"

**Rejected:** Insufficient granularity for informed decision-making.

---

### 2. Multi-dimensional score (method, freshness, validation as separate values)
**Pros:** Maximum transparency, users can weight factors themselves  
**Cons:** Complex to present in UI, shifts decision-making to client, inconsistent interpretation

**Rejected:** Increases cognitive load; platform should provide single authoritative score.

---

### 3. Risk-based score (inverted confidence)
**Pros:** Security mindset (focus on what could be wrong)  
**Cons:** Negative framing, harder to interpret ("70% risky" vs "30% confident")

**Rejected:** Positive framing ("confirmed") is clearer than negative ("30% risky").

---

## Rationale

**Why weighted numeric score:**
- Enables clients to filter by confidence level (e.g., "only show confirmed events")
- Supports retention policies (delete evidence for stale data)
- Powers drift detection (confidence drop triggers review)
- Transparent: clients receive full `ConfidenceFactors` breakdown

**Why these weights:**
- **Method** (35%): Acquisition method is strongest predictor of reliability
- **Freshness** (25%): Bin schedules change; old data becomes unreliable
- **Validation** (25%): Failed validations indicate data quality issues
- **Health** (15%): Upstream stability matters but less than method/freshness

**Why named thresholds:**
- "Confirmed" (0.8+) communicates high confidence clearly
- "Stale" (<0.4) provides operational trigger for re-acquisition
- Four levels balance granularity vs simplicity

---

## Consequences

### Positive
- **Transparency:** Users understand data reliability
- **Operational:** Enables automated re-acquisition policies
- **Security:** Low-confidence data flagged, never presented as authoritative
- **Drift detection:** Confidence drop alerts to schema changes

### Negative
- **Complexity:** Adds computation to every acquisition
- **Tuning required:** Weights may need adjustment based on real-world performance
- **Storage overhead:** `ConfidenceFactors` stored with each result (mitigated by JSONB compression)

### Neutral
- **Client responsibility:** Clients must interpret confidence levels appropriately (API docs must be clear)

---

## Security Implications

**Critical constraint:** Low-confidence data must not be presented as authoritative.

1. **API responses include confidence scores:**
   - All `/properties/{propertyId}/collections` responses include `confidence` and `confidence_level`
   - API docs explain threshold meanings

2. **Admin dashboard flags low-confidence data:**
   - Dashboard alerts when average confidence drops below 0.6
   - Drift alerts triggered on confidence anomalies

3. **Evidence retention keys off confidence:**
   - High-confidence data (≥0.8): retain evidence 90 days
   - Low-confidence data (<0.4): retain evidence 180 days (for debugging)

4. **Audit logging:**
   - Confidence score logged with every acquisition attempt
   - Score changes tracked in `confidence_log` table for forensics

**Security review requirement:**  
Any change to confidence calculation weights or thresholds requires security review (prevents gaming the system).

---

## Implementation Notes

- **Module:** `src/core/confidence/index.ts`
- **Database:** `confidence_log` table (time-series)
- **Integration:** Every adapter result computation calls `computeConfidence()`
- **Monitoring:** Alert if average confidence across all councils drops below 0.7

---

## References

- `src/core/confidence/index.ts` — Confidence scoring engine
- `src/core/confidence/freshness.ts` — Freshness decay functions
- `src/core/confidence/thresholds.ts` — Named thresholds
- `src/storage/db/migrations/006_confidence_log.sql` — Confidence logging table

---

## Review History

- **2026-03-25:** Initial decision (Holden)
- **Pending:** Team review and approval
