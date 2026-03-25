# Retention Policy Engine

**Owner:** Amos (Security Engineer)  
**Status:** Phase 3 — Implemented  
**Version:** 1.0  

---

## Overview

The retention policy engine enforces data minimisation and compliance with the data classification matrix. It automatically purges expired data based on configurable retention windows, with built-in safety features to prevent accidental deletion.

**Key features:**
- ✅ Configurable retention windows by data type
- ✅ Multiple purge strategies (hard-delete-blob, soft-delete-db, archive-then-delete)
- ✅ Safety window (7 days from cutoff) prevents accidental deletion
- ✅ Deployment grace period (24h dry-run mode)
- ✅ Batch processing (max 1000 records per run)
- ✅ Audit logging for every purge operation
- ✅ Cron-scheduled worker (daily at 2am)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Retention Policy Engine                    │
│                                                             │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   │
│  │ Data Scanner │   │ Data Scanner │   │ Data Scanner │   │
│  │  (Evidence)  │   │ (Database)   │   │  (Archives)  │   │
│  └──────────────┘   └──────────────┘   └──────────────┘   │
│         │                  │                  │            │
│         └──────────────────┼──────────────────┘            │
│                            │                               │
│                    ┌───────▼────────┐                      │
│                    │ Retention      │                      │
│                    │ Policy Engine  │                      │
│                    └───────┬────────┘                      │
│                            │                               │
│                    ┌───────▼────────┐                      │
│                    │ Retention      │                      │
│                    │ Worker (Cron)  │                      │
│                    └────────────────┘                      │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ Audit log every purge
                            │
                    ┌───────▼────────┐
                    │ Audit Logger   │
                    └────────────────┘
```

---

## Retention Policy

Retention windows by data type (from data classification matrix):

| Data Type | Retention | Purge Strategy | Description |
|-----------|-----------|----------------|-------------|
| `raw-evidence-html` | 90 days | `hard-delete-blob` | HTML pages from councils |
| `raw-evidence-json` | 90 days | `hard-delete-blob` | JSON/XHR responses |
| `raw-evidence-pdf` | 30 days | `hard-delete-blob` | PDF files |
| `raw-evidence-screenshot` | 7 days | `hard-delete-blob` | Browser screenshots |
| `normalised-collection` | 365 days | `soft-delete-db` | Collection schedules |
| `acquisition-attempt` | 90 days | `soft-delete-db` | Adapter attempt logs |
| `security-event` | 365 days | `archive-then-delete` | Security events |
| `audit-log` | 730 days | `archive-then-delete` | Audit logs (2yr compliance) |
| `user-input-log` | 30 days | `hard-delete-db` | Request logs |
| `api-key` | Active: ∞<br>Revoked: 90 days | `revoke-on-expiry` | API keys |

**Purge strategies:**
- **`hard-delete-blob`:** Delete from blob storage immediately (no recovery)
- **`soft-delete-db`:** Mark deleted in DB, hard delete after 7 days
- **`archive-then-delete`:** Archive to cold storage, then delete after retention period
- **`revoke-on-expiry`:** Revoke API key, delete after 90 days

---

## Safety Features

### 1. Safety Window (7 days)

Never purge data newer than `cutoff_date - 7 days`.

**Example:**
```
Retention policy: 90 days
Safety window: 7 days
Actual cutoff: 97 days ago

Data at day 91: NOT purged (within safety window)
Data at day 98: PURGED (outside safety window)
```

### 2. Deployment Grace Period (24 hours)

Automatically runs in dry-run mode for first 24 hours after deployment.

**Override:**
```typescript
await retentionEngine.executePurge({
  dryRun: false,
  force: true, // Override grace period
  batchSize: 1000,
});
```

### 3. Soft Delete (7-day reversible window)

Database records are soft-deleted (marked `deleted_at`) before hard deletion.

```sql
-- Soft delete
UPDATE normalised_collections
SET deleted_at = NOW(), deleted_reason = 'retention_policy'
WHERE created_at < cutoff_date AND deleted_at IS NULL;

-- Hard delete (7 days later)
DELETE FROM normalised_collections
WHERE deleted_at < NOW() - INTERVAL '7 days';
```

### 4. Batch Processing (max 1000 records)

Purges maximum 1000 records per run to prevent long locks.

### 5. Audit Logging

Every purge operation logged to audit trail BEFORE execution.

---

## Usage

### 1. Register Data Scanners

Implement `DataScanner` interface for each data type:

```typescript
import { DataScanner, ExpiredDataSet, PurgeExecutionResult } from './core/retention/policy';

