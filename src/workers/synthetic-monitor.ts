/**
 * Synthetic Monitor Worker
 * 
 * Scheduled worker that runs synthetic health checks for all active adapters.
 * Proactively detects failures before users notice.
 * 
 * Safety:
 * - Isolated execution (separate worker process)
 * - No production data used
 * - Separate rate limit quota
 * - Failures do not block user requests
 */

import { Worker, Job, Queue } from 'bullmq';
import type {
  CouncilAdapter,
  AdapterHealth,
  CollectionEventResult,
  PropertyIdentity,
} from '../adapters/base/adapter.interface';

// Type definitions for synthetic checks
type SyntheticCheckType = 'liveness' | 'freshness' | 'canary' | 'confidence_trend';

type SyntheticJobData = {
  checkType: SyntheticCheckType;
  adapterId?: string;
};

type CanaryConfig = {
  councilLocalId: string;
  uprn?: string;
  address: string;
  postcode: string;
};

type LivenessProbeResult = {
  adapterId: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  duration: number;
  upstreamReachable: boolean;
  timestamp: string;
};

type CanaryResult = {
  adapterId: string;
  success: boolean;
  confidence: number;
  duration: number;
  eventCount: number;
  timestamp: string;
};

type ConfidenceMetrics = {
  adapterId: string;
  currentAvg: number;
  rollingAvg: number;
  percentageChange: number;
};

// Mock interfaces for dependencies (will be implemented by Holden)
interface AdapterRegistry {
  get(adapterId: string): CouncilAdapter;
  getAllActive(): string[];
}

interface CouncilRegistry {
  getTestPostcode(adapterId: string): string;
  getCanaryConfig(adapterId: string): CanaryConfig;
}

interface AuditLogger {
  log(event: {
    event: string;
    adapterId?: string;
    severity: 'info' | 'warning' | 'error' | 'critical';
    [key: string]: unknown;
  }): Promise<void>;
}

interface MetricsStore {
  recordProbe(adapterId: string, result: LivenessProbeResult): Promise<void>;
  recordCanary(adapterId: string, result: CanaryResult): Promise<void>;
  getAvgConfidence(adapterId: string, options: { period: string }): Promise<number>;
}

