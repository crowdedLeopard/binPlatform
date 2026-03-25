/**
 * Hampshire Bin Collection Data Platform
 * Retention Policy Engine
 *
 * Formal, configurable retention policy engine for all data types.
 * Enforces data minimisation and compliance with data classification matrix.
 *
 * @module core/retention/policy
 */

import { logger } from '../../observability/logger.js';
import { auditLogger, AuditEventType } from '../../observability/audit.js';

// =============================================================================
// TYPES
// =============================================================================

export type DataType =
  | 'raw-evidence-html'
  | 'raw-evidence-json'
  | 'raw-evidence-pdf'
  | 'raw-evidence-screenshot'
  | 'normalised-collection'
  | 'acquisition-attempt'
  | 'security-event'
  | 'audit-log'
  | 'user-input-log'
  | 'api-key';

export type PurgeStrategy =
  | 'hard-delete-blob'
  | 'soft-delete-db'
  | 'archive-then-delete'
  | 'revoke-on-expiry';

export interface RetentionConfig {
  /** Maximum age in days, null = indefinite */
  maxAgeDays: number | null;
  /** How to purge expired data */
  purgeStrategy: PurgeStrategy;
  /** Optional description for documentation */
  description?: string;
}

export interface RetentionScanResult {
  scanId: string;
  scanTimestamp: string;
  expiredByType: Map<DataType, ExpiredDataSet>;
  totalExpiredRecords: number;
  estimatedStorageBytes: number;
}

export interface ExpiredDataSet {
  dataType: DataType;
  recordCount: number;
  oldestRecord: Date;
  newestRecord: Date;
  affectedCouncils?: string[];
}

export interface PurgeOptions {
  /** Dry run mode: scan only, do not delete */
  dryRun: boolean;
  /** Max records to purge per run (throttle) */
  batchSize: number;
  /** Which data types to purge (default: all) */
  dataTypes?: DataType[];
  /** Force purge even if within safety window */
  force?: boolean;
}

export interface PurgeResult {
  purgeId: string;
  startedAt: string;
  completedAt: string;
  dryRun: boolean;
  purgedByType: Map<DataType, PurgedDataSet>;
  totalPurgedRecords: number;
  totalPurgedBytes: number;
  failures: PurgeFailure[];
}

export interface PurgedDataSet {
  dataType: DataType;
  purgedCount: number;
  failedCount: number;
  strategy: PurgeStrategy;
}

export interface PurgeFailure {
  dataType: DataType;
  recordId: string;
  error: string;
}

export type CronExpression = string;

// =============================================================================
// RETENTION POLICY
// =============================================================================

/**
 * Retention windows by data type.
 * Based on data classification matrix and compliance requirements.
 */
export const RETENTION_POLICY: Record<DataType, RetentionConfig> = {
  'raw-evidence-html': {
    maxAgeDays: 90,
    purgeStrategy: 'hard-delete-blob',
    description: 'HTML pages fetched from council websites (debug/audit)',
  },
  'raw-evidence-json': {
    maxAgeDays: 90,
    purgeStrategy: 'hard-delete-blob',
    description: 'JSON/XHR responses captured during scraping',
  },
  'raw-evidence-pdf': {
    maxAgeDays: 30,
    purgeStrategy: 'hard-delete-blob',
    description: 'PDF files downloaded from council websites',
  },
  'raw-evidence-screenshot': {
    maxAgeDays: 7,
    purgeStrategy: 'hard-delete-blob',
    description: 'Browser screenshots for debugging (minimal retention)',
  },
  'normalised-collection': {
    maxAgeDays: 365,
    purgeStrategy: 'soft-delete-db',
    description: 'Normalised collection schedules (historical data)',
  },
  'acquisition-attempt': {
    maxAgeDays: 90,
    purgeStrategy: 'soft-delete-db',
    description: 'Adapter acquisition attempt logs',
  },
  'security-event': {
    maxAgeDays: 365,
    purgeStrategy: 'archive-then-delete',
    description: 'Security events requiring forensic capability',
  },
  'audit-log': {
    maxAgeDays: 730,
    purgeStrategy: 'archive-then-delete',
    description: 'Audit logs for compliance (2 years minimum)',
  },
  'user-input-log': {
    maxAgeDays: 30,
    purgeStrategy: 'hard-delete-blob',
    description: 'Request logs with user inputs (minimal retention)',
  },
  'api-key': {
    maxAgeDays: null,
    purgeStrategy: 'revoke-on-expiry',
    description: 'API keys (active indefinitely, revoked keys 90 days)',
  },
};

/**
 * Safety window: do not purge data newer than this (days).
 * Prevents accidental deletion of recent data.
 */
export const SAFETY_WINDOW_DAYS = 7;

