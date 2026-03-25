# New Forest District Council — Adapter Postponed

**Status:** POSTPONED  
**Council ID:** `new-forest`  
**Date:** 2026-03-25  
**Decision Maker:** Holden (Lead Architect)

---

## Summary

The New Forest District Council adapter has been **postponed** due to aggressive bot protection at the upstream source. Automated access is blocked at the network level with 403 Forbidden responses, making reliable data acquisition infeasible without manual intervention.

---

## Discovery Findings

### Upstream Service
- **URL:** https://www.newforest.gov.uk/findyourcollection
- **Lookup Method:** HTML form (postcode + address)
- **Bot Protection:** Active — 403 Forbidden on automated fetch attempts
- **Detection Mechanism:** Unknown (possibly Incapsula, Cloudflare, or custom solution)

### Technical Challenges
1. **403 Forbidden Responses:** All automated HTTP requests blocked at network perimeter
2. **No Public API:** Council does not expose machine-readable endpoints
3. **Complex Service Rollout:** Phased wheelie bin rollout (2025-26) adds data model complexity
4. **Rural District:** Large geographic area with varied collection patterns

### Upstream Risk Level
**HIGH** — Active bot protection with no documented workaround path.

---

## Why Postponed

1. **Bot Protection Barrier:** 403 responses indicate network-level blocking that cannot be reliably bypassed
2. **Service Stability:** Phased rollout ongoing — service patterns not yet stabilised
3. **Alternative Priorities:** 11 of 13 councils are accessible; New Forest represents <8% of Hampshire population
4. **Resource Allocation:** Time spent circumventing bot protection is better invested in stable adapters

---

## Potential Future Approaches

### Option 1: Manual Partnership (Recommended)
- Contact New Forest IT/Digital team
- Request API access or documented integration method
- Formal data sharing agreement under public sector collaboration framework
- **Timeline:** 3-6 months for partnership negotiation

### Option 2: Browser Automation with Anti-Detection
- Full headless browser with stealth mode (Playwright Stealth plugin)
- Mimic human browsing patterns (random delays, mouse movements)
- Rotate User-Agent strings and request headers
- **Risk:** High maintenance burden; fragile; may still trigger CAPTCHA

### Option 3: Wait for Service Stabilisation
- Monitor for phased rollout completion (expected 2026 Q2)
- Re-evaluate bot protection posture after service stabilises
- May coincide with council digital transformation initiatives
- **Timeline:** 6-12 months

### Option 4: Third-Party Data Aggregator
- Partner with UKBinCollectionData community or similar
- Leverage existing working scrapers (if any)
- Requires license review and attribution
- **Risk:** Dependency on external project maintenance

---

## Current Adapter Behavior

The `NewForestAdapter` class returns:
- **Health Status:** `UNAVAILABLE`
- **Failure Category:** `BOT_DETECTION`
- **Error Message:** "Upstream bot protection active — manual review required"
- **Capabilities:** All fields set to unsupported/false
- **Lookup Method:** `UNSUPPORTED`

API calls for New Forest properties will receive clear error responses indicating the adapter is postponed.

---

## Impact Assessment

### Coverage Impact
- **Population:** ~177,000 (7.8% of Hampshire)
- **Households:** ~77,000
- **Postcodes:** SO40-45, BH23-25

### Mitigation
- Clear error messaging to users in affected postcodes
- Documentation of postponement status in public API
- No degradation of service for other 11 councils

---

## Review Triggers

Re-evaluate New Forest adapter when:
1. ✅ Phased service rollout completes (expected 2026 Q2)
2. ✅ Council announces digital transformation / API availability
3. ✅ Bot protection is lifted or documented bypass available
4. ✅ Partnership opportunity arises (e.g., council contact or data sharing request)

---

## References

- Council Registry Entry: `data/council-registry.json` (upstream_risk_level: "high")
- Discovery Notes: `docs/discovery/new-forest-notes.md`
- Adapter Implementation: `src/adapters/new-forest/index.ts`
- ADR-007: Overlapping Postcodes (mentions New Forest coverage)

---

**Recommendation:** Focus resources on 11 accessible councils. Revisit New Forest in Q2 2026 or when partnership opportunity arises.
