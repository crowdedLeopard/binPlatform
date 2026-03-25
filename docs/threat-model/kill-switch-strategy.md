# Kill Switch Strategy — Hampshire Bin Collection Data Platform

**Version:** 1.0  
**Author:** Amos (Security Engineer)  
**Date:** 2026-03-25  

---

## Overview

Kill switches provide the ability to immediately disable a compromised, broken, or misbehaving component without affecting the rest of the platform. This document defines the kill switch architecture, implementation, and operational procedures.

**Core Principle:** Any adapter or feature can be disabled in under 60 seconds without deploying code.

---

## Kill Switch Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      KILL SWITCH CONTROL PLANE                      │
│                                                                     │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐ │
│   │ Admin UI     │───▶│ Kill Switch  │───▶│ Feature Flag Store   │ │
│   │              │    │ API          │    │ (Redis / DB)         │ │
│   └──────────────┘    └──────────────┘    └──────────────────────┘ │
│                                                    │                │
│   ┌──────────────┐                                 │                │
│   │ CLI Tool     │────────────────────────────────▶│                │
│   │ (break-glass)│                                 │                │
│   └──────────────┘                                 │                │
│                                                    │                │
└────────────────────────────────────────────────────┼────────────────┘
                                                     │
                                                     │ Real-time sync
                                                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         APPLICATION LAYER                           │
│                                                                     │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │
│   │   API Service   │  │ Adapter Worker  │  │ Scheduler       │   │
│   │                 │  │ Pool            │  │                 │   │
│   │   Checks kill   │  │   Checks kill   │  │   Checks kill   │   │
│   │   switch before │  │   switch before │  │   switch before │   │
│   │   serving       │  │   executing     │  │   dispatching   │   │
│   └─────────────────┘  └─────────────────┘  └─────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Kill Switch Types

### 1. Per-Adapter Kill Switch

Disables a single council adapter while all others continue operating.

**Use Cases:**
- Adapter returning bad data
- Council site is down or hostile
- Adapter consuming excessive resources
- Security concern with specific adapter

### 2. Global Adapter Kill Switch

Disables ALL adapters simultaneously.

**Use Cases:**
- Platform-wide security incident
- Upstream dependency compromise
- Emergency maintenance
- Excessive council load concerns

### 3. Feature Kill Switches

Disables specific platform features.

**Examples:**
- `kill:api:address-resolution` — Disable expensive address lookups
- `kill:api:unauthenticated` — Disable all unauthenticated access
- `kill:cache:bypass` — Force cache-only responses
- `kill:evidence:storage` — Disable evidence capture
- `kill:browser:automation` — Disable all Playwright adapters

### 4. Emergency Platform Kill Switch

Puts entire platform in maintenance mode.

**Use Cases:**
- Active breach
- Complete system compromise
- Legal requirement to stop processing

---

## Kill Switch Data Model

```sql
-- Kill switch state table
CREATE TABLE kill_switches (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('adapter', 'feature', 'global', 'emergency')),
    enabled BOOLEAN DEFAULT FALSE,
    enabled_at TIMESTAMP WITH TIME ZONE,
    enabled_by VARCHAR(255),
    reason TEXT,
    auto_disable_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Audit log for kill switch changes
CREATE TABLE kill_switch_audit (
    id SERIAL PRIMARY KEY,
    kill_switch_id VARCHAR(100) NOT NULL,
    action VARCHAR(20) NOT NULL CHECK (action IN ('enabled', 'disabled', 'extended', 'created')),
    performed_by VARCHAR(255) NOT NULL,
    performed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reason TEXT,
    previous_state JSONB,
    new_state JSONB
);

-- Indexes
CREATE INDEX idx_kill_switches_enabled ON kill_switches(enabled) WHERE enabled = TRUE;
CREATE INDEX idx_kill_switch_audit_switch ON kill_switch_audit(kill_switch_id);
CREATE INDEX idx_kill_switch_audit_time ON kill_switch_audit(performed_at);
```

---

## Kill Switch State Storage

