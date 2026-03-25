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
      councilId: this.councilId,
      status: HealthStatus.DEGRADED,
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
      councilId: this.councilId,
      riskLevel: ExecutionRiskLevel.CRITICAL,
      requiresBrowserAutomation: true,
      executesJavaScript: true,
      externalDomains: ['www.southampton.gov.uk'],
      handlesCredentials: false,
      securityConcerns: [
        'Adapter disabled — Incapsula CDN blocks automated access',
        'CAPTCHA challenges present',
        'Manual review required to determine if workaround exists',
      ],
      lastSecurityReview: '2026-03-25',
      isSandboxed: true,
      networkIsolation: 'allowlist_only',
      requiredPermissions: ['network.http', 'browser.automation'],
    };
  }

  private unavailableResponse(correlationId: string): any {
    const metadata: AcquisitionMetadata = {
      attemptId: `southampton-unavailable-${Date.now()}`,
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
      errorMessage: 'Incapsula/Imperva bot protection active — manual review required. This council has been postponed due to CAPTCHA challenges and aggressive bot detection.',
      metadata,
      warnings: ['Adapter postponed — automated access blocked by CDN'],
    };
  }
}
