# ADR-005: Property Identity Model — Layered UPRN Resolution

**Status:** Proposed  
**Date:** 2026-03-25  
**Author:** Holden (Lead Architect)  
**Deciders:** Project Team

## Context

The platform must identify properties (households) to retrieve their bin collection schedules. Property identity is complex because:

1. **UPRN (Unique Property Reference Number)** is the UK gold standard, but:
   - Not all councils expose UPRN in their APIs
   - Some councils use internal IDs
   - UPRN lookup services require licensing

2. **Addresses are messy:**
   - "Flat 2, 15 High Street" vs "15 High Street Flat 2"
   - "1A" vs "1a" vs "1 A"
   - Postcodes can map to multiple addresses

3. **Data consistency matters:**
   - Same property must get same collections across adapter versions
   - Cross-council consistency (property on boundary)

## Options Considered

### Option A: UPRN-Only

**Description:** Require UPRN for all property lookups.

**Pros:**
- Single canonical identifier
- No ambiguity

**Cons:**
- Many councils don't expose UPRN
- UPRN lookup services have licensing costs
- Breaks for councils without UPRN support

### Option B: Council-Local IDs Only

**Description:** Each council adapter uses whatever ID the council uses.

**Pros:**
- Works with any council API
- No external dependencies

**Cons:**
- IDs not portable across councils
- IDs may change when council updates systems
- No cross-referencing

### Option C: Layered Resolution with UPRN as Canonical

**Description:** Use a resolution hierarchy:
1. UPRN (if known)
2. Council local ID
3. Normalised address hash
4. Postcode + user selection

**Pros:**
- Flexibility: works with any council
- UPRN as canonical when available
- Fallback for councils without UPRN
- Address normalisation reduces ambiguity

**Cons:**
- More complex resolution logic
- Address normalisation is imperfect
- Potential for duplicate properties

### Option D: External Address API as Source of Truth

**Description:** Use Ordnance Survey or AddressBase as canonical.

**Pros:**
- Official UK address database
- UPRN included

**Cons:**
- Licensing costs (~£thousands/year)
- API dependency for every lookup
- Overkill for bin schedules

## Decision

**Option C: Layered Resolution with UPRN as Canonical**

```
┌─────────────────────────────────────────────────────────────┐
│                Property Identity Resolution                   │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  User Input: Postcode (e.g., "SO23 8QT")                     │
│       │                                                       │
│       ▼                                                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 1. Council Adapter: Address Lookup                     │   │
│  │    - Returns list of AddressCandidates                 │   │
│  │    - Each candidate has: address, councilLocalId,      │   │
│  │      uprn (if available)                               │   │
│  └──────────────────────────────────────────────────────┘   │
│       │                                                       │
│       ▼                                                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 2. Property Resolution Service                         │   │
│  │    - Lookup by UPRN (if present) → existing property   │   │
│  │    - Lookup by councilLocalId → existing property      │   │
│  │    - Lookup by normalised address → existing property  │   │
│  │    - If no match: create new property record           │   │
│  └──────────────────────────────────────────────────────┘   │
│       │                                                       │
│       ▼                                                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 3. Property Record (canonical)                         │   │
│  │    - id: UUID (internal, stable)                       │   │
│  │    - uprn: string | null                               │   │
│  │    - councilLocalIds: { councilId: localId }[]         │   │
│  │    - addressNormalised: string                         │   │
│  │    - addressDisplay: string                            │   │
│  │    - postcode: string                                  │   │
│  │    - councilId: string                                 │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Rationale

### Layered Resolution Hierarchy

| Priority | Identifier | Source | Stability |
|----------|-----------|--------|-----------|
| 1 | UPRN | Council API or OS lookup | High (national standard) |
| 2 | Council Local ID | Council API | Medium (council-specific) |
| 3 | Normalised Address | Computed | Medium (normalisation rules) |
| 4 | Postcode + Selection | User choice | Low (user-dependent) |

### UPRN as Canonical (When Available)

1. **National Standard** — UPRN is the official UK property identifier.
2. **Cross-Council** — Same UPRN in different council systems.
3. **Stable** — UPRNs don't change when councils update websites.
4. **Future-Proof** — If we add Ordnance Survey integration later, UPRN matches.

### Council Local ID for Fallback

1. **Always Available** — Every council has some internal ID.
2. **Required for API Calls** — We need the local ID to fetch collection data.
3. **Stored as Mapping** — `{ councilId: 'basingstoke', localId: '12345' }`

### Address Normalisation

```typescript
function normaliseAddress(address: string): string {
  return address
    .toUpperCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ')     // Collapse whitespace
    .replace(/\bFLAT\b/g, 'FL')
    .replace(/\bAPARTMENT\b/g, 'FL')
    .replace(/\bROAD\b/g, 'RD')
    .replace(/\bSTREET\b/g, 'ST')
    .replace(/\bAVENUE\b/g, 'AVE')
    // ... more normalisation rules
    .trim();
}
```

Normalised address is used for fuzzy matching when UPRN/localId not matched.

### Property Record Schema

```typescript
interface Property {
  // Internal stable identifier
  id: string; // UUID
  
  // Canonical identifier (if known)
  uprn: string | null;
  
  // Per-council local identifiers
  councilLocalIds: Array<{
    councilId: string;
    localId: string;
    lastVerified: Date;
  }>;
  
  // Address data
  addressDisplay: string;      // "Flat 2, 15 High Street"
  addressNormalised: string;   // "FL 2 15 HIGH ST"
  postcode: string;            // "SO23 8QT"
  
  // Ownership
  councilId: string;           // Primary council
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  lastCollectionFetch: Date | null;
}
```

## Security Implications

### Data Sensitivity

| Field | Classification | Rationale |
|-------|---------------|-----------|
| id | Internal | Internal reference only |
| uprn | Public | Published by Ordnance Survey |
| councilLocalIds | Internal | May reveal council data structure |
| addressDisplay | Internal | Personal data (property address) |
| addressNormalised | Internal | Derived from personal data |
| postcode | Public | Publicly known |

### Privacy Considerations

1. **Address Data is Personal Data** — Under UK GDPR, property addresses may identify individuals. Store appropriately.

2. **Retention** — Property records retained while actively used. Archival after 2 years of no access.

3. **Access Control** — API returns property data only for lookups. No bulk export.

4. **Logging** — Do not log full addresses in application logs. Log property ID only.

### Security Controls

| Control | Implementation |
|---------|----------------|
| Input validation | Postcode format validation (UK postcodes) |
| Rate limiting | Max 10 address lookups per IP per minute |
| Query limits | Max 100 addresses returned per postcode |
| Normalisation | Server-side only (don't trust client normalisation) |
| Audit | Log property lookups for abuse detection |

### Attack Vectors

| Attack | Mitigation |
|--------|------------|
| Address enumeration | Rate limiting; require postcode first |
| Property ID guessing | UUIDs are unguessable; no sequential IDs |
| Postcode harvesting | Rate limiting; no bulk postcode endpoint |
| Address injection | Zod validation; normalisation strips special chars |

## Consequences

### Positive

- Flexible resolution works with any council API
- UPRN provides canonical identity when available
- Council local IDs ensure adapter compatibility
- Address normalisation reduces duplicate properties
- Clear data sensitivity classification

### Negative

- Resolution logic is complex
- Potential for duplicate properties if normalisation fails
- UPRN coverage is inconsistent across councils
- Address normalisation rules need maintenance

### Neutral

- Standard pattern for UK address handling
- Ordnance Survey integration possible later (UPRN as key)
- Property merging tool may be needed for deduplication
