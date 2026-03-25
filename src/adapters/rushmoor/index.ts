/**
 * Rushmoor Borough Council Adapter
 * 
 * Production-quality adapter using direct API access (discovered from UKBinCollectionData community project).
 * The council provides a JSON API disguised as HTML that returns collection data by UPRN.
 * 
 * DISCOVERY: UKBinCollectionData found the actual API endpoint:
 * https://www.rushmoor.gov.uk/Umbraco/Api/BinLookUpWorkAround/Get?selectedAddress={uprn}
 * 
 * Response format: HTML page with JSON embedded in <p> tag within <lxml> wrapper
 * 
 * @module adapters/rushmoor
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
  AddressCandidate,
  BaseResult,
  CollectionEvent,
  CollectionService,
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

const ADAPTER_VERSION = '2.0.0';
const RUSHMOOR_API_ENDPOINT = 'https://www.rushmoor.gov.uk/Umbraco/Api/BinLookUpWorkAround/Get';
const REQUEST_TIMEOUT_MS = 30000;

interface RushmoorApiResponse {
  NextCollection: {
    RefuseCollectionBinDate?: string; // ISO format YYYY-MM-DDTHH:MM:SS
    RefuseBinExceptionMessage?: string;
    RecyclingCollectionDate?: string; // ISO format
    RecyclingExceptionMessage?: string;
    GardenWasteCollectionDate?: string; // ISO format
    GardenWasteExceptionMessage?: string;
    FoodWasteCollectionDate?: string; // ISO format
    FoodWasteExceptionMessage?: string;
  };
}

export class RushmoorAdapter implements CouncilAdapter {
  readonly councilId = 'rushmoor';
  
  async discoverCapabilities(): Promise<CouncilCapabilities> {
    return {
      councilId: this.councilId,
      councilName: 'Rushmoor Borough Council',
      councilWebsite: 'https://www.rushmoor.gov.uk',
      supportsAddressLookup: false, // API requires UPRN
      supportsCollectionServices: true,
      supportsCollectionEvents: true,
      providesUprn: true,
      primaryLookupMethod: LookupMethod.API,
      maxEventRangeDays: 365,
      supportedServiceTypes: [
        ServiceType.GENERAL_WASTE,
        ServiceType.RECYCLING,
        ServiceType.FOOD_WASTE,
        ServiceType.GARDEN_WASTE,
      ],
      limitations: [
        'Requires UPRN input',
        'API returns JSON wrapped in HTML response',
        'May include exception messages for skipped collections',
      ],
      rateLimitRpm: 30,
      adapterLastUpdated: '2026-03-25',
      isProductionReady: true,
    };
  }
  
  async resolveAddresses(input: PropertyLookupInput): Promise<AddressCandidateResult> {
    const metadata = this.createMetadata();
    
    // Rushmoor API requires UPRN
    if (!input.uprn) {
      return this.failureResult(
        metadata,
        FailureCategory.NOT_FOUND,
        'Rushmoor adapter requires UPRN. Use external UPRN resolution service first.'
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
      warnings: ['Rushmoor requires UPRN — address search not supported'],
      securityWarnings: [],
      fromCache: false,
    };
  }
  
  async getCollectionServices(input: PropertyIdentity): Promise<CollectionServiceResult> {
    const metadata = this.createMetadata();
    
    if (!input.uprn && !input.councilLocalId) {
      return this.failureResult(
        metadata,
        FailureCategory.VALIDATION_ERROR,
        'UPRN or councilLocalId is required for Rushmoor lookups'
      );
    }
    
    const uprn = input.uprn || input.councilLocalId;
    
    try {
      const response = await this.fetchRushmoorData(uprn, metadata);
      
      if (!response.success || !response.data) {
        return this.failureResult(
          metadata,
          response.failureCategory || FailureCategory.UNKNOWN,
          response.errorMessage || 'Failed to fetch data'
        );
      }
      
      const services = this.parseCollectionServices(response.data);
      
      metadata.completedAt = new Date().toISOString();
      metadata.durationMs = Date.now() - new Date(metadata.startedAt).getTime();
      
      return {
        success: true,
        data: services,
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
  
  async getCollectionEvents(
    input: PropertyIdentity,
    range?: DateRange
  ): Promise<CollectionEventResult> {
    const metadata = this.createMetadata();
    
    if (!input.uprn && !input.councilLocalId) {
      return this.failureResult(
        metadata,
        FailureCategory.VALIDATION_ERROR,
        'UPRN or councilLocalId is required for Rushmoor lookups'
      );
    }
    
    const uprn = input.uprn || input.councilLocalId;
    
    try {
      const response = await this.fetchRushmoorData(uprn, metadata);
      
      if (!response.success || !response.data) {
        return this.failureResult(
          metadata,
          response.failureCategory || FailureCategory.UNKNOWN,
          response.errorMessage || 'Failed to fetch data'
        );
      }
      
      let events = this.parseCollectionEvents(response.data);
      
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
  
  async verifyHealth(): Promise<AdapterHealth> {
    const testUprn = '100062004567'; // Example Rushmoor UPRN
    const metadata = this.createMetadata();
    
    try {
      const response = await this.fetchRushmoorData(testUprn, metadata);
      
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
      riskLevel: ExecutionRiskLevel.LOW,
      requiresBrowserAutomation: false,
      executesJavaScript: false,
      externalDomains: ['rushmoor.gov.uk'],
      handlesCredentials: false,
      securityConcerns: [
        'JSON embedded in HTML response — requires HTML parsing first',
        'No authentication — UPRN enumeration risk',
        'API endpoint name contains "WorkAround" suggesting unofficial status',
      ],
      lastSecurityReview: '2026-03-25',
      isSandboxed: true,
      networkIsolation: 'allowlist_only',
      requiredPermissions: ['network_egress_https'],
    };
  }
  
  /**
   * Fetch collection data from Rushmoor API.
   * Response is HTML with JSON embedded in a <p> tag.
   */
  private async fetchRushmoorData(
    uprn: string,
    metadata: AcquisitionMetadata
  ): Promise<BaseResult<RushmoorApiResponse>> {
    const url = `${RUSHMOOR_API_ENDPOINT}?selectedAddress=${encodeURIComponent(uprn)}`;
    const warnings: string[] = [];
    const securityWarnings: string[] = [];
    
    try {
      // Check for kill switch
      if (process.env.ADAPTER_KILL_SWITCH_RUSHMOOR === 'true') {
        throw new Error('Adapter disabled via kill switch');
      }
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-GB,en;q=0.9',
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeout);
      
      metadata.httpRequestCount = 1;
      metadata.bytesReceived = parseInt(response.headers.get('content-length') || '0', 10);
      
      // Handle HTTP errors
      if (!response.ok) {
        if (response.status === 404) {
          return this.failureResult(
            metadata,
            FailureCategory.NOT_FOUND,
            `UPRN ${uprn} not found at Rushmoor`
          );
        }
        
        if (response.status >= 500) {
          return this.failureResult(
            metadata,
            FailureCategory.SERVER_ERROR,
            `Rushmoor server error: ${response.status}`
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
      
      // Parse JSON from HTML
      // Community project uses BeautifulSoup to find <p> tag, then JSON.parse
      const jsonMatch = html.match(/<p>(.*?)<\/p>/s);
      if (!jsonMatch || !jsonMatch[1]) {
        warnings.push('JSON data not found in expected <p> tag — schema may have changed');
        return this.failureResult(
          metadata,
          FailureCategory.SCHEMA_DRIFT,
          'Unable to extract JSON from HTML response. The API structure may have changed.'
        );
      }
      
      let data: RushmoorApiResponse;
      try {
        data = JSON.parse(jsonMatch[1]);
      } catch (parseError) {
        return this.failureResult(
          metadata,
          FailureCategory.SCHEMA_DRIFT,
          `Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`
        );
      }
      
      // Validate response structure
      if (!data.NextCollection) {
        warnings.push('NextCollection object not found in response — may indicate no collections found');
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
      
      const hasData = data.NextCollection && (
        data.NextCollection.RefuseCollectionBinDate ||
        data.NextCollection.RecyclingCollectionDate ||
        data.NextCollection.GardenWasteCollectionDate ||
        data.NextCollection.FoodWasteCollectionDate
      );
      
      return {
        success: true,
        data,
        acquisitionMetadata: metadata,
        sourceEvidenceRef: evidenceRef,
        confidence: hasData ? 0.9 : 0.3,
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
   * Parse collection events from Rushmoor API response.
   */
  private parseCollectionEvents(response: RushmoorApiResponse): CollectionEvent[] {
    const events: CollectionEvent[] = [];
    const nc = response.NextCollection;
    
    if (!nc) return events;
    
    // Green general waste bin
    if (nc.RefuseCollectionBinDate) {
      const date = new Date(nc.RefuseCollectionBinDate);
      const isoDate = date.toISOString().split('T')[0];
      let binType = 'Green general waste bin';
      if (nc.RefuseBinExceptionMessage) {
        binType += ` (${nc.RefuseBinExceptionMessage})`;
      }
      
      events.push({
        eventId: `${this.councilId}-${isoDate}-refuse`,
        serviceId: 'refuse',
        serviceType: ServiceType.GENERAL_WASTE,
        collectionDate: isoDate,
        isConfirmed: true,
        isRescheduled: false,
        isPast: date < new Date(),
      });
    }
    
    // Blue recycling bin
    if (nc.RecyclingCollectionDate) {
      const date = new Date(nc.RecyclingCollectionDate);
      const isoDate = date.toISOString().split('T')[0];
      let binType = 'Blue recycling bin';
      if (nc.RecyclingExceptionMessage) {
        binType += ` (${nc.RecyclingExceptionMessage})`;
      }
      
      events.push({
        eventId: `${this.councilId}-${isoDate}-recycling`,
        serviceId: 'recycling',
        serviceType: ServiceType.RECYCLING,
        collectionDate: isoDate,
        isConfirmed: true,
        isRescheduled: false,
        isPast: date < new Date(),
      });
    }
    
    // Brown garden waste bin
    if (nc.GardenWasteCollectionDate) {
      const date = new Date(nc.GardenWasteCollectionDate);
      const isoDate = date.toISOString().split('T')[0];
      let binType = 'Brown garden waste bin';
      if (nc.GardenWasteExceptionMessage) {
        binType += ` (${nc.GardenWasteExceptionMessage})`;
      }
      
      events.push({
        eventId: `${this.councilId}-${isoDate}-garden`,
        serviceId: 'garden',
        serviceType: ServiceType.GARDEN_WASTE,
        collectionDate: isoDate,
        isConfirmed: true,
        isRescheduled: false,
        isPast: date < new Date(),
      });
    }
    
    // Black food waste bin
    if (nc.FoodWasteCollectionDate) {
      const date = new Date(nc.FoodWasteCollectionDate);
      const isoDate = date.toISOString().split('T')[0];
      let binType = 'Black food waste bin';
      if (nc.FoodWasteExceptionMessage) {
        binType += ` (${nc.FoodWasteExceptionMessage})`;
      }
      
      events.push({
        eventId: `${this.councilId}-${isoDate}-food`,
        serviceId: 'food',
        serviceType: ServiceType.FOOD_WASTE,
        collectionDate: isoDate,
        isConfirmed: true,
        isRescheduled: false,
        isPast: date < new Date(),
      });
    }
    
    // Sort by date ascending
    events.sort((a, b) => a.collectionDate.localeCompare(b.collectionDate));
    
    return events;
  }
  
  /**
   * Parse collection services from Rushmoor API response.
   */
  private parseCollectionServices(response: RushmoorApiResponse): CollectionService[] {
    const services: CollectionService[] = [];
    const nc = response.NextCollection;
    
    if (!nc) return services;
    
    if (nc.RefuseCollectionBinDate) {
      services.push({
        serviceId: 'refuse',
        serviceType: ServiceType.GENERAL_WASTE,
        serviceNameRaw: 'Green general waste bin',
        serviceNameDisplay: 'Green general waste bin',
        isActive: true,
        requiresSubscription: false,
        frequency: 'weekly',
      });
    }
    
    if (nc.RecyclingCollectionDate) {
      services.push({
        serviceId: 'recycling',
        serviceType: ServiceType.RECYCLING,
        serviceNameRaw: 'Blue recycling bin',
        serviceNameDisplay: 'Blue recycling bin',
        isActive: true,
        requiresSubscription: false,
        frequency: 'weekly',
      });
    }
    
    if (nc.GardenWasteCollectionDate) {
      services.push({
        serviceId: 'garden',
        serviceType: ServiceType.GARDEN_WASTE,
        serviceNameRaw: 'Brown garden waste bin',
        serviceNameDisplay: 'Brown garden waste bin',
        isActive: true,
        requiresSubscription: true, // Garden waste typically requires subscription
        frequency: 'fortnightly',
      });
    }
    
    if (nc.FoodWasteCollectionDate) {
      services.push({
        serviceId: 'food',
        serviceType: ServiceType.FOOD_WASTE,
        serviceNameRaw: 'Black food waste bin',
        serviceNameDisplay: 'Black food waste bin',
        isActive: true,
        requiresSubscription: false,
        frequency: 'weekly',
      });
    }
    
    return services;
  }
  
  private createMetadata(): AcquisitionMetadata {
    return {
      attemptId: uuidv4(),
      adapterId: this.councilId,
      councilId: this.councilId,
      lookupMethod: LookupMethod.API,
      startedAt: new Date().toISOString(),
      completedAt: '',
      durationMs: 0,
      httpRequestCount: 0,
      bytesReceived: 0,
      usedBrowserAutomation: false,
      adapterVersion: ADAPTER_VERSION,
      executionEnvironment: process.env.HOSTNAME || 'unknown',
      riskLevel: ExecutionRiskLevel.LOW,
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
