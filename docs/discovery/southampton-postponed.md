# Southampton City Council — Adapter Postponed

**Status:** POSTPONED  
**Council ID:** `southampton`  
**Date:** 2026-03-25  
**Decision Maker:** Holden (Lead Architect)

---

## Summary

The Southampton City Council adapter has been **postponed** due to Incapsula/Imperva CDN bot protection. The upstream service actively blocks automated access with CAPTCHA challenges and 403 responses, making reliable data acquisition infeasible.

---

## Discovery Findings

### Upstream Service
- **URL:** https://www.southampton.gov.uk/bins-recycling/bins/collections/
- **Lookup Method:** HTML form (postcode + street name, min 6 chars)
- **CDN/Protection:** Incapsula (Imperva) with active bot detection
- **Blocking Mechanism:** 403 Forbidden + CAPTCHA challenges on automated access

### Technical Challenges
1. **Incapsula CDN Protection:** Enterprise-grade bot detection with fingerprinting
2. **CAPTCHA Challenges:** Human verification required for form submissions
3. **No Public API:** Council does not expose machine-readable endpoints
4. **Large Urban Authority:** 250,000+ population requires high reliability and scale

### Upstream Risk Level
**HIGH** — Incapsula is one of the most sophisticated bot protection systems; bypass attempts are fragile and high-maintenance.

---

## Why Postponed

1. **CAPTCHA Barrier:** Human verification challenges cannot be automated reliably or ethically
2. **CDN Sophistication:** Incapsula uses advanced fingerprinting (TLS, HTTP/2, browser quirks) that defeats simple workarounds
3. **Resource Cost:** Bypassing Incapsula requires significant ongoing engineering effort with no guarantee of success
4. **Alternative Priorities:** 11 of 13 councils are accessible; Southampton represents ~14% of Hampshire population
5. **Ethical Concerns:** Aggressive bypass attempts may be interpreted as adversarial and damage council relationships

---

## Potential Future Approaches

### Option 1: Manual Partnership (Strongly Recommended)
- Contact Southampton Digital/IT team
- Request API access or documented integration method
- Formal data sharing agreement under public sector collaboration
- Highlight public benefit of bin collection data availability
- **Timeline:** 3-6 months for partnership negotiation

### Option 2: Third-Party Service
- **Discovery:** `bin-calendar.nova.do` offers UPRN-based lookup for Southampton
- Evaluate third-party service reliability and terms
- Requires UPRN resolution for postcodes
- **Risk:** Dependency on external service; licensing concerns

### Option 3: Browser Automation with Anti-Detection (Not Recommended)
- Playwright with Stealth plugin to mimic human browsing
- Rotate residential proxies to avoid IP-level blocking
- Solve CAPTCHA challenges (third-party CAPTCHA solver services)
- **Issues:**
  - Fragile and high-maintenance
  - CAPTCHA solving services introduce privacy/security risks
  - Violates spirit of "automated access discouraged" policy
  - May trigger escalated security response from council

### Option 4: Wait for Policy Change
- Monitor for council digital transformation initiatives
- Southampton may adopt Open Data principles in future
- UK government push for public sector API availability
- **Timeline:** 12-24 months (speculative)

---

## Third-Party Service Evaluation

### bin-calendar.nova.do
- **Type:** UPRN-based lookup service for Southampton bins
- **Coverage:** Southampton only (single-council scope)
- **Method:** Unknown (may be using same upstream, or internal partnership)
- **Status:** Requires investigation
- **Questions:**
  1. Is this an official council service or third-party scraper?
  2. What are the terms of use and rate limits?
  3. How does it bypass Incapsula (if upstream is same)?
  4. What is the reliability and uptime?

**Action Required:** Research bin-calendar.nova.do legitimacy and viability before considering integration.

---

## Current Adapter Behavior

The `SouthamptonAdapter` class returns:
- **Health Status:** `UNAVAILABLE`
- **Failure Category:** `BOT_DETECTION`
- **Error Message:** "Incapsula/Imperva bot protection active — manual review required"
- **Capabilities:** All fields set to unsupported/false
- **Lookup Method:** `UNSUPPORTED`

API calls for Southampton properties will receive clear error responses indicating the adapter is postponed.

---

## Impact Assessment

### Coverage Impact
- **Population:** ~253,000 (14% of Hampshire)
- **Households:** ~103,000
- **Postcodes:** SO14-19

### Mitigation
- Clear error messaging to users in affected postcodes
- Documentation of postponement status in public API
- No degradation of service for other 11 councils
- Consider third-party service as interim solution if viable

---

## Review Triggers

Re-evaluate Southampton adapter when:
1. ✅ Partnership opportunity arises (council contact or data sharing request)
2. ✅ Council announces Open Data initiative or API availability
3. ✅ Incapsula protection is lifted or documented bypass available
4. ✅ Third-party service (bin-calendar.nova.do) is validated and viable
5. ✅ UK government mandates public sector API availability for waste services

---

## Ethical Considerations

Attempting to circumvent Incapsula protection raises ethical questions:
- **Respect for Intent:** Bot protection indicates council preference against automation
- **Resource Burden:** Aggressive scraping may degrade service for legitimate users
- **Relationship Risk:** Adversarial approach may harm future partnership opportunities
- **Legal Gray Area:** Terms of Service likely prohibit automated access

**Recommendation:** Pursue partnership over technical circumvention.

---

## References

- Council Registry Entry: `data/council-registry.json` (upstream_risk_level: "high")
- Discovery Notes: `docs/discovery/southampton-notes.md`
- Adapter Implementation: `src/adapters/southampton/index.ts`
- Third-Party Service: https://bin-calendar.nova.do (requires validation)

---

**Recommendation:** Initiate partnership conversation with Southampton Digital team. Postpone technical implementation pending partnership outcome or third-party service validation.
