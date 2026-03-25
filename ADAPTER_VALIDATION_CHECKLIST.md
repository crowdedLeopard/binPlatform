# Adapter Validation Checklist

## Pre-Deployment Testing Checklist

### Test Valley Borough Council

#### Selector Validation
- [ ] Navigate to `https://www.testvalley.gov.uk/wasteandrecycling/when-are-my-bins-collected`
- [ ] Verify postcode input field visible
- [ ] Verify submit button visible and clickable
- [ ] Inspect postcode input for actual name/id/placeholder attributes
- [ ] Inspect submit button for actual text/id
- [ ] Update selectors if needed: `src/adapters/test-valley/index.ts`

#### Address Extraction
- [ ] Enter test postcode: `SP10 1AA`
- [ ] Verify address list appears
- [ ] Check if addresses in dropdown (`<select>`) or buttons
- [ ] Verify address selection works
- [ ] Note actual selector used for extraction

#### Collection Schedule Parsing
- [ ] Select an address
- [ ] Verify collection dates appear on page
- [ ] Identify where date information is displayed:
  - [ ] In table rows?
  - [ ] In `div` containers?
  - [ ] In `li` elements?
  - [ ] In data attributes?
- [ ] Note exact date format(s) used
- [ ] Verify all service types shown (General Waste, Recycling, Garden Waste)
- [ ] Update parser regex if date format differs

#### Date Format Verification
- [ ] Capture actual date strings from site
- [ ] Verify parser handles format:
  - [ ] DD/MM/YYYY (e.g., "15/03/2026")
  - [ ] ISO format (e.g., "2026-03-15")
  - [ ] Named dates (e.g., "15th March 2026")
- [ ] Test parser with captured dates

#### Postcode Validation
- [ ] Test valid postcodes:
  - [ ] `SP6 1AA` → Valid
  - [ ] `SP10 1AA` → Valid
  - [ ] `SP11 1AA` → Valid
  - [ ] `SO20 1AA` → Valid
  - [ ] `SO51 1AA` → Valid
- [ ] Test invalid postcodes:
  - [ ] `SP5 1AA` → Invalid (outside range)
  - [ ] `SO19 1AA` → Invalid (outside range)
  - [ ] `XXX 1AA` → Invalid (format)

#### Collection Accuracy
- [ ] Verify alternate weekly pattern documented
- [ ] Confirm black bin (general waste) dates
- [ ] Confirm brown bin (garden waste) dates (if different weeks)
- [ ] Verify blue bin (recycling) dates
- [ ] Check for subscription requirement on garden waste

#### Kill Switch & Environment
- [ ] Test `ADAPTER_KILL_SWITCH_TEST_VALLEY=true` disables adapter
- [ ] Test `TEST_VALLEY_BASE_URL` override works
- [ ] Verify error messages for disabled adapter

#### Final Sign-off
- [ ] Selectors validated: ✓/✗
- [ ] All dates parsed correctly: ✓/✗
- [ ] All service types extracted: ✓/✗
- [ ] Postcode validation working: ✓/✗
- [ ] Ready for production: ✓/✗
- [ ] Set `SELECTORS_VALIDATED = true`: ✓/✗

---

### Portsmouth City Council

#### Selector Validation
- [ ] Navigate to `https://my.portsmouth.gov.uk/service/collection_schedules`
- [ ] Handle cookie consent (click Accept button)
- [ ] Verify postcode/house number input visible
- [ ] Inspect for actual input field names/ids
- [ ] Verify submit button visible ("Find" vs "Search")
- [ ] Update selectors if needed: `src/adapters/portsmouth/index.ts`

#### Granicus Platform Specifics
- [ ] Identify cookie consent button location
- [ ] Check if consent required on every session
- [ ] Verify redirect behavior on `my.portsmouth.gov.uk`
- [ ] Check for CSRF token fields (auto-handled by browser)
- [ ] Note any Granicus-specific class names (`.granicus-*`)

#### Address Extraction
- [ ] Enter test postcode: `PO1 1AA`
- [ ] Verify address list appears (dropdown or buttons)
- [ ] Check for house number requirement (two-step process)
- [ ] Verify address selection mechanism:
  - [ ] Dropdown select?
  - [ ] Button click?
  - [ ] Text input?
- [ ] Note actual selectors for address selection

#### Collection Schedule Parsing
- [ ] Select an address
- [ ] Verify collection dates appear
- [ ] Identify where dates are displayed:
  - [ ] Table format?
  - [ ] Card format?
  - [ ] List format?
  - [ ] Data attributes?
- [ ] Note actual date format(s)
- [ ] Verify all service types shown (General Waste, Recycling, Garden Waste, Food Waste)

#### Date Format Verification
- [ ] Capture actual date strings from Granicus
- [ ] Verify parser handles Portsmouth date format
- [ ] Test parser with captured examples
- [ ] Check for any Granicus-specific date patterns

#### Postcode Validation
- [ ] Test valid postcodes:
  - [ ] `PO1 1AA` → Valid (City Centre)
  - [ ] `PO2 1AA` → Valid (North)
  - [ ] `PO3 1AA` → Valid (West)
  - [ ] `PO4 1AA` → Valid (East)
  - [ ] `PO5 1AA` → Valid (Fareham)
  - [ ] `PO6 1AA` → Valid (Hayling)
