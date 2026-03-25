# Synthetic Monitoring Design

**Version:** 1.0  
**Author:** Bobbie (QA Engineer)  
**Date:** 2026-03-25  
**Status:** Phase 3 Design

---

## Purpose

Proactively detect adapter failures before users notice. Synthetic monitoring uses automated health checks, canary acquisitions, and trend analysis to identify degradation early.

---

## Check Types

### 1. Adapter Liveness Probe

**Frequency:** Every 5 minutes per active adapter

**Method:** Call `adapter.verifyHealth()`

**Expected Result:**
- Response time < 5 seconds
- Status: `healthy` or `degraded`
- Upstream reachable: `true`

**On Failure:**
- Emit `AdapterHealth` audit event with status `unhealthy`
- Increment adapter failure counter in metrics store
- After 3 consecutive failures: mark adapter `degraded`, send notification

**Implementation:**
```typescript
async function adapterLivenessProbe(adapterId: string): Promise<void> {
  const adapter = adapterRegistry.get(adapterId);
  const startTime = Date.now();
  
  try {
    const health = await adapter.verifyHealth();
    const duration = Date.now() - startTime;
    
    if (duration > 5000) {
      await auditLogger.log({
        event: 'LIVENESS_PROBE_SLOW',
        adapterId,
        duration,
        severity: 'warning',
      });
    }
    
    if (health.status !== 'healthy') {
      await handleUnhealthyAdapter(adapterId, health);
    }
    
    await metricsStore.recordProbe(adapterId, {
      status: health.status,
      duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    await handleProbeFailure(adapterId, error);
  }
}
```

**Alert Routing:**
- 1st failure: Log only
- 2nd consecutive failure: Increment counter, log warning
- 3rd consecutive failure: Mark degraded, notify on-call
- Upstream unreachable: Immediate notification

---

### 2. Data Freshness Probe

**Frequency:** Every 30 minutes per active adapter

**Method:** Check Redis cache age for a known test postcode per council

**Expected Result:**
- Data exists in cache
- Age no older than cache TTL (7 days for collections)
- Confidence score > 0.6

**On Stale:**
- Trigger background re-acquisition for test postcode
- Log `DATA_FRESHNESS_STALE` event
- If re-acquisition fails, escalate to liveness probe logic

**Implementation:**
```typescript
async function dataFreshnessProbe(adapterId: string): Promise<void> {
  const testPostcode = councilRegistry.getTestPostcode(adapterId);
  const cacheKey = `collections:${adapterId}:${testPostcode}`;
  
  const cachedData = await cache.get(cacheKey);
  
  if (!cachedData) {
    await auditLogger.log({
      event: 'DATA_FRESHNESS_MISS',
      adapterId,
      testPostcode,
      severity: 'warning',
    });
    
    // Trigger background acquisition
    await acquisitionQueue.add('refresh', {
      adapterId,
      postcode: testPostcode,
      priority: 'low',
      isSynthetic: true,
    });
    return;
  }
  
  const ageHours = (Date.now() - new Date(cachedData.acquiredAt).getTime()) / (1000 * 60 * 60);
  const ttlHours = 7 * 24; // 7 days
  
  if (ageHours > ttlHours * 0.9) {
    await auditLogger.log({
      event: 'DATA_FRESHNESS_STALE',
      adapterId,
      ageHours,
      severity: 'info',
    });
    
    // Proactive refresh before expiry
    await acquisitionQueue.add('refresh', {
      adapterId,
      postcode: testPostcode,
      priority: 'low',
      isSynthetic: true,
    });
  }
}
```

**Test Postcodes per Council:**
- Eastleigh: `SO50 5LA` (known UPRN: 100060321174)
- Fareham: `PO16 7AW` (known UPRN: TBD)
- East Hampshire: `GU30 7AA` (area: round_1)
- Rushmoor: `GU11 1AA` (known address: TBD)

---

### 3. Full Acquisition Canary

**Frequency:** Every 2 hours per active adapter

**Method:** Run full acquisition for a known test UPRN/postcode (synthetic, non-production)

**Expected Result:**
- `CollectionEventResult` with `success: true`
- Confidence score > 0.6
- Response time within adapter's 95th percentile (tracked)
- At least 1 collection event returned (for councils with active collections)

**On Failure:**
- Emit `SYNTHETIC_CHECK_FAILED` audit event
- Increment failure counter
- After 2 consecutive failures: trigger incident alert
- If upstream error: do NOT count as adapter failure (distinguish from adapter bug)

