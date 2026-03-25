/**
 * New Forest District Council Adapter — POSTPONED
 * 
 * Status: POSTPONED (Upstream bot protection active)
 * Reason: 403 Forbidden responses indicate aggressive bot protection (likely Incapsula/Imperva).
 *         Automated access blocked at network level. Manual review required.
 * 
 * See: docs/discovery/new-forest-postponed.md
 * 
 * @module adapters/new-forest
 */

import type {
  CouncilAdapter,
  CouncilCapabilities,
  PropertyLookupInput,
  PropertyIdentity,
  AddressCandidateResult,
  CollectionServiceResult,
  CollectionEventResult,
  DateRange,
  AdapterHealth,
  AdapterSecurityProfile,
  AcquisitionMetadata,
} from '../base/adapter.interface.js';
import {
  LookupMethod,
  FailureCategory,
  ExecutionRiskLevel,
  HealthStatus,
  ServiceType,
} from '../base/adapter.interface.js';

export class NewForestAdapter implements CouncilAdapter {
  readonly councilId = 'new-forest';

  async discoverCapabilities(): Promise<CouncilCapabilities> {
    return {
      councilId: this.councilId,
      councilName: 'New Forest District Council',
      councilWebsite: 'https://www.newforest.gov.uk',
      supportsAddressLookup: false,
      supportsCollectionServices: false,
      supportsCollectionEvents: false,
      providesUprn: false,
      primaryLookupMethod: LookupMethod.UNSUPPORTED,
      maxEventRangeDays: 0,
      supportedServiceTypes: [],
      limitations: [
        'Upstream bot protection active (403 Forbidden)',
        'Automated access blocked at network level',
        'Adapter postponed pending manual review',
      ],
      rateLimitRpm: 0,
      adapterLastUpdated: '2026-03-25',
      isProductionReady: false,
    };
  }

  async resolveAddresses(input: PropertyLookupInput): Promise<AddressCandidateResult> {
    return this.unavailableResponse(input.correlationId);
  }

  async getCollectionEvents(
    property: PropertyIdentity,
    range?: DateRange
  ): Promise<CollectionEventResult> {
    return this.unavailableResponse(property.correlationId);
  }

  async getCollectionServices(property: PropertyIdentity): Promise<CollectionServiceResult> {
    return this.unavailableResponse(property.correlationId);
  }

  async verifyHealth(): Promise<AdapterHealth> {
    return {
      councilId: this.councilId,
      status: HealthStatus.DEGRADED,
      checkedAt: new Date().toISOString(),
      upstreamReachable: false,
      lastSuccessAt: null,
      lastFailureAt: new Date().toISOString(),
      lastFailureCategory: FailureCategory.BOT_DETECTION,
      lastFailureMessage: 'Upstream bot protection active — automated access blocked',
      successRate24h: 0,
      avgResponseTimeMs24h: 0,
      acquisitionCount24h: 0,
      schemaDriftDetected: false,
    };
  }

  async securityProfile(): Promise<AdapterSecurityProfile> {
    return {
      councilId: this.councilId,
      riskLevel: ExecutionRiskLevel.CRITICAL,
      requiresBrowserAutomation: true,
      executesJavaScript: true,
      externalDomains: ['www.newforest.gov.uk'],
      handlesCredentials: false,
      securityConcerns: [
        'Adapter disabled — upstream blocks automated access',
        'Manual review required to determine if access is possible',
      ],
      lastSecurityReview: '2026-03-25',
      isSandboxed: true,
      networkIsolation: 'allowlist_only',
      requiredPermissions: ['network.http', 'browser.automation'],
    };
  }

  private unavailableResponse(correlationId: string): any {
    const metadata: AcquisitionMetadata = {
      attemptId: `new-forest-unavailable-${Date.now()}`,
      adapterId: this.councilId,
      councilId: this.councilId,
      lookupMethod: LookupMethod.UNSUPPORTED,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 0,
      httpRequestCount: 0,
      bytesReceived: 0,
      usedBrowserAutomation: false,
      adapterVersion: '0.1.0',
      executionEnvironment: 'disabled',
      riskLevel: ExecutionRiskLevel.CRITICAL,
      cacheHit: false,
    };

    return {
      success: false,
      failureCategory: FailureCategory.BOT_DETECTION,
      errorMessage: 'Upstream bot protection active — manual review required. This council has been postponed due to 403 Forbidden responses indicating aggressive bot detection.',
      metadata,
      warnings: ['Adapter postponed — automated access not possible'],
    };
  }
}