**Primary Storage:** PostgreSQL (kill_switches table)
- Source of truth for kill switch state
- Audit logging
- Survives Redis restart

**Cache Layer:** Redis
- Real-time distribution to all services
- TTL-based refresh from database
- Pattern: `killswitch:{switch_id}` with value `enabled|disabled`

**Sync Pattern:**
1. Admin changes state in database
2. Database trigger publishes to Redis pub/sub
3. Services subscribe to updates
4. Services also poll database every 60 seconds (backup)

```typescript
// Example: Kill switch check in adapter
async function checkKillSwitch(adapterId: string): Promise<boolean> {
  // Check Redis first (fast path)
  const cached = await redis.get(`killswitch:adapter:${adapterId}`);
  if (cached !== null) {
    return cached === 'enabled';
  }
  
  // Fallback to database
  const result = await db.query(
    'SELECT enabled FROM kill_switches WHERE id = $1',
    [`adapter:${adapterId}`]
  );
  
  // Cache result
  const enabled = result.rows[0]?.enabled ?? false;
  await redis.setex(`killswitch:adapter:${adapterId}`, 60, enabled ? 'enabled' : 'disabled');
  
  return enabled;
}
```

---

## Per-Adapter Kill Switch Procedures

### Disabling a Single Adapter

**Who Can Trigger:** Admin role, Security team, On-call engineer

**Procedure:**

1. **Via Admin UI:**
   ```
   Dashboard → Adapters → [Adapter Name] → Kill Switch → Enable
   Enter reason: "Returning malformed data"
   Confirm
   ```

2. **Via CLI (break-glass):**
   ```bash
   binday-admin kill-switch enable --adapter basingstoke-deane \
     --reason "Suspicious redirect to external domain" \
     --duration 24h
   ```

3. **Via API:**
   ```bash
   curl -X POST https://admin.internal/api/v1/kill-switches/adapter:basingstoke-deane/enable \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -d '{"reason": "Emergency disable", "duration": "24h"}'
   ```

**Immediate Effects:**
- Adapter scheduler stops dispatching jobs
- Running adapter jobs complete but results are discarded
- API requests for this council return cached data or "temporarily unavailable"
- Alert sent to #security and #ops channels

**Timeline:**
- Kill switch takes effect: < 10 seconds
- Last running job completes: < 5 minutes
- Full disable confirmation: logged in audit

### Disabling All Adapters

**Who Can Trigger:** Admin role with elevated privileges, Security team

**Procedure:**
```bash
binday-admin kill-switch enable --global-adapters \
  --reason "Platform-wide security incident" \
  --notify security,engineering
```

**Immediate Effects:**
- All adapter scheduling stops
- All running jobs complete but results discarded
- API serves cached data only
- No upstream council requests

---

## Re-enabling After Investigation

### Pre-Requisites for Re-enablement

1. Root cause identified
2. Fix implemented (if code issue)
3. Security review completed (if security issue)
4. Test run successful
5. Approval from appropriate role

### Re-enablement Procedure

**Step 1: Verify Fix**
```bash
# Run adapter in test mode (doesn't store results)
binday-admin adapter test --adapter basingstoke-deane --dry-run
```

**Step 2: Re-enable with Monitoring**
```bash
binday-admin kill-switch disable --adapter basingstoke-deane \
  --reason "Issue resolved - ref INCIDENT-2026-03-25-001" \
  --monitor-for 1h
```

**Step 3: Monitor**
- Watch adapter logs for 1 hour
- Verify data quality
- Check for recurrence of original issue

### Gradual Re-enablement

For major incidents, re-enable gradually:

1. Enable one adapter as canary
2. Monitor for 30 minutes
3. Enable 3 more adapters
4. Monitor for 30 minutes
5. Enable remaining adapters

---

## State Preservation During Disablement

When an adapter is killed, the following state is preserved:

### Preserved
- Last successful run timestamp
- Last successful data
- Evidence files (retained per policy)
- Configuration
- Audit logs
- Error history

### Discarded
- In-flight job results (marked as aborted)
- Pending scheduled runs (re-scheduled on re-enable)
- Cache entries for adapter (cleared)