**Implementation:**
```typescript
async function fullAcquisitionCanary(adapterId: string): Promise<void> {
  const testConfig = councilRegistry.getCanaryConfig(adapterId);
  const adapter = adapterRegistry.get(adapterId);
  
  const startTime = Date.now();
  
  try {
    const result = await adapter.getCollectionEvents(
      {
        councilLocalId: testConfig.councilLocalId,
        uprn: testConfig.uprn,
        address: testConfig.address,
        postcode: testConfig.postcode,
        correlationId: `canary-${adapterId}-${Date.now()}`,
      },
      {
        from: new Date().toISOString(),
        to: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days
      }
    );
    
    const duration = Date.now() - startTime;
    
    if (!result.success) {
      await handleCanaryFailure(adapterId, result);
      return;
    }
    
    if (result.confidence < 0.6) {
      await auditLogger.log({
        event: 'CANARY_LOW_CONFIDENCE',
        adapterId,
        confidence: result.confidence,
        severity: 'warning',
      });
    }
    
    await metricsStore.recordCanary(adapterId, {
      success: true,
      confidence: result.confidence,
      duration,
      eventCount: result.data?.length || 0,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    await handleCanaryException(adapterId, error);
  }
}
```

**Canary Postcode/UPRN per Council:**
- Document in council registry (`src/core/council-registry.ts`)
- Use real but non-sensitive test properties
- Rotate quarterly to avoid upstream detection

---

### 4. Confidence Trend Monitor

**Frequency:** Every hour

**Method:** Compare current average confidence to 7-day rolling average

**Expected Result:**
- Current average within 10% of rolling average
- No sudden drops (>20% in 1 hour)

**On Significant Drop:**
- Emit `CONFIDENCE_DEGRADATION` alert
- Include affected adapter IDs
- Investigate upstream changes or adapter drift

**Implementation:**
```typescript
async function confidenceTrendMonitor(): Promise<void> {
  const adapters = adapterRegistry.getAllActive();
  
  for (const adapterId of adapters) {
    const currentAvg = await metricsStore.getAvgConfidence(adapterId, {
      period: '1h',
    });
    
    const rollingAvg = await metricsStore.getAvgConfidence(adapterId, {
      period: '7d',
    });
    
    const percentageChange = ((currentAvg - rollingAvg) / rollingAvg) * 100;
    
    if (percentageChange < -20) {
      await auditLogger.log({
        event: 'CONFIDENCE_DEGRADATION',
        adapterId,
        currentAvg,
        rollingAvg,
        percentageChange,
        severity: 'critical',
      });
      
      await notificationService.alert({
        channel: 'pagerduty',
        severity: 'high',
        message: `Confidence drop detected for ${adapterId}: ${percentageChange.toFixed(1)}%`,
        metadata: {
          currentAvg,
          rollingAvg,
        },
      });
    } else if (percentageChange < -10) {
      await auditLogger.log({
        event: 'CONFIDENCE_DRIFT',
        adapterId,
        currentAvg,
        rollingAvg,
        percentageChange,
        severity: 'warning',
      });
    }
  }
}
```

---

## Alert Routing

### Status: `degraded`
- **Action:** Log + increment failure counter
- **Notification:** None (handled internally)
- **Escalation:** After 3 consecutive: notify on-call

### Status: `unhealthy`
- **Action:** Log + disable adapter (kill switch)
- **Notification:** Immediate Slack notification to #binday-alerts
- **Escalation:** Page on-call if not resolved in 15 minutes

### Security Event
- **Action:** Always route to audit log (immutable)
- **Notification:** Immediate Slack notification to #binday-security
- **Escalation:** Email security team (Amos)

### Confidence Degradation (>20% drop)
- **Action:** Log + investigate drift detection
- **Notification:** Slack notification to #binday-alerts
- **Escalation:** Create incident in PagerDuty

---

## Synthetic Check Worker Implementation

**File:** `src/workers/synthetic-monitor.ts`

```typescript
import { Worker, Job } from 'bullmq';
import { adapterRegistry } from '../core/adapter-registry';
import { councilRegistry } from '../core/council-registry';
import { auditLogger } from '../core/audit-logger';
import { metricsStore } from '../core/metrics-store';
import { notificationService } from '../services/notification';

export class SyntheticMonitorWorker {
  private worker: Worker;
  
  constructor() {
    this.worker = new Worker(
      'synthetic-checks',
      async (job: Job) => {
        await this.processJob(job);
      },
      {
        connection: {
          host: process.env.REDIS_HOST,
          port: parseInt(process.env.REDIS_PORT || '6379'),
        },
        concurrency: 5,
      }
    );
  }
  
  private async processJob(job: Job): Promise<void> {
    const { checkType, adapterId } = job.data;
    
    try {
      switch (checkType) {
        case 'liveness':
          await this.runLivenessProbe(adapterId);
          break;
        case 'freshness':
          await this.runFreshnessProbe(adapterId);
          break;
        case 'canary':
          await this.runCanaryAcquisition(adapterId);
          break;
        case 'confidence_trend':
          await this.runConfidenceTrendMonitor();
          break;
        default:
          throw new Error(`Unknown check type: ${checkType}`);
      }
    } catch (error) {
      await auditLogger.log({
        event: 'SYNTHETIC_CHECK_ERROR',
        checkType,
        adapterId,
        error: error.message,
        severity: 'error',
      });
      throw error;
    }
  }
  
  private async runLivenessProbe(adapterId: string): Promise<void> {
    // Implementation from above
  }
  
  private async runFreshnessProbe(adapterId: string): Promise<void> {
    // Implementation from above
  }
  
  private async runCanaryAcquisition(adapterId: string): Promise<void> {
    // Implementation from above
  }
  
  private async runConfidenceTrendMonitor(): Promise<void> {
    // Implementation from above
  }
  
  async start(): Promise<void> {
    console.log('Synthetic monitor worker started');
  }
  
  async stop(): Promise<void> {
    await this.worker.close();
  }
}
```

