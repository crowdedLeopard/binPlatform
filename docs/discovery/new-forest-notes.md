# New Forest District Council - Acquisition Notes

**Council ID:** `new-forest`  
**Last Updated:** 2026-03-25

## Official URL
https://www.newforest.gov.uk/findyourcollection

## Lookup Mechanism
**Method:** HTML Form (with aggressive bot protection)  
**Status:** ⚠️ 403 FORBIDDEN on automated fetch attempts

## Challenges
### Bot Protection
- 403 Forbidden returned on web_fetch attempt
- Likely has:
  - User-Agent checking
  - Rate limiting
  - Possible CAPTCHA
  - Session/cookie requirements

### Service Complexity
- **Phased Rollout:** New wheelie bin service 2025-26
- Three phases with different collection patterns
- Phase checker tool: newforest.gov.uk/findmyphase
- Rural district with varied geography
- Collections vary by phase and area

## Acquisition Strategy
**If Pursuing:**
1. Browser automation (Playwright) likely required
2. Handle phase detection per property
3. Account for rollout changes through 2026
4. Expect maintenance burden during transition

## Recommendation
### ⏸️ POSTPONE Implementation

**Reasons:**
1. Active bot protection makes automation difficult
2. Service in transition (phased rollout through 2026)
3. High maintenance risk during rollout period
4. Complex phase-based collection patterns
5. Rural spread adds geographic complexity

**Revisit When:**
- Service rollout completes (late 2026)
- Collection patterns stabilise
- Bot protection posture understood
- Resource availability for high-maintenance adapter

## Alternative
- Wait for community scrapers (UKBinCollectionData) to solve bot protection
- Monitor for API availability post-rollout
- Consider lower priority vs. other councils

## Risk Assessment
**Upstream Risk:** HIGH  
**Maintenance Burden:** HIGH  
**Success Probability:** LOW (due to bot protection)

**Implementation Priority:** ⏸️ Phase 6 - Postpone

**Estimated Effort:** 3-5 days (uncertain)  
**Confidence:** 60%  
**Risk:** High