class EvidenceBlobScanner implements DataScanner {
  async scanExpired(cutoffDate: Date): Promise<ExpiredDataSet> {
    // Query blob storage for expired blobs
    const expiredBlobs = await listExpiredEvidence();
    
    return {
      dataType: 'raw-evidence-html',
      recordCount: expiredBlobs.length,
      oldestRecord: expiredBlobs[0]?.expiresAt,
      newestRecord: expiredBlobs[expiredBlobs.length - 1]?.expiresAt,
      affectedCouncils: [...new Set(expiredBlobs.map(b => b.councilId))],
    };
  }
  
  async estimateStorageSize(expiredData: ExpiredDataSet): Promise<number> {
    // Sum up blob sizes
    return expiredBlobs.reduce((sum, blob) => sum + blob.sizeBytes, 0);
  }
  
  async purgeExpired(
    cutoffDate: Date,
    strategy: PurgeStrategy,
    dryRun: boolean,
    batchSize: number
  ): Promise<PurgeExecutionResult> {
    const results = await deleteExpiredEvidence(expiredBlobs, dryRun);
    
    return {
      purgedCount: results.filter(r => r.deleted).length,
      failedCount: results.filter(r => !r.deleted && !dryRun).length,
      bytesReclaimed: estimatedBytes,
      failures: results.filter(r => r.error).map(r => ({
        recordId: r.blobRef,
        error: r.error!,
      })),
    };
  }
}
```

### 2. Initialize Retention Engine

```typescript
import { RetentionPolicyEngine } from './core/retention/policy';
import { createRetentionWorker } from './workers/retention-worker';

// Register scanners for all data types
const scanners = new Map();
scanners.set('raw-evidence-html', new EvidenceBlobScanner('html'));
scanners.set('raw-evidence-json', new EvidenceBlobScanner('json'));
scanners.set('raw-evidence-pdf', new EvidenceBlobScanner('pdf'));
scanners.set('raw-evidence-screenshot', new EvidenceBlobScanner('screenshot'));
scanners.set('normalised-collection', new DatabaseTableScanner('collections'));
scanners.set('acquisition-attempt', new DatabaseTableScanner('acquisition_attempts'));
// ... etc

// Create retention engine
const retentionEngine = new RetentionPolicyEngine(scanners);

// Create and start retention worker
const retentionWorker = await createRetentionWorker(
  retentionEngine,
  startScheduler: true // Start cron scheduler
);
```

### 3. Manual Purge (Admin Trigger)

```typescript
// Trigger immediate purge (bypass cron schedule)
const result = await retentionWorker.run();

console.log(`Purged ${result.totalPurgedRecords} records`);
console.log(`Reclaimed ${result.totalPurgedBytes} bytes`);
console.log(`Failures: ${result.failures.length}`);
```

### 4. Check Worker Status

```typescript
const status = retentionWorker.getStatus();

console.log(`Worker running: ${status.isRunning}`);
console.log(`Last run: ${status.lastRunTimestamp}`);
console.log(`Last result: ${status.lastRunResult}`);
console.log(`Dry-run mode: ${status.config.dryRun}`);
console.log(`Grace period active: ${retentionWorker.isGracePeriodActive()}`);
```

---

## Configuration

### Environment Variables

```bash
# Dry-run mode (default: false)
RETENTION_DRY_RUN=true

# Batch size (default: 1000)
RETENTION_BATCH_SIZE=500

# Audit HMAC secret (default: insecure, MUST set in production)
AUDIT_HMAC_SECRET=your-secret-here

# Address hash pepper (default: insecure, MUST set in production)
ADDRESS_HASH_PEPPER=your-pepper-here
```

### Cron Schedule

Default: `'0 2 * * *'` (daily at 2am)

Override in code:
```typescript
import cron from 'node-cron';