/**
 * Deployment grace period: run in dry-run mode for this many hours after deployment.
 * Prevents accidental purges immediately after deployment.
 */
export const DEPLOYMENT_GRACE_PERIOD_HOURS = 24;

// =============================================================================
// RETENTION ENGINE
// =============================================================================

export interface RetentionEngine {
  /** Scan for expired data across all types */
  scanExpired(): Promise<RetentionScanResult>;

  /** Execute purge (dry-run mode available) */
  executePurge(options: PurgeOptions): Promise<PurgeResult>;

  /** Get cron schedule for automated runs */
  getSchedule(): CronExpression;

  /** Check if deployment grace period is active */
  isGracePeriodActive(): boolean;

  /** Get retention config for a data type */
  getConfig(dataType: DataType): RetentionConfig;

  /** Calculate expiry date for a data type */
  calculateExpiryDate(dataType: DataType, createdAt: Date): Date | null;
}

export class RetentionPolicyEngine implements RetentionEngine {
  private deploymentTimestamp: Date;
  private readonly scanners: Map<DataType, DataScanner>;

  constructor(scanners: Map<DataType, DataScanner>) {
    this.deploymentTimestamp = new Date();
    this.scanners = scanners;

    logger.info({
      dataTypes: Array.from(scanners.keys()),
      gracePeriodHours: DEPLOYMENT_GRACE_PERIOD_HOURS,
    }, 'Retention policy engine initialized');
  }

  /**
   * Scan for expired data across all types.
   */
  async scanExpired(): Promise<RetentionScanResult> {
    const scanId = `scan-${Date.now()}`;
    const scanTimestamp = new Date().toISOString();
    const expiredByType = new Map<DataType, ExpiredDataSet>();
    let totalExpiredRecords = 0;
    let estimatedStorageBytes = 0;

    logger.info({ scanId }, 'Starting retention scan');

    for (const [dataType, scanner] of this.scanners) {
      const config = RETENTION_POLICY[dataType];

      // Skip if no retention limit
      if (config.maxAgeDays === null) {
        logger.debug({ dataType }, 'Skipping data type (no retention limit)');
        continue;
      }

      try {
        const cutoffDate = this.calculateCutoffDate(config.maxAgeDays);
        const expiredData = await scanner.scanExpired(cutoffDate);

        if (expiredData.recordCount > 0) {
          expiredByType.set(dataType, expiredData);
          totalExpiredRecords += expiredData.recordCount;
          estimatedStorageBytes += await scanner.estimateStorageSize(expiredData);

          logger.info({
            scanId,
            dataType,
            recordCount: expiredData.recordCount,
            oldestRecord: expiredData.oldestRecord,
            newestRecord: expiredData.newestRecord,
          }, 'Expired data found');
        }
      } catch (error) {
        logger.error({
          scanId,
          dataType,
          error,
        }, 'Failed to scan data type');
      }
    }

    const result: RetentionScanResult = {
      scanId,
      scanTimestamp,
      expiredByType,
      totalExpiredRecords,
      estimatedStorageBytes,
    };

    logger.info({
      scanId,
      totalExpiredRecords,
      estimatedStorageBytes,
      dataTypes: Array.from(expiredByType.keys()),
    }, 'Retention scan complete');

    return result;
  }

