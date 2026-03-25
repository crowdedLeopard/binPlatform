# ADR-007: Overlapping Postcode Handling

**Status:** Accepted  
**Date:** 2026-03-25  
**Deciders:** Holden (Lead Architect), Naomi (Adapter Engineer)  
**Technical Story:** Property resolution must handle postcodes that map to multiple councils

---

## Context

Hampshire postcode coverage includes overlapping areas where a single postcode prefix maps to multiple councils:

### Identified Overlaps

1. **Hart & Rushmoor** — Share GU11, GU12, GU14
   - Hart covers: GU11, GU12, GU13, GU14, GU17, GU46, GU51, GU52
   - Rushmoor covers: GU9, GU10, GU11, GU12, GU14
   - **Overlap:** GU11, GU12, GU14 (3 prefixes)

2. **Test Valley & Eastleigh** — Share SO51
   - Test Valley covers: SP6, SP10, SP11, SO20, SO51
   - Eastleigh covers: SO50, SO51, SO52, SO53
   - **Overlap:** SO51 (1 prefix)

### Problem Statement

When a user provides postcode "GU11 1AA", the current first-match routing silently assigns them to either Hart or Rushmoor depending on map iteration order. This may result in:
- Wrong council data returned (property not found in wrong council's system)
- User confusion when results don't match their known council
- Poor user experience (silent failure mode)
- False negatives in address lookup

---

## Decision

**Implement ambiguous candidate resolution** — when a postcode matches multiple councils, return all matching candidates and surface the ambiguity to the caller.

### Implementation Approach

1. **Property Resolution Layer:**
   - `resolveCouncil(postcode)` already returns `string | string[]`
   - When array returned (multiple councils), query ALL matching adapters in parallel
   - Deduplicate results by UPRN or normalised address
   - If single property found (after dedup), auto-resolve
   - If multiple properties found, return candidates with council ID for each

2. **API Response Schema:**
   - Add `ambiguous_council` boolean flag to `AddressCandidateResult`
   - Include `council_id` field in each `AddressCandidate`
   - When ambiguous, `autoResolved: false` and `candidates[]` array includes council metadata

3. **Deduplication Logic:**
   - Prefer UPRN for deduplication (canonical property identifier)
   - Fall back to normalised address + postcode hash
   - If same UPRN found in multiple councils → single candidate with primary council
   - If different addresses → multiple candidates requiring user selection

4. **Council Priority (for edge cases):**
   - When deduplication is ambiguous, priority order:
     1. UPRN presence (council providing UPRN wins)
     2. API-based adapter over browser-based (higher confidence)
     3. Alphabetical council ID (deterministic tiebreaker)

---

## Example Flow

### User Input: `GU12 5AB` (Hart/Rushmoor overlap)

**Step 1:** Resolve council
```typescript
resolveCouncil('GU12 5AB') // Returns ['hart', 'rushmoor']
```

**Step 2:** Query both adapters in parallel
```typescript
Promise.all([
  hartAdapter.resolveAddresses({ postcode: 'GU12 5AB', correlationId: '...' }),
  rushmoorAdapter.resolveAddresses({ postcode: 'GU12 5AB', correlationId: '...' }),
])
```

**Step 3:** Deduplicate results
```typescript
// Hart returns: UPRN 100062345678, 1 High Street
// Rushmoor returns: UPRN 100062345678, 1 High Street
// SAME UPRN → Single candidate (property exists in both systems, same building)
```

**Step 4:** Auto-resolve
```typescript
{
  success: true,
  data: {
    propertyId: 'uuid-...',
    address: '1 High Street',
    postcode: 'GU12 5AB',
    councilId: 'hart',  // Priority: both returned UPRN, alphabetical
    uprn: '100062345678',
    autoResolved: true,
    ambiguous_council: false,  // Deduplication resolved ambiguity
  }
}
```

### Alternative: Different Addresses Found

**If Hart and Rushmoor return DIFFERENT addresses:**
```typescript
{
  success: true,
  data: {
    propertyId: '',  // Not yet resolved
    postcode: 'GU12 5AB',
    councilId: 'hart',  // First match as placeholder
    autoResolved: false,
    ambiguous_council: true,
    candidates: [
      {
        councilId: 'hart',
        uprn: '100062345678',
        addressDisplay: '1 High Street, Fleet, GU12 5AB',
        // ... other fields
      },
      {
        councilId: 'rushmoor',
        uprn: '100062999999',
        addressDisplay: '3 High Street, Aldershot, GU12 5AB',
        // ... other fields
      },
    ],
  }
}
```

**Frontend UX:**
- Display: "Multiple addresses found for GU12 5AB. Please select your property:"
- Show list with council name prominently displayed
- User selection submits `propertyId` or `councilLocalId` for final resolution

---

## Consequences

### Positive

- **Correctness:** No silent wrong-council routing
- **Transparency:** Users see when ambiguity exists
- **Better UX:** User selects their property instead of system guessing wrong
- **Audit Trail:** Logs show which councils were queried for overlap postcodes
- **Deduplication:** UPRN-based deduplication handles most overlaps cleanly

### Negative

- **Complexity:** API responses now have ambiguous state (clients must handle)
- **Performance:** Overlapping postcodes require 2 adapter calls instead of 1
- **Client Work:** Frontends must implement candidate selection UI
- **Edge Cases:** Deduplication logic may have corner cases (different UPRN formats, etc.)

### Neutral

- **Coverage Impact:** Only affects ~4 postcode prefixes (GU11, GU12, GU14, SO51)
- **Backward Compatibility:** New `ambiguous_council` flag is additive (optional for clients)

---

## Overlap Statistics

| Postcode | Councils | Estimated Households |
|---|---|---|
| GU11 | Hart, Rushmoor | ~8,000 |
| GU12 | Hart, Rushmoor | ~6,000 |
| GU14 | Hart, Rushmoor | ~9,000 |
| SO51 | Eastleigh, Test Valley | ~4,000 |
| **Total** | | **~27,000** (5% of Hampshire) |

**Note:** These are postcode _prefixes_. Full postcodes (e.g., GU11 1AA) may unambiguously fall within one council's boundary. Overlap exists at prefix level but may not at full postcode level in all cases.

---

## Implementation Checklist

- [x] Update `resolveCouncil()` to return `string | string[]` (already done)
- [x] Update `PropertyResolutionService` to handle array results (already done)
- [x] Add `ambiguous_council` flag to `AddressCandidateResult` schema
- [x] Add `councilId` field to individual `AddressCandidate` objects
- [ ] Update OpenAPI spec to document ambiguous responses
- [ ] Update API documentation with overlap examples
- [ ] Add integration tests for overlap postcodes
- [ ] Frontend: Implement candidate selection UI for ambiguous results
- [ ] Monitoring: Track overlap postcode query frequency
- [ ] Logging: Log overlap resolution outcomes for analysis

---

## Alternatives Considered

### Alternative 1: First-Match Wins (Rejected)
- **Approach:** Keep current behavior — first council in map wins
- **Rejected Because:**
  - Silent failures when user is in the "other" council
  - Poor user experience (mystery why property not found)
  - May violate user expectations (they know their council)

### Alternative 2: Geographic Boundary API (Deferred)
- **Approach:** Use OS Boundary-Line data or council boundary shapefiles to resolve postcodes to precise council
- **Deferred Because:**
  - Adds infrastructure dependency (geospatial database or API)
  - Postcode centroid may not match property location (large postcodes)
  - Adds complexity and latency
  - Current approach (query both, deduplicate) works for 95% of cases
  - **May revisit** if overlap issues become frequent after launch

### Alternative 3: User-Supplied Council ID (Rejected)
- **Approach:** Require users to specify their council upfront
- **Rejected Because:**
  - Poor UX (most users don't know council ID)
  - Defeats purpose of postcode-only lookup
  - Adds friction to common case (95% of postcodes are unambiguous)

---

## Monitoring & Success Criteria

### Metrics to Track
- Percentage of lookups that trigger overlap resolution
- Auto-resolution success rate after deduplication (target: >85%)
- User selection rate in ambiguous cases (target: <15% of lookups)
- False positive rate (wrong council selected by user)

### Success Criteria
- Zero silent wrong-council routing
- Ambiguous cases clearly surfaced to user
- >90% of overlap postcodes deduplicate to single result
- User feedback confirms correct council selection

---

## References

- Implementation: `src/core/property-resolution/postcode-utils.ts`
- Implementation: `src/core/property-resolution/index.ts`
- Overlap data source: `data/council-registry.json`
- Hart postcode coverage: `docs/discovery/hart-notes.md`
- Rushmoor postcode coverage: `docs/discovery/rushmoor-notes.md`

---

**Recommendation:** Implement ambiguous candidate resolution for Phase 3 Wave 2. Monitor overlap postcode metrics post-launch and revisit geographic boundary API if deduplication success rate is <85%.