interface NotificationService {
  alert(config: {
    channel: 'slack' | 'pagerduty' | 'email';
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

interface CacheService {
  get(key: string): Promise<{
    data: unknown;
    acquiredAt: string;
    confidence: number;
  } | null>;
}

interface AcquisitionQueue {
  add(
    name: string,
    data: {
      adapterId: string;
      postcode: string;
      priority: 'low' | 'medium' | 'high';
      isSynthetic: boolean;
    }
  ): Promise<void>;
}

// Failure tracking
const adapterFailureCounters = new Map<string, number>();

export class SyntheticMonitorWorker {
  private worker: Worker;
  private queue: Queue;
  
  constructor(
    private adapterRegistry: AdapterRegistry,
    private councilRegistry: CouncilRegistry,
    private auditLogger: AuditLogger,
    private metricsStore: MetricsStore,
    private notificationService: NotificationService,
    private cacheService: CacheService,
    private acquisitionQueue: AcquisitionQueue,
    private redisConfig: { host: string; port: number }
  ) {
    this.queue = new Queue('synthetic-checks', {
      connection: redisConfig,
    });
    
    this.worker = new Worker(
      'synthetic-checks',
      async (job: Job<SyntheticJobData>) => {
        await this.processJob(job);
      },
      {
        connection: redisConfig,
        concurrency: 5,
      }
    );
  }
  
  private async processJob(job: Job<SyntheticJobData>): Promise<void> {
    const { checkType, adapterId } = job.data;
    
    try {
      switch (checkType) {
        case 'liveness':
          if (!adapterId) throw new Error('adapterId required for liveness check');
          await this.runLivenessProbe(adapterId);
          break;
          
        case 'freshness':
          if (!adapterId) throw new Error('adapterId required for freshness check');
          await this.runFreshnessProbe(adapterId);
          break;
          
        case 'canary':
          if (!adapterId) throw new Error('adapterId required for canary check');
          await this.runCanaryAcquisition(adapterId);
          break;
          
        case 'confidence_trend':
          await this.runConfidenceTrendMonitor();
          break;
          
        default:
          throw new Error(`Unknown check type: ${checkType}`);
      }
    } catch (error) {
      await this.auditLogger.log({
        event: 'SYNTHETIC_CHECK_ERROR',
        checkType,
        adapterId,
        error: error instanceof Error ? error.message : String(error),
        severity: 'error',
      });
      throw error;
    }
  }
  
  /**
   * Liveness Probe: Check adapter health
   * Frequency: Every 5 minutes
   */
  private async runLivenessProbe(adapterId: string): Promise<void> {
    const adapter = this.adapterRegistry.get(adapterId);
    const startTime = Date.now();
    
    try {
      const health: AdapterHealth = await adapter.verifyHealth();
      const duration = Date.now() - startTime;
      
      if (duration > 5000) {
        await this.auditLogger.log({
          event: 'LIVENESS_PROBE_SLOW',
          adapterId,
          duration,
          severity: 'warning',
        });
      }
      
      const probeResult: LivenessProbeResult = {
        adapterId,
        status: health.status as 'healthy' | 'degraded' | 'unhealthy',
        duration,
        upstreamReachable: health.upstreamReachable,
        timestamp: new Date().toISOString(),
      };
      
      await this.metricsStore.recordProbe(adapterId, probeResult);
      
      if (health.status === 'healthy') {
        // Reset failure counter on success
        adapterFailureCounters.set(adapterId, 0);
      } else {
        await this.handleUnhealthyAdapter(adapterId, health);
      }
    } catch (error) {
      await this.handleProbeFailure(adapterId, error);
    }
  }
  
  /**
   * Freshness Probe: Check cache age for test postcode
   * Frequency: Every 30 minutes
   */
  private async runFreshnessProbe(adapterId: string): Promise<void> {
    const testPostcode = this.councilRegistry.getTestPostcode(adapterId);
    const cacheKey = `collections:${adapterId}:${testPostcode}`;
    
    const cachedData = await this.cacheService.get(cacheKey);
    
    if (!cachedData) {
      await this.auditLogger.log({
        event: 'DATA_FRESHNESS_MISS',
        adapterId,
        testPostcode,
        severity: 'warning',
      });
      
      // Trigger background acquisition
      await this.acquisitionQueue.add('refresh', {
        adapterId,
        postcode: testPostcode,
        priority: 'low',
        isSynthetic: true,
      });
      return;
    }
    
    const ageHours =
      (Date.now() - new Date(cachedData.acquiredAt).getTime()) / (1000 * 60 * 60);
    const ttlHours = 7 * 24; // 7 days
    
    if (ageHours > ttlHours * 0.9) {
      await this.auditLogger.log({
        event: 'DATA_FRESHNESS_STALE',
        adapterId,
        ageHours,
        ttlHours,
        severity: 'info',
      });
      
      // Proactive refresh before expiry
      await this.acquisitionQueue.add('refresh', {
        adapterId,
        postcode: testPostcode,
        priority: 'low',
        isSynthetic: true,
      });
    }
  }
  
  /**
   * Canary Acquisition: Full end-to-end test
   * Frequency: Every 2 hours
   */
  private async runCanaryAcquisition(adapterId: string): Promise<void> {
    const testConfig = this.councilRegistry.getCanaryConfig(adapterId);
    const adapter = this.adapterRegistry.get(adapterId);
    
    const startTime = Date.now();
    
    try {
      const propertyIdentity: PropertyIdentity = {
        councilLocalId: testConfig.councilLocalId,
        uprn: testConfig.uprn,
        address: testConfig.address,
        postcode: testConfig.postcode,
        correlationId: `canary-${adapterId}-${Date.now()}`,
      };
      
      const result: CollectionEventResult = await adapter.getCollectionEvents(
        propertyIdentity,
        {
          from: new Date().toISOString(),
          to: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days
        }
      );
      
      const duration = Date.now() - startTime;
      
      if (!result.success) {
        await this.handleCanaryFailure(adapterId, result);
        return;
      }
      
      if (result.confidence < 0.6) {
        await this.auditLogger.log({
          event: 'CANARY_LOW_CONFIDENCE',
          adapterId,
          confidence: result.confidence,
          severity: 'warning',
        });
      }
      
      const canaryResult: CanaryResult = {
        adapterId,
        success: true,
        confidence: result.confidence,
        duration,
        eventCount: result.data?.length || 0,
        timestamp: new Date().toISOString(),
      };
      
      await this.metricsStore.recordCanary(adapterId, canaryResult);
      
      // Reset failure counter on success
      adapterFailureCounters.set(adapterId, 0);
    } catch (error) {
      await this.handleCanaryException(adapterId, error);
    }
  }
  
  /**
   * Confidence Trend Monitor: Detect sudden drops
   * Frequency: Every hour
   */
  private async runConfidenceTrendMonitor(): Promise<void> {
    const adapters = this.adapterRegistry.getAllActive();
    
    for (const adapterId of adapters) {
      try {
        const currentAvg = await this.metricsStore.getAvgConfidence(adapterId, {
          period: '1h',
        });
        
        const rollingAvg = await this.metricsStore.getAvgConfidence(adapterId, {
          period: '7d',
        });
        
        const percentageChange = ((currentAvg - rollingAvg) / rollingAvg) * 100;
        
        if (percentageChange < -20) {
          await this.auditLogger.log({
            event: 'CONFIDENCE_DEGRADATION',
            adapterId,
            currentAvg,
            rollingAvg,
            percentageChange,
            severity: 'critical',
          });
          
          await this.notificationService.alert({
            channel: 'slack',
            severity: 'high',
            message: `Confidence drop detected for ${adapterId}: ${percentageChange.toFixed(1)}%`,
            metadata: {
              currentAvg,
              rollingAvg,
              adapterId,
            },
          });
        } else if (percentageChange < -10) {
          await this.auditLogger.log({
            event: 'CONFIDENCE_DRIFT',
            adapterId,
            currentAvg,
            rollingAvg,
            percentageChange,
            severity: 'warning',
          });
        }
      } catch (error) {
        await this.auditLogger.log({
          event: 'CONFIDENCE_TREND_ERROR',
          adapterId,
          error: error instanceof Error ? error.message : String(error),
          severity: 'error',
        });
      }
    }
  }
  
  /**
   * Handle unhealthy adapter from liveness probe
   */
  private async handleUnhealthyAdapter(
    adapterId: string,
    health: AdapterHealth
  ): Promise<void> {
    const failureCount = (adapterFailureCounters.get(adapterId) || 0) + 1;
    adapterFailureCounters.set(adapterId, failureCount);
    
    await this.auditLogger.log({
      event: 'ADAPTER_UNHEALTHY',
      adapterId,
      status: health.status,
      failureCount,
      severity: failureCount >= 3 ? 'critical' : 'warning',
    });
    
    if (failureCount >= 3) {
      await this.notificationService.alert({
        channel: 'slack',
        severity: 'high',
        message: `Adapter ${adapterId} marked degraded after 3 consecutive failures`,
        metadata: {
          adapterId,
          status: health.status,
          lastFailure: health.lastFailureMessage,
        },
      });
    }
  }
  
  /**
   * Handle probe execution failure
   */
  private async handleProbeFailure(adapterId: string, error: unknown): Promise<void> {
    const failureCount = (adapterFailureCounters.get(adapterId) || 0) + 1;
    adapterFailureCounters.set(adapterId, failureCount);
    
    await this.auditLogger.log({
      event: 'LIVENESS_PROBE_FAILED',
      adapterId,
      error: error instanceof Error ? error.message : String(error),
      failureCount,
      severity: failureCount >= 3 ? 'critical' : 'error',
    });
    
    if (failureCount >= 3) {
      await this.notificationService.alert({
        channel: 'slack',
        severity: 'critical',
        message: `Adapter ${adapterId} liveness probe failed 3 times consecutively`,
        metadata: {
          adapterId,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
  
  /**
   * Handle canary acquisition failure
   */
  private async handleCanaryFailure(
    adapterId: string,
    result: CollectionEventResult
  ): Promise<void> {
    const failureCount = (adapterFailureCounters.get(adapterId) || 0) + 1;
    adapterFailureCounters.set(adapterId, failureCount);
    
    await this.auditLogger.log({
      event: 'SYNTHETIC_CHECK_FAILED',
      adapterId,
      failureCategory: result.failureCategory,
      errorMessage: result.errorMessage,
      failureCount,
      severity: failureCount >= 2 ? 'critical' : 'warning',
    });
    
    if (failureCount >= 2) {
      await this.notificationService.alert({
        channel: 'pagerduty',
        severity: 'high',
        message: `Canary acquisition failed for ${adapterId} (2 consecutive failures)`,
        metadata: {
          adapterId,
          failureCategory: result.failureCategory,
          errorMessage: result.errorMessage,
        },
      });
    }
  }
  
  /**
   * Handle canary execution exception
   */
  private async handleCanaryException(adapterId: string, error: unknown): Promise<void> {
    await this.auditLogger.log({
      event: 'CANARY_EXCEPTION',
      adapterId,
      error: error instanceof Error ? error.message : String(error),
      severity: 'error',
    });
  }
  
  /**
   * Start the worker
   */
  async start(): Promise<void> {
    console.log('Synthetic monitor worker started');
    
    // Log worker startup
    await this.auditLogger.log({
      event: 'SYNTHETIC_WORKER_STARTED',
      severity: 'info',
    });
  }
  
  /**
   * Stop the worker gracefully
   */
  async stop(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
    
    console.log('Synthetic monitor worker stopped');
    
    await this.auditLogger.log({
      event: 'SYNTHETIC_WORKER_STOPPED',
      severity: 'info',
    });
  }
  
  /**
   * Schedule synthetic checks for all active adapters
   */
  async scheduleChecks(): Promise<void> {
    const adapters = this.adapterRegistry.getAllActive();
    
    for (const adapterId of adapters) {
      // Liveness probe: every 5 minutes
      await this.queue.add(
        `liveness-${adapterId}`,
        { checkType: 'liveness', adapterId },
        {
          repeat: {
            every: 5 * 60 * 1000, // 5 minutes
          },
        }
      );
      
      // Freshness probe: every 30 minutes
      await this.queue.add(
        `freshness-${adapterId}`,
        { checkType: 'freshness', adapterId },
        {
          repeat: {
            every: 30 * 60 * 1000, // 30 minutes
          },
        }
      );
      
      // Canary acquisition: every 2 hours
      await this.queue.add(
        `canary-${adapterId}`,
        { checkType: 'canary', adapterId },
        {
          repeat: {
            every: 2 * 60 * 60 * 1000, // 2 hours
          },
        }
      );
    }
    
    // Confidence trend monitor: every hour (global)
    await this.queue.add(
      'confidence-trend',
      { checkType: 'confidence_trend' },
      {
        repeat: {
          every: 60 * 60 * 1000, // 1 hour
        },
      }
    );
    
    await this.auditLogger.log({
      event: 'SYNTHETIC_CHECKS_SCHEDULED',
      adapterCount: adapters.length,
      severity: 'info',
    });
  }
}