const schedule = retentionEngine.getSchedule(); // '0 2 * * *'
cron.schedule(schedule, async () => {
  await retentionWorker.run();
});
```

---

## Admin API

### `POST /v1/admin/retention/purge-expired`

Trigger immediate purge (manual override).

**Request:**
```json
{
  "dryRun": false,
  "force": true,
  "batchSize": 1000,
  "dataTypes": ["raw-evidence-html", "raw-evidence-json"]
}
```

**Response:**
```json
{
  "purgeId": "purge-1711234567890",
  "startedAt": "2026-03-25T12:00:00Z",
  "completedAt": "2026-03-25T12:05:00Z",
  "dryRun": false,
  "totalPurgedRecords": 1000,
  "totalPurgedBytes": 52428800,
  "failureCount": 0
}
```

### `GET /v1/admin/retention/status`

Get retention worker status.

**Response:**
```json
{
  "isRunning": false,
  "lastRunTimestamp": "2026-03-25T02:00:00Z",
  "lastRunResult": {
    "purgeId": "purge-1711234567890",
    "dryRun": false,
    "totalPurgedRecords": 1000,
    "totalPurgedBytes": 52428800,
    "failureCount": 0
  },
  "config": {
    "dryRun": false,
    "batchSize": 1000,
    "schedule": "0 2 * * *"
  }
}
```

---

## Monitoring

### Audit Log Events

All purge operations logged to audit trail:

```json
{
  "eventType": "retention.purge.complete",
  "severity": "warning",
  "actor": { "type": "system" },
  "resource": { "type": "retention" },
  "action": "retention.purge.complete",
  "outcome": "success",
  "metadata": {
    "purgeId": "purge-1711234567890",
    "dryRun": false,
    "totalPurgedRecords": 1000,
    "totalPurgedBytes": 52428800,
    "failureCount": 0
  }
}
```

### Metrics to Monitor

- **Purge success rate:** `(purgedCount - failedCount) / purgedCount`
- **Purge frequency:** How often worker runs (should be daily)
- **Failure rate:** If >5%, creates incident
- **Storage reclaimed:** Bytes freed per purge
- **Grace period status:** Should be inactive after 24h

### Alerts

**Critical:**
- Purge failure rate >5% → Creates incident automatically
- Worker hasn't run in >48 hours → Manual alert
- Grace period still active after 48h → Manual alert

**Warning:**
- Purge failure rate >1%
- Worker run duration >10 minutes

---

## Testing

### 1. Dry-Run Mode

```bash
# Set dry-run mode
export RETENTION_DRY_RUN=true

# Run worker
node -e "require('./workers/retention-worker').retentionWorker.run()"

# Check logs (no actual deletion)
# [DRY RUN] Would delete evidence: blob-123
```

### 2. Manual Purge (Small Batch)

```typescript
// Test with small batch on non-production data
const result = await retentionEngine.executePurge({
  dryRun: false,
  batchSize: 10, // Small batch for testing
  dataTypes: ['raw-evidence-screenshot'], // Low-risk data type
});

console.log('Purged:', result.totalPurgedRecords);
```

### 3. Validate Audit Logs

```sql
-- Check audit logs for purge events
SELECT * FROM security_events
WHERE action LIKE 'retention.%'
ORDER BY created_at DESC
LIMIT 10;
```

---

## Troubleshooting

### Worker Not Running

**Symptom:** No purge events in last 48 hours.

**Check:**
```typescript
const status = retentionWorker.getStatus();
console.log(status.lastRunTimestamp); // Should be recent
```

**Possible causes:**
- Cron scheduler not started (`startScheduler: false`)
- Worker crashed (check error logs)
- Grace period still active (check `isGracePeriodActive()`)

**Fix:**
```typescript
// Manually trigger run
await retentionWorker.run();
```

---

### Purge Failures

**Symptom:** High failure rate (>5%).

**Check:**
```typescript
const result = await retentionWorker.getStatus();
console.log(result.lastRunResult.failures);
```

**Possible causes:**
- Blob storage permissions issue
- Database connection timeout
- Large blobs (timeout on delete)

**Fix:**
- Check blob storage credentials
- Increase batch size timeout
- Investigate specific failure errors

---

### Grace Period Won't Expire

**Symptom:** Worker still in dry-run mode after 24h.

**Check:**
```typescript
console.log(retentionWorker.isGracePeriodActive()); // Should be false
```

**Possible causes:**
- Deployment timestamp not set correctly
- Server clock skew

**Fix:**
```typescript
// Force purge (override grace period)
await retentionEngine.executePurge({
  dryRun: false,
  force: true,
  batchSize: 1000,
});
```

---

## Security Considerations

1. **Never purge security_events or audit_log without archiving first**
2. **Audit every deletion** (compliance requirement)
3. **Soft delete before hard delete** (reversible window)
4. **Safety window on all purges** (prevent accidental deletion)
5. **Dry-run mode by default** (validate before actual deletion)
6. **Batch processing** (prevent long locks)

---

## References

- Data Classification Matrix: `docs/threat-model/data-classification.md`
- Security Controls: `docs/threat-model/security-controls.md`
- Retention Policy Decisions: `.squad/decisions/inbox/amos-phase3-retention.md`
- Incident Triggers: `docs/threat-model/incident-triggers.md`

---

**Questions?** Contact Amos (Security Engineer) or Holden (API Lead)
