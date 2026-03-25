import { CouncilAdapter, AdapterMetadata, AdapterHealth } from './interface.js';
import { logger } from '../../observability/logger.js';
import { metrics } from '../../observability/metrics.js';

/**
 * Abstract base adapter with common functionality
 * - Logging
 * - Metrics
 * - Error handling
 * - Evidence storage
 * - Kill switch checking
 */
export abstract class BaseAdapter implements CouncilAdapter {
  abstract readonly metadata: AdapterMetadata;

  protected logger = logger;

  /**
   * Check kill switch for this adapter
   */
  protected async checkKillSwitch(): Promise<boolean> {
    const envVar = `ADAPTER_KILL_SWITCH_${this.metadata.councilId.toUpperCase().replace(/-/g, '_')}`;
    const killSwitch = process.env[envVar] === 'true';
    
    if (killSwitch) {
      this.logger.warn({ councilId: this.metadata.councilId }, 'Adapter kill switch enabled');
    }
    
    return killSwitch;
  }

  /**
   * Store evidence to blob storage
   */
  protected async storeEvidence(
    councilId: string,
    propertyQuery: unknown,
    evidence: string | Buffer,
    contentType: string
  ): Promise<string> {
    // TODO: Upload to Azure Blob Storage
    // Return blob reference ID
    const evidenceRef = `${councilId}/${Date.now()}-${Math.random().toString(36)}`;
    this.logger.debug({ councilId, evidenceRef }, 'Evidence stored');
    return evidenceRef;
  }

  /**
   * Record metrics for adapter execution
   */
  protected recordMetrics(success: boolean, durationMs: number): void {
    metrics.recordAdapterExecution(this.metadata.councilId, success, durationMs);
  }

  abstract healthCheck(): Promise<AdapterHealth>;
  abstract getCollectionSchedule(query: any): Promise<any>;
  abstract cleanup(): Promise<void>;
}
