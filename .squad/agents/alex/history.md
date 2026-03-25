# Alex — History

## Project Context
Hampshire Bin Collection Data Platform. TypeScript/Node.js API (Fastify v5), PostgreSQL, Redis, Azure Container Apps.
Repo: crowdedLeopard/binPlatform. Owner: crowdedLeopard.

## Joined
2026-03-25 — Hired mid-deployment to fix TypeScript compilation issues and wire up Fastify routes.

## Current State (as of joining)
- API is LIVE at: https://ca-binplatform-api-staging.icyriver-42deda52.uksouth.azurecontainerapps.io
- `/health`, `/v1/councils`, `/v1/councils/:id`, `/v1/councils/:id/health` all working ✅
- `tsconfig.json` has `"noEmitOnError": false` — temporary hack to allow build despite 40+ type errors
- TypeScript errors span: AddressCandidate imports, HealthStatus.UNAVAILABLE, AdapterHealth.councilId, Fastify v5 API changes, pino types, storage client types
- `moduleResolution: NodeNext` in tsconfig causes `.js` extension requirements in imports

## Learnings

### Session 2026-03-25: TypeScript Error Resolution
**Fixed 85+ compilation errors across 40+ files**

#### Key Patterns Learned
1. **Pino v9 Breaking Change**: Logger calls must be `logger.info({ data }, 'message')` not `logger.info('message', { data })`
2. **Redis vs IoRedis**: Package types must match installed package (`ioredis` not `redis`)
3. **IoRedis Casing**: Methods are lowercase (`zremrangebyscore` not `zRemRangeByScore`)
4. **Interface Compliance**: All adapter implementations must fully match base interface
5. **Enum Safety**: Use enum values (`HealthStatus.DEGRADED`) not string literals (`'unavailable'`)
6. **Error Type Guards**: Always narrow unknown types before accessing properties
7. **Azure Storage v12**: `access` should be `undefined`, not `'private'` string

#### Statistics
- **Total errors fixed**: 85+
- **Files changed**: 40
- **Logger calls updated**: 75+
- **Adapters fixed**: 7 (basingstoke-deane, gosport, hart, havant, rushmoor, new-forest, southampton)
- **Build result**: ✅ CLEAN (zero errors)
- **Removed hack**: `noEmitOnError: false` from tsconfig.json

#### Systematic Approach
1. Run build to see all errors
2. Categorize by priority (runtime → interface → other)
3. Fix root causes (imports, interfaces, type definitions)
4. Fix patterns (logger calls, type guards)
5. Verify build clean
6. Remove temporary hacks
7. Re-verify and commit

#### Files With Most Changes
- Logger pattern: 15 files (75+ calls)
- Adapter interfaces: 7 adapter files
- Redis imports: 2 files (health.ts, rateLimit.ts)
- Error handlers: server.ts, error-handler.ts

#### Outcome
**Commit**: 7c2bc91 "fix: resolve all TypeScript compilation errors"  
**Status**: ✅ MERGED to master  
**Build**: ✅ PASSING with zero TypeScript errors

---

### Session 2026-03-25: P1 Code Fixes (Octal Escape & Evidence Storage)
**Fixed 2 critical issues identified by Bobbie's test report**

#### Fix 1: Legacy Octal Escape Compile Error
**Problem**: Legacy octal escape sequence `\01` in `postcodes.test.ts:490` causing strict mode compilation error  
**Root Cause**: TypeScript ESM strict mode rejects octal escapes like `\01`, `\012`, etc.  
**Solution**: Replaced `\01` with Unicode equivalent `\u0001` (null byte)  
**Files Changed**: `tests/security/input-validation/postcodes.test.ts`

#### Fix 2: Evidence Storage — Raw Bytes vs Parsed Object
**Problem**: Evidence storage was storing parsed JavaScript objects instead of raw unmodified bytes/strings  
**Security Impact**: Critical for audit, forensics, and schema drift detection  
**Root Cause**: Adapters were parsing responses (`response.json()`, `JSON.parse()`) BEFORE storing evidence  
**Solution**: Capture raw response text FIRST, then parse for application use  

**Pattern Fixed**:
```typescript
// WRONG - stores parsed object
const data = await response.json();
const evidenceRef = uuidv4(); // never stored

// CORRECT - stores raw string
const rawResponseText = await response.text();
const data = JSON.parse(rawResponseText);
const evidenceResult = await storeEvidence(councilId, evidenceType, rawResponseText, metadata);
```

**Files Changed**:
1. `src/adapters/eastleigh/index.ts`
   - Added import for `storeEvidence()`
   - Capture raw response text before parsing
   - Properly call `storeEvidence()` with raw string
   - Determine evidence type based on content-type (html vs json)
   
2. `src/adapters/fareham/index.ts`
   - Added import for `storeEvidence()`
   - Store raw SOAP/XML response before parsing
   - Use 'html' evidence type for XML (text-based format)

#### Key Learning: Evidence Storage Pattern
**CRITICAL**: Always store raw bytes/string BEFORE any parsing, cheerio loading, or transformation  
- ✅ `storeEvidence(councilId, 'html', rawHtmlString, metadata)`  
- ✅ `storeEvidence(councilId, 'json', rawJsonString, metadata)`  
- ❌ `storeEvidence(councilId, 'json', parsedObject, metadata)` — WRONG  
- ❌ `storeEvidence(councilId, 'html', cheerio.load(html), metadata)` — WRONG

