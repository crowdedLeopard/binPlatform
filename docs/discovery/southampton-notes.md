# Southampton City Council - Acquisition Notes

**Council ID:** `southampton`  
**Last Updated:** 2026-03-25

## Official URL
https://www.southampton.gov.uk/bins-recycling/bins/collections/

## Lookup Mechanism
**Method:** HTML Form (with Incapsula/Imperva protection)  
**Status:** ⚠️ Bot Protection Active

## Challenges
### Incapsula/Imperva CDN Protection
- Detected on web_fetch attempt
- Sophisticated bot detection:
  - JavaScript challenges
  - Likely CAPTCHA
  - Browser fingerprinting
  - Rate limiting
  - IP reputation checking

### Direct Access
- Very difficult without browser automation
- May require:
  - Headless browser with stealth plugins
  - Residential proxies
  - CAPTCHA solving service
  - High maintenance burden

## Alternative: Third-Party Service
### bin-calendar.nova.do
- **URL:** https://bin-calendar.nova.do/
- **Method:** UPRN-based lookup for Southampton
- **How it works:**
  1. User finds UPRN (e.g., via uprn.uk)
  2. Enters UPRN on bin-calendar site
  3. Generates calendar subscription link
- **Advantage:** Bypasses direct council access
- **Risk:** Dependency on third-party service

## Acquisition Strategy
### Option A: Third-Party Integration (Recommended)
- Use bin-calendar.nova.do API (if available)
- UPRN resolution required
- Less maintenance than direct access

### Option B: Direct Access (Not Recommended)
- Browser automation with stealth mode
- Residential proxy rotation
- CAPTCHA solving
- Very high maintenance
- Likely to break frequently

## Recommendation
### ⏸️ LOW PRIORITY / THIRD-PARTY APPROACH

**Reasons:**
1. Incapsula protection makes direct access very difficult
2. High maintenance burden
3. Third-party alternative exists
4. Resources better spent on other councils

**If Implementing:**
- Use third-party service (bin-calendar.nova.do)
- Document dependency and risk
- Monitor third-party service availability
- Have fallback plan if service disappears

## Risk Assessment
**Direct Access Risk:** HIGH  
**Third-Party Dependency:** MEDIUM  
**Maintenance (Direct):** VERY HIGH  
**Maintenance (Third-Party):** LOW

**Implementation Priority:** ⏸️ Phase 6 - Third-Party or Postpone

**Estimated Effort:** 
- Third-party integration: 1-2 days
- Direct access: 3-4 days (uncertain success)

**Confidence:** 60%  
**Risk:** High (direct), Medium (third-party)
