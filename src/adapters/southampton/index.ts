/**
 * Southampton City Council Adapter
 * 
 * Southampton has an Incapsula-protected frontend but a working backend endpoint.
 * Uses the waste-calendar endpoint which accepts UPRN parameters.
 * 
 * DISCOVERY: UKBinCollectionData project found working endpoint at
 * https://www.southampton.gov.uk/whereilive/waste-calendar?UPRN=<uprn>
 * 
 * This endpoint bypasses the Incapsula-protected search form.
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
  BaseResult,
  CollectionEvent,
  AddressCandidate,
} from '../base/adapter.interface.js';
import {
  LookupMethod,
  FailureCategory,
  ExecutionRiskLevel,
  HealthStatus,
  ServiceType,
} from '../base/adapter.interface.js';
import { v4 as uuidv4 } from 'uuid';
import { storeEvidence } from '../../storage/evidence/store-evidence.js';

const ADAPTER_VERSION = '1.0.0';
const SOUTHAMPTON_CALENDAR_ENDPOINT = 'https://www.southampton.gov.uk/whereilive/waste-calendar';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const REQUEST_TIMEOUT_MS = 30000;

// Regex pattern to extract collection data from HTML calendar view
// Matches: "Glass" or "Recycling" etc followed by a date in MM/DD/YYYY format
const COLLECTION_PATTERN = /(Glass|Recycling|General Waste|Garden Waste).*?([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})/g;

export class SouthamptonAdapter implements CouncilAdapter {
  readonly councilId = 'southampton';

  async discoverCapabilities(): Promise<CouncilCapabilities> {
    return {
      councilId: this.councilId,
      councilName: 'Southampton City Council',
      councilWebsite: 'https://www.southampton.gov.uk',
      supportsAddressLookup: false,
      supportsCollectionServices: false,
      supportsCollectionEvents: true,
      providesUprn: true,
      primaryLookupMethod: LookupMethod.HIDDEN_JSON,
      maxEventRangeDays: 365,
      supportedServiceTypes: [
        ServiceType.GENERAL_WASTE,
        ServiceType.RECYCLING,
        ServiceType.GARDEN_WASTE,
        ServiceType.GLASS,
      ],
      limitations: [
        'Requires UPRN input (no postcode search)',
        'Frontend has Incapsula protection but backend endpoint is accessible',
        'HTML parsing required (calendar view embedded in page)',
      ],
      rateLimitRpm: 20,
      adapterLastUpdated: '2026-03-25',
      isProductionReady: true,
    };
  }

  async resolveAddresses(input: PropertyLookupInput): Promise<AddressCandidateResult> {
    const metadata = this.createMetadata();
    
    // Southampton requires UPRN - no address search capability
    if (!input.uprn) {
      return this.failureResult(
        metadata,
        FailureCategory.NOT_FOUND,
        'Southampton adapter requires UPRN. Use external UPRN resolution service first.'
      );
    }
    
    metadata.completedAt = new Date().toISOString();
    metadata.durationMs = Date.now() - new Date(metadata.startedAt).getTime();
    
    const candidate: AddressCandidate = {
      councilLocalId: input.uprn,
      uprn: input.uprn,
      addressRaw: input.addressFragment || `UPRN ${input.uprn}`,
      addressNormalised: `UPRN ${input.uprn}`,
      addressDisplay: input.addressFragment || `Property ${input.uprn}`,
      postcode: input.postcode,
      confidence: 1.0,
    };
    
    return {
      success: true,
      data: [candidate],
      acquisitionMetadata: metadata,
      confidence: 1.0,
      warnings: ['Southampton requires UPRN — address search not supported'],
      securityWarnings: [],
      fromCache: false,
    };
  }

  async getCollectionEvents(
    input: PropertyIdentity,
    range?: DateRange
  ): Promise<CollectionEventResult> {
    const metadata = this.createMetadata();
    
    if (!input.uprn && !input.councilLocalId) {
      return this.failureResult(
        metadata,
        FailureCategory.VALIDATION_ERROR,
        'UPRN or councilLocalId is required for Southampton lookups'
      );
    }
    
    const uprn = input.uprn || input.councilLocalId;
    
    try {
      const response = await this.fetchSouthamptonData(uprn, metadata);
      
      if (!response.success || !response.data) {
        return this.failureResult(
          metadata,
          response.failureCategory || FailureCategory.UNKNOWN,
          response.errorMessage || 'Failed to fetch data'
        );
      }
      
      let events = response.data;
      
      // Filter by date range if provided
      if (range) {
        events = events.filter(event => 
          event.collectionDate >= range.from && event.collectionDate <= range.to
        );
      }
      
      metadata.completedAt = new Date().toISOString();
      metadata.durationMs = Date.now() - new Date(metadata.startedAt).getTime();
      
      return {
        success: true,
        data: events,
        acquisitionMetadata: metadata,
        sourceEvidenceRef: response.sourceEvidenceRef,
        confidence: response.confidence,
        warnings: response.warnings,
        securityWarnings: response.securityWarnings,
        fromCache: false,
      };
    } catch (error) {
      return this.handleError(metadata, error);
    }
  }

  async getCollectionServices(input: PropertyIdentity): Promise<CollectionServiceResult> {
    const metadata = this.createMetadata();
    
    return this.failureResult(
      metadata,
      FailureCategory.ADAPTER_ERROR,
      'Southampton adapter does not support service enumeration - only collection events'
    );
  }

  async verifyHealth(): Promise<AdapterHealth> {
    const testUprn = '100062374395'; // Example Southampton UPRN
    const metadata = this.createMetadata();
    
    try {
      const response = await this.fetchSouthamptonData(testUprn, metadata);
      
      return {
        councilId: this.councilId,
        status: response.success ? HealthStatus.HEALTHY : HealthStatus.UNHEALTHY,
        lastSuccessAt: response.success ? new Date().toISOString() : undefined,
        lastFailureAt: !response.success ? new Date().toISOString() : undefined,
        lastFailureCategory: response.failureCategory,
        lastFailureMessage: response.errorMessage,
        successRate24h: response.success ? 1.0 : 0.0,
        avgResponseTimeMs24h: metadata.durationMs || 0,
        acquisitionCount24h: 1,
        checkedAt: new Date().toISOString(),
        upstreamReachable: response.success || 
          response.failureCategory !== FailureCategory.NETWORK_ERROR,
        schemaDriftDetected: false,
      };
    } catch (error) {
      return {
        councilId: this.councilId,
        status: HealthStatus.UNHEALTHY,
        lastFailureAt: new Date().toISOString(),
        lastFailureCategory: FailureCategory.UNKNOWN,
        lastFailureMessage: error instanceof Error ? error.message : 'Unknown error',
        successRate24h: 0.0,
        avgResponseTimeMs24h: 0,
        acquisitionCount24h: 0,
        checkedAt: new Date().toISOString(),
        upstreamReachable: false,
        schemaDriftDetected: false,
      };
    }
  }

  async securityProfile(): Promise<AdapterSecurityProfile> {
    return {
      councilId: this.councilId,
      riskLevel: ExecutionRiskLevel.MEDIUM,
      requiresBrowserAutomation: false,
      executesJavaScript: false,
      externalDomains: ['www.southampton.gov.uk'],
      handlesCredentials: false,
      securityConcerns: [
        'Incapsula protection on frontend (but not on this endpoint)',
        'HTML parsing required from calendar view',
        'No authentication — UPRN enumeration risk',
        'Rate limiting essential to avoid triggering Incapsula',
      ],
      lastSecurityReview: '2026-03-25',
      isSandboxed: true,
      networkIsolation: 'allowlist_only',
      requiredPermissions: ['network_egress_https'],
    };
  }

  /**
   * Fetch collection data from Southampton waste calendar endpoint.
   * Returns HTML page with calendar view embedded.
   */
  private async fetchSouthamptonData(
    uprn: string,
    metadata: AcquisitionMetadata
  ): Promise<BaseResult<CollectionEvent[]>> {
    const url = `${SOUTHAMPTON_CALENDAR_ENDPOINT}?UPRN=${encodeURIComponent(uprn)}`;
    const warnings: string[] = [];
    const securityWarnings: string[] = [];
    
    try {
      // Check for kill switch
      if (process.env.ADAPTER_KILL_SWITCH_SOUTHAMPTON === 'true') {
        throw new Error('Adapter disabled via kill switch');
      }
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      
      // Use realistic headers to avoid Incapsula detection
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-GB,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Cache-Control': 'max-age=0',
          'Referer': 'https://www.southampton.gov.uk',
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeout);
      
      metadata.httpRequestCount = 1;
      metadata.bytesReceived = parseInt(response.headers.get('content-length') || '0', 10);
      
      // Handle HTTP errors
      if (!response.ok) {
        if (response.status === 403) {
          securityWarnings.push('Incapsula protection triggered (403 Forbidden)');
          return this.failureResult(
            metadata,
            FailureCategory.BOT_DETECTION,
            'Incapsula protection triggered — endpoint may have been restricted'
          );
        }
        
        if (response.status === 404) {
          return this.failureResult(
            metadata,
            FailureCategory.NOT_FOUND,
            `UPRN ${uprn} not found at Southampton`
          );
        }
        
        if (response.status >= 500) {
          return this.failureResult(
            metadata,
            FailureCategory.SERVER_ERROR,
            `Southampton server error: ${response.status}`
          );
        }
        
        return this.failureResult(
          metadata,
          FailureCategory.CLIENT_ERROR,
          `HTTP ${response.status}: ${response.statusText}`
        );
      }
      
      // Get HTML response
      const html = await response.text();
      
      // Check for Incapsula block page
      if (html.includes('/_Incapsula_Resource') || html.includes('noindex,nofollow')) {
        securityWarnings.push('Incapsula block page detected');
        return this.failureResult(
          metadata,
          FailureCategory.BOT_DETECTION,
          'Incapsula CDN blocked request — consider browser automation or reduce request rate'
        );
      }
      
      // Extract calendar view section (to avoid duplicate matches)
      const calendarMatch = html.match(/#calendar1.*?listView/s);
      if (!calendarMatch) {
        warnings.push('Calendar view not found in expected format — schema may have changed');
        return this.failureResult(
          metadata,
          FailureCategory.SCHEMA_DRIFT,
          'Unable to find calendar view in response. The council website structure may have changed.'
        );
      }
      
      const calendarSection = calendarMatch[0];
      
      // Parse collection events from calendar
      const events = this.parseCollectionEvents(calendarSection, uprn);
      
      if (events.length === 0) {
        warnings.push('No collection events found — UPRN may be invalid or calendar empty');
      }
      
      // Store raw evidence
      const evidenceMetadata = {
        councilId: this.councilId,
        attemptId: metadata.attemptId,
        evidenceType: 'html' as const,
        capturedAt: new Date().toISOString(),
        propertyIdentifier: uprn,
        containsPii: false,
      };
      
      const evidenceResult = await storeEvidence(
        this.councilId,
        'html',
        html,
        evidenceMetadata
      );
      const evidenceRef = evidenceResult.evidenceRef;
      
      metadata.completedAt = new Date().toISOString();
      metadata.durationMs = Date.now() - new Date(metadata.startedAt).getTime();
      
      return {
        success: true,
        data: events,
        acquisitionMetadata: metadata,
        sourceEvidenceRef: evidenceRef,
        confidence: events.length > 0 ? 0.8 : 0.3,
        warnings,
        securityWarnings,
        fromCache: false,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return this.failureResult(
          metadata,
          FailureCategory.TIMEOUT,
          `Request timeout after ${REQUEST_TIMEOUT_MS}ms`
        );
      }
      
      if (error instanceof TypeError && error.message.includes('fetch')) {
        return this.failureResult(
          metadata,
          FailureCategory.NETWORK_ERROR,
          `Network error: ${error.message}`
        );
      }
      
      return this.failureResult(
        metadata,
        FailureCategory.ADAPTER_ERROR,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Parse collection events from Southampton HTML calendar.
   * Matches pattern: "Glass" or "Recycling" etc followed by date MM/DD/YYYY
   */
  private parseCollectionEvents(html: string, uprn: string): CollectionEvent[] {
    const events: CollectionEvent[] = [];
    const matches = html.matchAll(COLLECTION_PATTERN);
    
    for (const match of matches) {
      const serviceType = match[1];
      const dateStr = match[2]; // MM/DD/YYYY format
      
      try {
        // Parse MM/DD/YYYY to ISO date
        const [month, day, year] = dateStr.split('/').map(Number);
        const date = new Date(year, month - 1, day);
        const isoDate = date.toISOString().split('T')[0];
        
        // Map service type to enum
        const normalizedType = this.normalizeServiceType(serviceType);
        
        events.push({
          eventId: `${uprn}-${isoDate}-${normalizedType}`,
          serviceId: normalizedType,
          serviceType: normalizedType,
          collectionDate: isoDate,
          isConfirmed: true,
          isRescheduled: false,
          isPast: date < new Date(),
        });
      } catch (error) {
        // Skip invalid dates
        console.warn(`[SOUTHAMPTON] Failed to parse date: ${dateStr}`);
      }
    }
    
    // Sort by date ascending
    events.sort((a, b) => a.collectionDate.localeCompare(b.collectionDate));
    
    return events;
  }

  /**
   * Normalize Southampton service names to standard ServiceType enum
   */
  private normalizeServiceType(serviceName: string): ServiceType {
    const lower = serviceName.toLowerCase();
    
    if (lower.includes('glass')) return ServiceType.GLASS;
    if (lower.includes('recycling')) return ServiceType.RECYCLING;
    if (lower.includes('garden')) return ServiceType.GARDEN_WASTE;
    if (lower.includes('general') || lower.includes('waste')) return ServiceType.GENERAL_WASTE;
    
    return ServiceType.OTHER;
  }

  private createMetadata(): AcquisitionMetadata {
    return {
      attemptId: uuidv4(),
      adapterId: this.councilId,
      councilId: this.councilId,
      lookupMethod: LookupMethod.HIDDEN_JSON,
      startedAt: new Date().toISOString(),
      completedAt: '',
      durationMs: 0,
      httpRequestCount: 0,
      bytesReceived: 0,
      usedBrowserAutomation: false,
      adapterVersion: ADAPTER_VERSION,
      executionEnvironment: process.env.HOSTNAME || 'unknown',
      riskLevel: ExecutionRiskLevel.MEDIUM,
      cacheHit: false,
    };
  }

  private failureResult<T>(
    metadata: AcquisitionMetadata,
    category: FailureCategory,
    message: string
  ): BaseResult<T> {
    metadata.completedAt = new Date().toISOString();
    metadata.durationMs = Date.now() - new Date(metadata.startedAt).getTime();
    
    return {
      success: false,
      acquisitionMetadata: metadata,
      confidence: 0,
      warnings: [],
      securityWarnings: [],
      failureCategory: category,
      errorMessage: message,
      fromCache: false,
    };
  }

  private handleError<T>(metadata: AcquisitionMetadata, error: unknown): BaseResult<T> {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return this.failureResult(metadata, FailureCategory.ADAPTER_ERROR, message);
  }
}