- [ ] Test invalid postcodes:
  - [ ] `PO7 1AA` → Invalid (outside range)
  - [ ] `SO1 1AA` → Invalid (outside range)
  - [ ] `XXX 1AA` → Invalid (format)

#### Granicus Session Management
- [ ] Test long-running operations (does session timeout?)
- [ ] Verify cookie handling works correctly
- [ ] Check for session redirect loops
- [ ] Verify error handling for expired sessions
- [ ] Test retry logic if session expires

#### Collection Accuracy
- [ ] Verify General Waste (Grey Bin) dates
- [ ] Verify Recycling (Blue Bin) dates
- [ ] Verify Garden Waste (Brown Bin) dates (if applicable)
- [ ] Verify Food Waste (Caddy) dates (if applicable)
- [ ] Check for subscription requirements

#### Cookie Consent Handling
- [ ] Test cookie consent button click
- [ ] Verify consent persists across pages
- [ ] Check for fallback if button not found
- [ ] Test with multiple button selectors

#### Kill Switch & Environment
- [ ] Test `ADAPTER_KILL_SWITCH_PORTSMOUTH=true` disables adapter
- [ ] Test `PORTSMOUTH_BASE_URL` override works
- [ ] Test `PORTSMOUTH_LOOKUP_PATH` override works
- [ ] Verify error messages for disabled adapter

#### Final Sign-off
- [ ] Selectors validated: ✓/✗
- [ ] Cookie consent working: ✓/✗
- [ ] Address extraction working: ✓/✗
- [ ] All dates parsed correctly: ✓/✗
- [ ] All service types extracted: ✓/✗
- [ ] Postcode validation working: ✓/✗
- [ ] Session management working: ✓/✗
- [ ] Ready for production: ✓/✗
- [ ] Set `SELECTORS_VALIDATED = true`: ✓/✗

---

## Performance Testing Checklist

### Test Valley
- [ ] Single request response time: ____ seconds (target: 5-8s)
- [ ] Parallel requests (2x): ____ seconds each (should not degrade significantly)
- [ ] Memory usage per request: ____ MB (target: <200MB)
- [ ] Cache hit response time: ____ ms (target: <100ms)
- [ ] Error rate under load: ____ % (target: <5%)

### Portsmouth
- [ ] Single request response time: ____ seconds (target: 10-15s)
- [ ] Parallel requests (1x only - test limitations): ____ seconds
- [ ] Memory usage per request: ____ MB (target: <250MB)
- [ ] Cache hit response time: ____ ms (target: <100ms)
- [ ] Session timeout frequency: ____ % (target: <2%)
- [ ] Cookie consent success rate: ____ % (target: >95%)

---

## Error Handling Testing

### Common Scenarios

**Test Valley**
- [ ] Invalid postcode format → Error message
- [ ] Postcode outside service area → Error message
- [ ] No addresses found → Handled gracefully
- [ ] Page navigation fails → Retry logic works
- [ ] Selector not found → Warning logged

**Portsmouth**
- [ ] Cookie consent missing → Fallback works
- [ ] Session expired → Retry with fresh session
- [ ] Address selection fails → Error message
- [ ] Postcode outside service area → Error message
- [ ] No addresses found → Handled gracefully
- [ ] Page navigation fails → Retry logic works
- [ ] Selector not found → Warning logged

---

## Integration Checklist

- [ ] Adapters exported from `src/adapters/registry.ts`
- [ ] Health check endpoint responds correctly
- [ ] Adapter appears in capabilities discovery
- [ ] Rate limiting applied (8 req/min Test Valley, 6 req/min Portsmouth)
- [ ] Monitoring/alerting configured
- [ ] Cache TTL set (7 days recommended)
- [ ] Kill switches configured in deployment
- [ ] Environment variables documented
- [ ] Logs show adapter startup/shutdown cleanly

---

## Documentation Checklist

- [ ] README.md complete for both adapters
- [ ] Selectors documented (with caveat: UNVALIDATED)
- [ ] Known limitations documented
- [ ] Rate limiting guidance documented
- [ ] Postcode ranges documented
- [ ] Service types documented
- [ ] Environment variables documented
- [ ] Health check test postcodes documented
- [ ] Migration paths documented

---

## Go/No-Go Decision

| Criteria | Test Valley | Portsmouth |
|----------|-------------|-----------|
| Selectors validated | ⬜ | ⬜ |
| All tests passing | ⬜ | ⬜ |
| Error handling working | ⬜ | ⬜ |
| Performance acceptable | ⬜ | ⬜ |
| Documentation complete | ⬜ | ⬜ |
| Kill switches tested | ⬜ | ⬜ |
| Monitoring configured | ⬜ | ⬜ |

**Overall Status:** ⬜ GO / ⬜ NO-GO

**Sign-off Date:** _____________

**Signed by:** _____________

**Notes:** _______________________________________________________

---

## Post-Deployment Monitoring

### Week 1 (First Production Week)
- [ ] Monitor success rate (target: >85%)
- [ ] Watch for schema drift warnings
- [ ] Check error rate by category
- [ ] Validate response times match testing

### Week 2-4
- [ ] Collect baseline metrics
- [ ] Identify any systematic issues
- [ ] Validate cache effectiveness
- [ ] Confirm no credential leaks in logs

### Ongoing
- [ ] Monthly selector validation check
- [ ] Quarterly full regression test
- [ ] Review error patterns
- [ ] Update documentation as needed
- [ ] Monitor for Granicus platform changes (Portsmouth)