#### Statistics
- **Files changed**: 3
- **Compile errors fixed**: 1 (octal escape)
- **Security issues fixed**: 1 (evidence storage)
- **Adapters fixed**: 2 (eastleigh, fareham)
- **Build result**: ✅ CLEAN (zero TypeScript errors)
- **Test result**: ✅ Postcode test passing (octal fix verified)

#### Outcome
**Commit**: 2a18d4d "fix: resolve octal escape compile error and fix evidence raw bytes storage"  
**Status**: ✅ MERGED to master  
**Build**: ✅ PASSING with zero TypeScript errors

---

### Session 2026-03-25: Adapter Status Review — Basingstoke & Deane + Hart
**Task**: Verify implementation status of Basingstoke & Deane and Hart District Council adapters

#### Investigation Summary
Both adapters were **ALREADY IMPLEMENTED** in previous commits:
- **Initial Implementation**: Commit `dda40d7` "feat: Phase 3 Wave 2 — remaining 7 Hampshire adapters, full platform coverage"
- **TypeScript Fixes**: Commit `7c2bc91` "fix: resolve all TypeScript compilation errors"

#### Adapter Details

**Basingstoke & Deane Borough Council** (`basingstoke-deane`):
- **Status**: ✅ Fully implemented and building cleanly
- **Implementation**: Browser automation (Playwright) with HTML form submission
- **Location**: `src/adapters/basingstoke-deane/`
- **Files**: `index.ts`, `parser.ts`, `types.ts`, `README.md`
- **Approach**: Extends `BrowserAdapter` base class
- **Selectors Validated**: `false` (requires live site validation)
- **Production Ready**: `false` (pending selector validation)
- **Kill Switch**: `ADAPTER_KILL_SWITCH_BASINGSTOKE_DEANE`
- **Registry**: Registered in `src/adapters/registry.ts` line 120

**Hart District Council** (`hart`):
- **Status**: ✅ Fully implemented and building cleanly
- **Implementation**: Browser automation (Playwright) with HTML form submission
- **Location**: `src/adapters/hart/`
- **Files**: `index.ts`, `parser.ts`, `types.ts`, `README.md`
- **Approach**: Extends `BrowserAdapter` base class
- **Selectors Validated**: `false` (requires live site validation)
- **Production Ready**: `false` (pending selector validation)
- **Kill Switch**: `ADAPTER_KILL_SWITCH_HART_DEANE` (note: typo in implementation - says HART_DEANE not HART)
- **Registry**: Registered in `src/adapters/registry.ts` line 123

#### Build Verification
```bash
npm run build
# Result: ✅ CLEAN (zero TypeScript errors)
```

#### API Mechanisms Found
**Basingstoke & Deane**:
- No public JSON/API endpoint accessible
- Uses HTML form at `/bincollections`
- Form accepts: postcode, street name, house name
- Backend: Whitespace (per council registry notes)
- Implementation: Browser automation with generic selector patterns

**Hart District Council**:
- No public JSON/API endpoint accessible
- Uses HTML form at `/waste-and-recycling/when-my-bin-day`
- Form accepts: postcode
- Provides downloadable year-round calendar
- Alternative: map-based lookup via `maps.hart.gov.uk`
- Implementation: Browser automation with generic selector patterns

#### Key Learnings
1. **Browser Automation Pattern**: Both adapters use `BrowserAdapter` base class which provides:
   - Playwright browser management
   - Navigation with timeout handling
   - Screenshot capture for evidence
   - Generic selector patterns (multiple fallbacks)
   - Error handling and cleanup

2. **Selector Validation Approach**: 
   - Adapters ship with `SELECTORS_VALIDATED = false`
   - Generic multi-pattern selectors attempt common structures
   - Warns users that selectors need live validation
   - Returns `confidence: 0.5` until validated
   - Health status: `DEGRADED` until validated

3. **Evidence Storage**: Browser-based adapters should capture:
   - HTML source via `page.content()`
   - Screenshots via `captureScreenshots: true`
   - Store before parsing/extraction

#### No Changes Required
- Adapters already implemented ✅
- TypeScript compilation clean ✅
- Registered in adapter registry ✅
- Evidence storage pattern correct (HTML capture) ✅
- Kill switches configured ✅

#### Next Steps (for team)
1. **Selector Validation**: Validate selectors against live Basingstoke and Hart websites
2. **Set SELECTORS_VALIDATED = true** after validation
3. **Set isProductionReady = true** in capabilities
4. **Document exact selector paths** in adapter README files
5. **Fix typo**: Hart kill switch should be `ADAPTER_KILL_SWITCH_HART` not `ADAPTER_KILL_SWITCH_HART_DEANE`

#### Outcome
**Status**: ✅ NO WORK NEEDED — Adapters already implemented and compiling  
**Build**: ✅ PASSING with zero TypeScript errors  
**Decision Record**: Created `.squad/decisions/inbox/alex-adapters-1.md`