### State Schema

```typescript
interface AdapterState {
  adapterId: string;
  status: 'active' | 'killed' | 'maintenance';
  lastSuccessfulRun: Date | null;
  lastSuccessfulDataHash: string | null;
  killedAt: Date | null;
  killedBy: string | null;
  killReason: string | null;
  scheduledReEnableAt: Date | null;
  preservedConfig: AdapterConfig;
}
```

---

## Kill Switch Access Control

### Who Can Enable Kill Switches

| Kill Switch Type | Admin | Security | On-Call | Developer |
|------------------|-------|----------|---------|-----------|
| Single Adapter | ✅ | ✅ | ✅ | ❌ |
| Global Adapters | ✅ | ✅ | ✅* | ❌ |
| Feature (non-critical) | ✅ | ✅ | ❌ | ❌ |
| Feature (critical) | ✅** | ✅ | ❌ | ❌ |
| Emergency Platform | ✅** | ✅** | ❌ | ❌ |

*Requires incident reference
**Requires dual approval

### Who Can Disable Kill Switches

| Kill Switch Type | Admin | Security | On-Call | Developer |
|------------------|-------|----------|---------|-----------|
| Single Adapter | ✅ | ✅ | ✅* | ❌ |
| Global Adapters | ✅ | ✅ | ❌ | ❌ |
| Feature | ✅ | ✅ | ❌ | ❌ |
| Emergency Platform | ✅** | ✅** | ❌ | ❌ |

*If incident owner
**Requires dual approval + post-mortem scheduled

---

## Break-Glass Procedures

For emergencies when normal access is unavailable:

### Break-Glass Kill Switch Activation

**Prerequisites:**
- Two team members agree action is needed
- Normal admin access is unavailable
- Active security incident

**Procedure:**

1. **Access break-glass credentials**
   - Location: Physical safe / secure password manager (emergency compartment)
   - Two-person rule: requires two people to access

2. **Connect to management network**
   ```bash
   # VPN to management network
   vpn-connect --profile break-glass
   ```

3. **Execute kill switch**
   ```bash
   # Direct database update (bypass application layer)
   psql $BREAK_GLASS_DB_URL -c "
     UPDATE kill_switches 
     SET enabled = true, 
         enabled_at = NOW(), 
         enabled_by = 'BREAK-GLASS: user1+user2',
         reason = 'Emergency: [description]'
     WHERE type = 'emergency';
   "
   ```

4. **Notify**
   - Email: all-engineering@company.com
   - Slack: #incident-emergency (if available)
   - Phone tree: security lead → engineering lead → management

5. **Document**
   - Create incident ticket immediately
   - Log break-glass access
   - Schedule post-mortem

### Break-Glass Re-enablement

Re-enabling after break-glass requires:
1. Incident resolution
2. Post-mortem scheduled
3. Dual approval from Security + Engineering leads
4. Change credential used for break-glass access

---

## Monitoring and Alerting

### Kill Switch Status Dashboard

```
╔════════════════════════════════════════════════════════════════╗
║                    KILL SWITCH STATUS                          ║
╠════════════════════════════════════════════════════════════════╣
║ Emergency Platform    [ INACTIVE ]  🟢                         ║
║ Global Adapters       [ INACTIVE ]  🟢                         ║
║                                                                 ║
║ Per-Adapter Status:                                            ║
║   basingstoke-deane   [ ACTIVE   ]  🔴  Killed 2h ago by amos ║
║   east-hampshire      [ INACTIVE ]  🟢                         ║
║   eastleigh           [ INACTIVE ]  🟢                         ║
║   fareham             [ INACTIVE ]  🟢                         ║
║   gosport             [ INACTIVE ]  🟢                         ║
║   hart                [ INACTIVE ]  🟢                         ║
║   havant              [ INACTIVE ]  🟢                         ║
║   new-forest          [ INACTIVE ]  🟢                         ║
║   portsmouth          [ INACTIVE ]  🟢                         ║
║   rushmoor            [ INACTIVE ]  🟢                         ║
║   southampton         [ INACTIVE ]  🟢                         ║
║   test-valley         [ INACTIVE ]  🟢                         ║
║   winchester          [ INACTIVE ]  🟢                         ║
║                                                                 ║
║ Feature Flags:                                                  ║
║   api:address-resolution  [ ACTIVE ]  🟢                       ║
║   api:unauthenticated     [ ACTIVE ]  🟢                       ║
║   cache:bypass            [ INACTIVE ] 🔴 (cache-only mode)   ║
╚════════════════════════════════════════════════════════════════╝
```

