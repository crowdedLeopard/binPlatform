/**
 * Southampton City Council Adapter — POSTPONED
 * 
 * Status: POSTPONED (Incapsula/Imperva bot protection active)
 * Reason: Incapsula CDN with aggressive bot detection blocks automated access.
 *         CAPTCHA challenges and 403 responses make reliable automation infeasible.
 * 
 * See: docs/discovery/southampton-postponed.md
 * 
 * @module adapters/southampton
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

export class SouthamptonAdapter implements CouncilAdapter {
  readonly councilId = 'southampton';

  async discoverCapabilities(): Promise<CouncilCapabilities> {
    return {
      councilId: this.councilId,
      councilName: 'Southampton City Council',
      councilWebsite: 'https://www.southampton.gov.uk',
      supportsAddressLookup: false,
      supportsCollectionServices: false,
      supportsCollectionEvents: false,
      providesUprn: false,
      primaryLookupMethod: LookupMethod.UNSUPPORTED,
      maxEventRangeDays: 0,
      supportedServiceTypes: [],
      limitations: [
        'Incapsula/Imperva CDN with bot protection active',
        'CAPTCHA challenges block automated access',
        'Adapter postponed pending security review',
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
      status: HealthStatus.UNAVAILABLE,
      checkedAt: new Date().toISOString(),
      upstreamReachable: false,
      lastSuccessAt: null,
      lastFailureAt: new Date().toISOString(),
      lastFailureCategory: FailureCategory.BOT_DETECTION,
      lastFailureMessage: 'Incapsula/Imperva bot protection active — CAPTCHA challenges prevent automation',
      successRate24h: 0,
      avgResponseTimeMs24h: 0,
      acquisitionCount24h: 0,
      schemaDriftDetected: false,
    };
  }

  async securityProfile(): Promise<AdapterSecurityProfile> {
    return {
      riskLevel: ExecutionRiskLevel.CRITICAL,
      requiresBrowserAutomation: true,
      externalDomains: ['www.southampton.gov.uk'],
      lastSecurityReview: '2026-03-25',
      knownVulnerabilities: [],
      mitigations: [
        'Adapter disabled — Incapsula CDN blocks automated access',
        'CAPTCHA challenges present',
        'Manual review required to determine if workaround exists',
      ],
    };
  }

  private unavailableResponse(correlationId: string): any {
    const metadata: AcquisitionMetadata = {
      acquiredAt: new Date().toISOString(),
      acquisitionDurationMs: 0,
      retryCount: 0,
      correlationId,
      upstreamRequestId: null,
      cacheHit: false,
      evidenceCaptured: false,
    };

    return {
      success: false,
      failureCategory: FailureCategory.BOT_DETECTION,
      errorMessage: 'Incapsula/Imperva bot protection active — manual review required. This council has been postponed due to CAPTCHA challenges and aggressive bot detection.',
      metadata,
      warnings: ['Adapter postponed — automated access blocked by CDN'],
    };
  }
}