---

## Scheduling

**Schedule defined in:** `src/workers/scheduler.ts`

```typescript
import { Queue } from 'bullmq';

const syntheticQueue = new Queue('synthetic-checks');

// Adapter liveness probes: every 5 minutes
await syntheticQueue.add(
  'liveness',
  { checkType: 'liveness', adapterId: 'eastleigh' },
  { repeat: { every: 5 * 60 * 1000 } }
);

// Data freshness probes: every 30 minutes
await syntheticQueue.add(
  'freshness',
  { checkType: 'freshness', adapterId: 'eastleigh' },
  { repeat: { every: 30 * 60 * 1000 } }
);

// Full acquisition canary: every 2 hours
await syntheticQueue.add(
  'canary',
  { checkType: 'canary', adapterId: 'eastleigh' },
  { repeat: { every: 2 * 60 * 60 * 1000 } }
);

// Confidence trend monitor: every hour
await syntheticQueue.add(
  'confidence_trend',
  { checkType: 'confidence_trend' },
  { repeat: { every: 60 * 60 * 1000 } }
);
```

---

## Safety Considerations

### Isolated Execution
- Synthetic checks run in separate worker process
- No impact on production API traffic
- Failures do NOT block user requests

### No Production Data
- Use dedicated test postcodes/UPRNs
- No PII in synthetic check data
- Evidence stored separately with `isSynthetic: true` flag

### Separate Rate Limit Quota
- Synthetic checks have separate rate limit allocation
- Do NOT count against user quotas
- Respect upstream council rate limits (staggered execution)

### Graceful Degradation
- If synthetic worker fails, production API continues
- Monitoring gaps logged but non-blocking
- Manual health checks available via admin API

---

## Metrics Tracked

### Per-Adapter Metrics
- Liveness probe success rate (5min, 1h, 24h)
- Average response time (liveness, canary)
- Confidence score trend (1h, 24h, 7d rolling)
- Failure count (consecutive, 24h total)
- Last successful canary timestamp

### Global Metrics
- Total synthetic checks executed (by type)
- Check success rate across all adapters
- Alert count (by severity)
- Mean time to detection (MTTD) for failures

---

## Dashboards

### Grafana Dashboard: "Synthetic Monitoring"
- **Panel 1:** Adapter health status (traffic light)
- **Panel 2:** Liveness probe response time (line chart)
- **Panel 3:** Canary success rate (bar chart, per adapter)
- **Panel 4:** Confidence score trends (line chart, 7d)
- **Panel 5:** Alert timeline (event log)

### CloudWatch Dashboard (AWS)
- Lambda function metrics (if deployed on AWS)
- Redis queue depth
- Worker CPU/memory usage

---

## Runbook

### Scenario: Liveness Probe Failure (3 consecutive)

1. **Automatic Actions:**
   - Adapter marked `degraded`
   - Slack notification sent to #binday-alerts
   - Kill switch does NOT activate (degraded ≠ disabled)

2. **Manual Investigation:**
   - Check upstream council website (manual visit)
   - Review recent adapter logs for errors
   - Check evidence store for last successful acquisition
   - Run manual canary via admin API: `POST /admin/v1/synthetic/canary/{adapterId}`

3. **Resolution:**
   - If upstream down: Wait for recovery, monitor
   - If adapter bug: Deploy hotfix, reset failure counter
   - If schema drift: Update adapter, deploy, verify canary

### Scenario: Confidence Degradation (>20% drop)

1. **Automatic Actions:**
   - Alert sent to #binday-alerts
   - Drift detection runs on recent acquisitions

2. **Manual Investigation:**
   - Compare current responses to schema snapshot
   - Check upstream website for UI/API changes
   - Review drift detection report

3. **Resolution:**
   - Update adapter to handle new schema
   - Update schema snapshot baseline
   - Deploy and verify confidence recovery

---

## Future Enhancements (Post-Phase 3)

1. **Multi-Region Canary:** Run canaries from different geographic locations to detect regional issues
2. **User Journey Simulation:** Full end-to-end API flow (postcode → address → collections)
3. **Performance Regression Detection:** Alert on response time increases >50% from baseline
4. **Automated Rollback:** On canary failure, automatically roll back to previous adapter version
5. **Adaptive Scheduling:** Increase check frequency during degraded periods

---

## Revision History

| Version | Date       | Author | Changes                          |
|---------|------------|--------|----------------------------------|
| 1.0     | 2026-03-25 | Bobbie | Initial synthetic monitoring design |
