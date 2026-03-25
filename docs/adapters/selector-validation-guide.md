# Browser Adapter Selector Validation Guide

**Hampshire Bin Collection Data Platform**  
**Version:** 1.0  
**Last Updated:** 2024-03-26  
**Owner:** Naomi (Backend Developer)

---

## Overview

11 of our adapters use Playwright browser automation to scrape council websites. CSS selectors must be verified against live council websites before setting `SELECTORS_VALIDATED=true` in the adapter code.

**Why validation matters:**
- Council websites change without notice
- Broken selectors cause silent failures (adapter returns empty results)
- Manual validation prevents production incidents

---

## Browser-Based Adapters

The following adapters use browser automation and require selector validation:

| Council | Adapter Path | Status | Last Validated |
|---------|-------------|--------|----------------|
| Basingstoke & Deane | `src/adapters/basingstoke-deane/` | ⚠️ Needs validation | Never |
| Eastleigh | `src/adapters/eastleigh/` | ⚠️ Needs validation | Never |
| East Hampshire | `src/adapters/east-hampshire/` | ⚠️ Needs validation | Never |
| Fareham | `src/adapters/fareham/` | ⚠️ Needs validation | Never |
| Gosport | `src/adapters/gosport/` | ⚠️ Needs validation | Never |
| Hart | `src/adapters/hart/` | ⚠️ Needs validation | Never |
| Havant | `src/adapters/havant/` | ⚠️ Needs validation | Never |
| New Forest | `src/adapters/new-forest/` | ⚠️ Needs validation | Never |
| Rushmoor | `src/adapters/rushmoor/` | ⚠️ Needs validation | Never |
| Test Valley | `src/adapters/test-valley/` | ⚠️ Needs validation | Never |
| Winchester | `src/adapters/winchester/` | ⚠️ Needs validation | Never |

---

## Validation Checklist per Adapter

For each browser-based adapter, perform the following validation:

### 1. Run the adapter in isolation against the live site

```bash
# Set environment variables for test run
export COUNCIL_ID=basingstoke-deane
export TEST_POSTCODE=RG21 4AH
export TEST_HOUSE_NUMBER=1

# Run adapter validation script
npm run adapter:validate
```

The validation script will:
- Navigate to the council website
- Fill in the test postcode
- Select the test address
- Parse collection dates
- Compare parsed output against expected canonical format

### 2. Verify each selector in the adapter's index.ts

Open the adapter file (e.g., `src/adapters/basingstoke-deane/index.ts`) and review the selectors:

```typescript
// Example selectors to validate
const SELECTORS = {
  postcodeInput: '#postcode-search',
  submitButton: 'button[type="submit"]',
  addressSelect: '#address-dropdown',
  collectionDates: '.collection-date',
  serviceType: '.service-name',
};
```

For each selector:
- [ ] Does it resolve to the intended element?
- [ ] Is it unique on the page?
- [ ] Is it stable (not auto-generated class names like `css-xyz123`)?

### 3. Check the parsed output matches the expected canonical format

The adapter should return:

```typescript
{
  success: true,
  data: [
    {
      eventId: string,
      serviceId: string,
      serviceType: ServiceType,  // Must be from canonical enum
      collectionDate: string,    // ISO 8601 format (YYYY-MM-DD)
      isConfirmed: boolean,
      isPast: boolean,
      notes?: string,
    }
  ],
  acquisitionMetadata: { /* ... */ },
  confidence: number,  // 0.0-1.0
  warnings: string[],
}
```

Validate:
- [ ] At least 1 collection event returned
- [ ] All dates are valid ISO 8601 format
- [ ] All service types are in the canonical enum
- [ ] Confidence score is reasonable (>= 0.7 for production)
- [ ] No parse warnings

### 4. Set SELECTORS_VALIDATED flag

If all checks pass, update the adapter file:

```typescript
// At the top of the adapter file
const SELECTORS_VALIDATED = true;  // Change from false to true
const LAST_VALIDATED_DATE = '2024-03-26';
```

### 5. Update council-registry.json confidence score

Based on actual validation results, update the confidence score:

```json
{
  "councilId": "basingstoke-deane",
  "adapterConfidence": 0.85,
  "lastValidated": "2024-03-26"
}
```

**Confidence score guide:**
- `0.9-1.0`: Perfect parsing, all fields populated, stable selectors
- `0.8-0.9`: Good parsing, minor warnings, mostly stable selectors
- `0.7-0.8`: Acceptable parsing, some warnings, fragile selectors
- `<0.7`: Unreliable parsing, many warnings, needs improvement

---

## How to Run Validation Manually

If the automated script doesn't exist yet, validate manually:

### Step 1: Open the council website in a browser

Navigate to the council's bin collection lookup page:

```bash
# Example for Basingstoke & Deane
open "https://www.basingstoke.gov.uk/bincollection"
```

### Step 2: Open browser DevTools

1. Press `F12` to open DevTools
2. Go to the **Console** tab
3. Use `$$()` to test selectors

### Step 3: Test each selector

For each selector in the adapter, run:

```javascript
// Test postcode input
$$('#postcode-search')  // Should return [<input>]

// Test submit button
$$('button[type="submit"]')  // Should return [<button>]

// Test collection dates
$$('.collection-date')  // Should return array of elements
```

**What to look for:**
- Selector returns **exactly** the elements you expect
- No extra elements returned (too broad)
- No missing elements (too specific)

