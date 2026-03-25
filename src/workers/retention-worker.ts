/**
 * Hampshire Bin Collection Data Platform
 * Retention Worker
 *
 * Scheduled background worker that runs the retention policy engine.
 * Executes daily at 2am to purge expired data.
 *
 * @module workers/retention-worker
 */

import { logger } from '../observability/logger.js';
import { auditLogger } from '../observability/audit.js';
import type { RetentionEngine, PurgeResult } from '../core/retention/policy.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Dry-run mode configuration.
 * Set to true to run scans without actually deleting data.
 * Recommended for first 24h after deployment.
 */
const RETENTION_DRY_RUN = process.env.RETENTION_DRY_RUN === 'true' || false;

/**
 * Max records to purge per run (prevents long locks).
 */
const MAX_PURGE_BATCH_SIZE = parseInt(process.env.RETENTION_BATCH_SIZE || '1000', 10);

/**
 * Failure threshold: emit security event if purge failures exceed this percentage.
 */
const FAILURE_THRESHOLD_PERCENT = 5;

// =============================================================================
// RETENTION WORKER
// =============================================================================

export class RetentionWorker {
  private retentionEngine: RetentionEngine;
  private isRunning: boolean = false;
  private lastRunTimestamp: Date | null = null;
  private lastRunResult: PurgeResult | null = null;

  constructor(retentionEngine: RetentionEngine) {
    this.retentionEngine = retentionEngine;

    logger.info('Retention worker initialized', {
      schedule: retentionEngine.getSchedule(),
      dryRun: RETENTION_DRY_RUN,
      batchSize: MAX_PURGE_BATCH_SIZE,
    });
  }

  /**
   * Execute retention purge.
   * Called by cron scheduler or manual admin trigger.
   */
  async run(): Promise<PurgeResult> {
    if (this.isRunning) {
      throw new Error('Retention worker already running');
    }

    this.isRunning = true;
    logger.info('Retention worker starting', {
      dryRun: RETENTION_DRY_RUN,
      batchSize: MAX_PURGE_BATCH_SIZE,
    });

    try {
      // Step 1: Scan for expired data
      const scanResult = await this.retentionEngine.scanExpired();

      logger.info('Retention scan complete', {
        totalExpiredRecords: scanResult.totalExpiredRecords,
        estimatedStorageBytes: scanResult.estimatedStorageBytes,
        dataTypes: Array.from(scanResult.expiredByType.keys()),
      });

      // Step 2: Log to audit what will be purged
      auditLogger.log({
        eventType: 'admin.adapter.enable' as any, // TODO: Add DATA_PURGE_SCAN event type
        severity: 'info',
        actor: { type: 'system' },
        resource: { type: 'retention' },
        action: 'retention.scan.complete',
        outcome: 'success',
        metadata: {
          scanId: scanResult.scanId,
          totalExpiredRecords: scanResult.totalExpiredRecords,
          estimatedStorageBytes: scanResult.estimatedStorageBytes,
          dataTypes: Array.from(scanResult.expiredByType.keys()),
          dryRun: RETENTION_DRY_RUN,
        },
      });

      // Step 3: Execute purge in batches
      const purgeResult = await this.retentionEngine.executePurge({
        dryRun: RETENTION_DRY_RUN,
        batchSize: MAX_PURGE_BATCH_SIZE,
      });

      this.lastRunTimestamp = new Date();
      this.lastRunResult = purgeResult;

      // Step 4: Log completion
      const failureRate = purgeResult.totalPurgedRecords > 0
        ? (purgeResult.failures.length / purgeResult.totalPurgedRecords) * 100
        : 0;

      logger.info('Retention purge complete', {
        purgeId: purgeResult.purgeId,
        dryRun: purgeResult.dryRun,
        totalPurgedRecords: purgeResult.totalPurgedRecords,
        totalPurgedBytes: purgeResult.totalPurgedBytes,
        failureCount: purgeResult.failures.length,
        failureRate: `${failureRate.toFixed(2)}%`,
      });

      // Step 5: Emit security event if failures exceed threshold
      if (failureRate > FAILURE_THRESHOLD_PERCENT) {
        logger.error('Retention purge failure threshold exceeded', {
          purgeId: purgeResult.purgeId,
          failureRate: `${failureRate.toFixed(2)}%`,
          threshold: `${FAILURE_THRESHOLD_PERCENT}%`,
          failures: purgeResult.failures,
        });

        auditLogger.log({
          eventType: 'security.upstream_anomaly' as any, // TODO: Add RETENTION_FAILURE event type
          severity: 'critical',
          actor: { type: 'system' },
          resource: { type: 'retention' },
          action: 'retention.purge.failure_threshold_exceeded',
          outcome: 'failure',
          metadata: {
            purgeId: purgeResult.purgeId,
            failureRate,
            threshold: FAILURE_THRESHOLD_PERCENT,
            failureCount: purgeResult.failures.length,
            totalRecords: purgeResult.totalPurgedRecords,
          },
        });
      }

      return purgeResult;
    } catch (error) {
      logger.error('Retention worker failed', { error });

      auditLogger.log({
        eventType: 'security.upstream_anomaly' as any, // TODO: Add RETENTION_FAILURE event type
        severity: 'critical',
        actor: { type: 'system' },
        resource: { type: 'retention' },
        action: 'retention.worker.failed',
        outcome: 'failure',
        metadata: {
          error: String(error),
        },
      });

      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get status of retention worker.
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRunTimestamp: this.lastRunTimestamp,
      lastRunResult: this.lastRunResult
        ? {
            purgeId: this.lastRunResult.purgeId,
            dryRun: this.lastRunResult.dryRun,
            totalPurgedRecords: this.lastRunResult.totalPurgedRecords,
            totalPurgedBytes: this.lastRunResult.totalPurgedBytes,
            failureCount: this.lastRunResult.failures.length,
          }
        : null,
      config: {
        dryRun: RETENTION_DRY_RUN,
        batchSize: MAX_PURGE_BATCH_SIZE,
        schedule: this.retentionEngine.getSchedule(),
      },
    };
  }

  /**
   * Check if grace period is active.
   */
  isGracePeriodActive(): boolean {
    return this.retentionEngine.isGracePeriodActive();
  }
}

/**
 * Create and start retention worker with cron schedule.
 */
export async function createRetentionWorker(
  retentionEngine: RetentionEngine,
  startScheduler = true
): Promise<RetentionWorker> {
  const worker = new RetentionWorker(retentionEngine);

  if (startScheduler) {
    // TODO: Integrate with cron scheduler (e.g., node-cron)
    // Example:
    // import cron from 'node-cron';
    // const schedule = retentionEngine.getSchedule();
    // cron.schedule(schedule, async () => {
    //   logger.info('Retention worker triggered by cron');
    //   await worker.run();
    // });

    logger.info('Retention worker scheduler started', {
      schedule: retentionEngine.getSchedule(),
      dryRun: RETENTION_DRY_RUN,
    });
  }

  return worker;
}