### Alerts

| Event | Alert Level | Channel |
|-------|-------------|---------|
| Any kill switch enabled | Warning | #ops, #security |
| Global kill switch enabled | Critical | #ops, #security, PagerDuty |
| Emergency kill switch enabled | Critical | All channels, phone tree |
| Kill switch enabled > 24h | Info | #ops |
| Kill switch auto-disabled | Info | #ops |
| Break-glass access used | Critical | All channels |

---

## Kill Switch API Reference

### List All Kill Switches

```http
GET /api/v1/kill-switches
Authorization: Bearer {token}

Response:
{
  "killSwitches": [
    {
      "id": "adapter:basingstoke-deane",
      "name": "Basingstoke and Deane Adapter",
      "type": "adapter",
      "enabled": true,
      "enabledAt": "2026-03-25T10:30:00Z",
      "enabledBy": "amos@company.com",
      "reason": "Suspicious redirect detected",
      "autoDisableAt": "2026-03-26T10:30:00Z"
    }
  ]
}
```

### Enable Kill Switch

```http
POST /api/v1/kill-switches/{id}/enable
Authorization: Bearer {token}
Content-Type: application/json

{
  "reason": "Security incident - see INCIDENT-2026-03-25-001",
  "duration": "24h",
  "notify": ["security", "engineering"]
}

Response:
{
  "success": true,
  "killSwitch": {
    "id": "adapter:basingstoke-deane",
    "enabled": true,
    "enabledAt": "2026-03-25T10:30:00Z",
    "autoDisableAt": "2026-03-26T10:30:00Z"
  }
}
```

### Disable Kill Switch

```http
POST /api/v1/kill-switches/{id}/disable
Authorization: Bearer {token}
Content-Type: application/json

{
  "reason": "Issue resolved - root cause was X",
  "incidentRef": "INCIDENT-2026-03-25-001",
  "monitorFor": "1h"
}

Response:
{
  "success": true,
  "monitoring": true,
  "monitorUntil": "2026-03-25T11:30:00Z"
}
```

### Get Kill Switch Audit Log

```http
GET /api/v1/kill-switches/{id}/audit
Authorization: Bearer {token}

Response:
{
  "auditLog": [
    {
      "action": "enabled",
      "performedBy": "amos@company.com",
      "performedAt": "2026-03-25T10:30:00Z",
      "reason": "Suspicious redirect detected"
    },
    {
      "action": "disabled",
      "performedBy": "naomi@company.com",
      "performedAt": "2026-03-25T14:00:00Z",
      "reason": "Issue resolved"
    }
  ]
}
```

---

## Testing Kill Switches

### Regular Testing Schedule

| Test | Frequency | Owner |
|------|-----------|-------|
| Enable/disable single adapter | Monthly | Naomi |
| Global adapter kill switch | Quarterly | Drummer |
| Feature kill switches | Monthly | Holden |
| Emergency kill switch (drill) | Annually | Amos |
| Break-glass procedure (drill) | Annually | Amos |

### Test Procedure

1. Schedule test during low-traffic window
2. Notify team of planned test
3. Enable kill switch
4. Verify expected behaviour:
   - Adapter stops/feature disabled
   - API returns appropriate responses
   - Alerts fire correctly
   - Audit log captured
5. Disable kill switch
6. Verify recovery:
   - Adapter resumes
   - Data integrity maintained
7. Document test results

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-25 | Amos | Initial kill switch strategy |