  /**
   * Execute purge of expired data.
   */
  async executePurge(options: PurgeOptions): Promise<PurgeResult> {
    const purgeId = `purge-${Date.now()}`;
    const startedAt = new Date().toISOString();

    // Check grace period
    if (!options.force && this.isGracePeriodActive()) {
      throw new Error(
        `Deployment grace period active (${DEPLOYMENT_GRACE_PERIOD_HOURS}h). ` +
        `Use force=true to override or wait.`
      );
    }

    // Audit log: purge starting
    auditLogger.log({
      eventType: AuditEventType.ADMIN_ADAPTER_ENABLE, // TODO: Add DATA_PURGE event type
      severity: 'warning',
      actor: { type: 'system' },
      resource: { type: 'retention' },
      action: 'retention.purge.start',
      outcome: 'success',
      metadata: {
        purgeId,
        dryRun: options.dryRun,
        batchSize: options.batchSize,
        dataTypes: options.dataTypes,
      },
    });

    logger.info({
      purgeId,
      dryRun: options.dryRun,
      batchSize: options.batchSize,
      dataTypes: options.dataTypes || 'all',
    }, 'Starting retention purge');

    const purgedByType = new Map<DataType, PurgedDataSet>();
    const failures: PurgeFailure[] = [];
    let totalPurgedRecords = 0;
    let totalPurgedBytes = 0;

    // Determine which data types to process
    const dataTypesToProcess = options.dataTypes || Array.from(this.scanners.keys());

    for (const dataType of dataTypesToProcess) {
      const scanner = this.scanners.get(dataType);
      if (!scanner) {
        logger.warn({ dataType }, 'No scanner for data type');
        continue;
      }

      const config = RETENTION_POLICY[dataType];

      // Skip if no retention limit
      if (config.maxAgeDays === null) {
        logger.debug({ dataType }, 'Skipping data type (no retention limit)');
        continue;
      }

      try {
        const cutoffDate = this.calculateCutoffDate(config.maxAgeDays);
        const result = await scanner.purgeExpired(
          cutoffDate,
          config.purgeStrategy,
          options.dryRun,
          options.batchSize
        );

        purgedByType.set(dataType, {
          dataType,
          purgedCount: result.purgedCount,
          failedCount: result.failedCount,
          strategy: config.purgeStrategy,
        });

        totalPurgedRecords += result.purgedCount;
        totalPurgedBytes += result.bytesReclaimed;

        // Collect failures
        failures.push(...result.failures.map(f => ({
          dataType,
          recordId: f.recordId,
          error: f.error,
        })));

        logger.info({
          purgeId,
          dataType,
          purgedCount: result.purgedCount,
          failedCount: result.failedCount,
          bytesReclaimed: result.bytesReclaimed,
          dryRun: options.dryRun,
        }, 'Purged data type');
      } catch (error) {
        logger.error({
          purgeId,
          dataType,
          error,
        }, 'Failed to purge data type');

        failures.push({
          dataType,
          recordId: 'BATCH_FAILURE',
          error: String(error),
        });
      }
    }

    const completedAt = new Date().toISOString();

    const result: PurgeResult = {
      purgeId,
      startedAt,
      completedAt,
      dryRun: options.dryRun,
      purgedByType,
      totalPurgedRecords,
      totalPurgedBytes,
      failures,
    };

    // Audit log: purge complete
    auditLogger.log({
      eventType: AuditEventType.ADMIN_ADAPTER_ENABLE, // TODO: Add DATA_PURGE event type
      severity: failures.length > 0 ? 'warning' : 'info',
      actor: { type: 'system' },
      resource: { type: 'retention' },
      action: 'retention.purge.complete',
      outcome: failures.length > 0 ? 'failure' : 'success',
      metadata: {
        purgeId,
        dryRun: options.dryRun,
        totalPurgedRecords,
        totalPurgedBytes,
        failureCount: failures.length,
      },
    });

    logger.info({
      purgeId,
      dryRun: options.dryRun,
      totalPurgedRecords,
      totalPurgedBytes,
      failureCount: failures.length,
    }, 'Retention purge complete');

    return result;
  }

  /**
   * Get cron schedule for automated runs.
   * Runs daily at 2am.
   */
  getSchedule(): CronExpression {
    return '0 2 * * *'; // 2am daily
  }

  /**
   * Check if deployment grace period is active.
   */
  isGracePeriodActive(): boolean {
    const now = new Date();
    const hoursSinceDeployment = (now.getTime() - this.deploymentTimestamp.getTime()) / 1000 / 60 / 60;
    return hoursSinceDeployment < DEPLOYMENT_GRACE_PERIOD_HOURS;
  }

  /**
   * Get retention config for a data type.
   */
  getConfig(dataType: DataType): RetentionConfig {
    return RETENTION_POLICY[dataType];
  }

  /**
   * Calculate expiry date for a data type.
   */
  calculateExpiryDate(dataType: DataType, createdAt: Date): Date | null {
    const config = RETENTION_POLICY[dataType];
    if (config.maxAgeDays === null) {
      return null; // No expiry
    }

    const expiryDate = new Date(createdAt);
    expiryDate.setDate(expiryDate.getDate() + config.maxAgeDays);
    return expiryDate;
  }

  /**
   * Calculate cutoff date (before this date = expired).
   * Includes safety window.
   */
  private calculateCutoffDate(maxAgeDays: number): Date {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays - SAFETY_WINDOW_DAYS);
    return cutoffDate;
  }
}

// =============================================================================
// DATA SCANNER INTERFACE
// =============================================================================

export interface DataScanner {
  /** Scan for expired records before cutoff date */
  scanExpired(cutoffDate: Date): Promise<ExpiredDataSet>;

  /** Estimate storage size of expired data */
  estimateStorageSize(expiredData: ExpiredDataSet): Promise<number>;

  /** Purge expired records */
  purgeExpired(
    cutoffDate: Date,
    strategy: PurgeStrategy,
    dryRun: boolean,
    batchSize: number
  ): Promise<PurgeExecutionResult>;
}

export interface PurgeExecutionResult {
  purgedCount: number;
  failedCount: number;
  bytesReclaimed: number;
  failures: Array<{ recordId: string; error: string }>;
}