### Step 4: Test the full flow

1. Fill in a test postcode manually
2. Select a test address
3. Check that collection dates appear
4. Note the exact HTML structure

### Step 5: Compare with adapter selectors

Does the adapter's selector match what you see in the live site?

If **NO**: Update the selector in the adapter.  
If **YES**: Mark as validated.

---

## What to Do When a Selector Breaks

Council websites change. When a selector breaks:

### 1. Check if the council's website has changed

- Compare current page HTML with last screenshot in `evidence/` folder
- Look for structural changes (new wrapper divs, class name changes)

### 2. Update the selector

Update `src/adapters/{council-id}/index.ts`:

```typescript
// Old (broken) selector
const SELECTORS = {
  collectionDates: '.bin-dates',  // ❌ No longer exists
};

// New (updated) selector
const SELECTORS = {
  collectionDates: '.collection-list .date-item',  // ✅ Updated
};
```

### 3. Set SELECTORS_VALIDATED back to false temporarily

```typescript
const SELECTORS_VALIDATED = false;  // Mark as unvalidated
```

### 4. Re-validate

Follow the validation checklist above.

### 5. Set back to true

Once validated:

```typescript
const SELECTORS_VALIDATED = true;
const LAST_VALIDATED_DATE = '2024-03-26';  // Update date
```

### 6. Log the change

Add entry to `.squad/agents/naomi/history.md`:

```markdown
## 2024-03-26 - Basingstoke Adapter Selector Update

Council changed website structure. Updated selectors:
- `.bin-dates` → `.collection-list .date-item`
- Validated against live site
- Confidence score: 0.85
```

---

## Known Fragile Selectors

Document any selectors that are known to be fragile:

### Position-Based Selectors (Fragile)

**Problem:** Selectors that rely on element position break easily.

```typescript
// ❌ Fragile - breaks if new elements are added
collectionDates: 'div:nth-child(3) .date'

// ✅ Better - uses semantic class
collectionDates: '.collection-date'
```

### Text Content Matching (Fragile)

**Problem:** Selectors that match on text break when copy changes.

```typescript
// ❌ Fragile - breaks if text changes
submitButton: 'button:has-text("Search")'

// ✅ Better - uses semantic attribute
submitButton: 'button[type="submit"][name="search"]'
```

### Auto-Generated IDs (Fragile)

**Problem:** IDs that look auto-generated change on rebuild.

```typescript
// ❌ Fragile - looks auto-generated
addressSelect: '#select-xyz123'

// ✅ Better - use data attribute or stable class
addressSelect: '[data-testid="address-select"]'
```

### Overly-Specific Selectors (Fragile)

**Problem:** Too many nested levels break when structure changes.

```typescript
// ❌ Fragile - too specific
collectionDates: 'main > div > div > section > ul > li > span.date'

// ✅ Better - less specific, more resilient
collectionDates: '.collection-list .date'
```

---

## Monitoring for Selector Drift

### Automated Drift Detection

The platform monitors for selector drift:

- **Synthetic checks** run hourly against each adapter
- **Parse warnings** are logged when adapters return empty results
- **Schema drift alerts** trigger when confidence drops below 0.7

### Manual Review Triggers

Perform manual review when:

- Adapter returns 0 events for a known-good postcode
- Confidence score drops below 0.7
- Multiple parse warnings logged in 24 hours
- Council announces website changes

---

## Validation Schedule

| Frequency | Action |
|-----------|--------|
| **Daily** | Automated synthetic checks |
| **Weekly** | Review drift alerts |
| **Monthly** | Spot-check 2-3 random adapters |
| **Quarterly** | Full validation of all 11 adapters |
| **On-Demand** | Validate when council website changes |

---

## Troubleshooting

### Selector returns empty array

**Symptom:** `$$('.selector')` returns `[]`

**Causes:**
- Selector is incorrect
- Element hasn't loaded yet (wait for it)
- Page structure changed

**Fix:**
1. Inspect the page HTML
2. Find the correct element
3. Update selector

### Selector returns too many elements

**Symptom:** `$$('.selector')` returns 10 items instead of 3

**Causes:**
- Selector too broad
- Matches unintended elements

**Fix:**
1. Make selector more specific
2. Add parent context: `.collection-list .date` instead of `.date`

### Adapter returns 0 events but page shows data

**Symptom:** Adapter succeeds but `data: []`

**Causes:**
- Selectors are wrong
- Parsing logic has bug
- Data is loaded via JavaScript (not in initial HTML)

**Fix:**
1. Check if data loads after page load (wait for it)
2. Use browser automation to wait for dynamic content
3. Update `waitForSelector()` timeout

---

## Contact

For selector validation help:

- **Naomi** (Backend Developer) - Adapter implementation
- **Holden** (Platform Architect) - Architecture questions
- **Amos** (Security Engineer) - Security concerns

---

## Appendix: Useful Browser DevTools Commands

### Test a selector

```javascript
// Returns array of elements
$$('.selector')

// Returns first element
$('.selector')

// Check if element exists
$$('.selector').length > 0
```

### Extract text from elements

```javascript
$$('.collection-date').map(el => el.textContent)
```

### Check element attributes

```javascript
$('#postcode-search').getAttribute('name')
```

### Wait for element to appear

```javascript
// Not available in DevTools Console - use in Playwright script
await page.waitForSelector('.collection-date', { timeout: 5000 })
```

---

**End of Guide**
