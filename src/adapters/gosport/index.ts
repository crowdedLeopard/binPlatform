/**
 * Gosport Borough Council Adapter
 * 
 * Production-quality adapter using Supatrak API discovered via UKBinCollectionData community project.
 * Uses direct API access with hardcoded Basic Auth credentials (public shared access).
 * 
 * DISCOVERY: UKBinCollectionData found the actual Supatrak API endpoint:
 * https://api.supatrak.com/API/JobTrak/NextCollection?postcode={postcode}
 * 
 * Auth: Basic VTAwMDE4XEFQSTpUcjRja2luZzEh (shared public credential for Gosport)
 * 
 * @module adapters/gosport
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
  CollectionService,
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

const ADAPTER_VERSION = '2.0.0';
const SUPATRAK_API_ENDPOINT = 'https://api.supatrak.com/API/JobTrak/NextCollection';
const REQUEST_TIMEOUT_MS = 10000;

// Hardcoded Basic Auth from UKBinCollectionData (shared public credential for Gosport Supatrak instance)
// Credentials: U00018\API:Tr4cking1! (Base64 encoded)
const SUPATRAK_AUTH_HEADER = 'Basic VTAwMDE4XEFQSTpUcjRja2luZzEh';

interface SupatrakCollectionItem {
  WasteType: string;
  NextCollection: string; // ISO 8601 format
}

type SupatrakApiResponse = SupatrakCollectionItem[];

export class GosportAdapter implements CouncilAdapter {
  readonly councilId = 'gosport';
  
  async discoverCapabilities(): Promise<CouncilCapabilities> {
    return {
      councilId: this.councilId,
      councilName: 'Gosport Borough Council',
      councilWebsite: 'https://www.gosport.gov.uk',
      supportsAddressLookup: false, // Postcode-based only, no address resolution
      supportsCollectionServices: true,
      supportsCollectionEvents: true,
      providesUprn: false,
      primaryLookupMethod: LookupMethod.API,
      maxEventRangeDays: 90,
      supportedServiceTypes: [
        ServiceType.GENERAL_WASTE,
        ServiceType.RECYCLING,
        ServiceType.FOOD_WASTE,
        ServiceType.GARDEN_WASTE,
      ],
      limitations: [
        'Requires postcode input (no UPRN)',
        'Uses Supatrak third-party API with shared credentials',
        'Credentials may change without notice',
        'No address-level granularity',
      ],
      rateLimitRpm: 20,
      adapterLastUpdated: '2026-03-25',
      isProductionReady: true,
    };
  }
  
  async resolveAddresses(input: PropertyLookupInput): Promise<AddressCandidateResult> {
    const metadata = this.createMetadata();
    
    // Gosport Supatrak API uses postcode only, no individual address resolution
    if (!input.postcode) {
      return this.failureResult(
        metadata,
        FailureCategory.VALIDATION_ERROR,
        'Gosport adapter requires postcode'
      );
    }
    
    metadata.completedAt = new Date().toISOString();
    metadata.durationMs = Date.now() - new Date(metadata.startedAt).getTime();
    
    // Return postcode as single "address" since API doesn't differentiate
    const candidate: AddressCandidate = {
      councilLocalId: input.postcode.toUpperCase().replace(/\s+/g, ''),
      addressRaw: `Postcode ${input.postcode}`,
      addressNormalised: input.postcode.toUpperCase(),
      addressDisplay: `All properties in ${input.postcode}`,
      postcode: input.postcode,
      confidence: 1.0,
    };
    
    return {
      success: true,
      data: [candidate],
      acquisitionMetadata: metadata,
      confidence: 1.0,
      warnings: ['Gosport API uses postcode only — no address-level granularity'],
      securityWarnings: [],
      fromCache: false,
    };
  }
  
  async getCollectionServices(input: PropertyIdentity): Promise<CollectionServiceResult> {
    const metadata = this.createMetadata();
    
    // localPropertyId is the postcode without spaces (e.g., "PO121BT")
    // Reconstruct the postcode with space before last 3 characters
    const localId = input.councilLocalId;
    if (!localId) {
      return this.failureResult(
        metadata,
        FailureCategory.VALIDATION_ERROR,
        'Property ID is required for Gosport lookups'
      );
    }
    
    const postcode = localId.length > 3
      ? localId.slice(0, -3) + ' ' + localId.slice(-3)
      : localId;
    
    try {
      const response = await this.fetchSupatrakData(postcode, metadata);
      
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
    
    // localPropertyId is the postcode without spaces (e.g., "PO121BT")
    // Reconstruct the postcode with space before last 3 characters
    const localId = input.councilLocalId;
    if (!localId) {
      return this.failureResult(
        metadata,
        FailureCategory.VALIDATION_ERROR,
        'Property ID is required for Gosport lookups'
      );
    }
    
    const postcode = localId.length > 3
      ? localId.slice(0, -3) + ' ' + localId.slice(-3)
      : localId;
    
    try {
      const response = await this.fetchSupatrakData(postcode, metadata);
      
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
    const testPostcode = 'PO12 1AA'; // Example Gosport postcode
    const metadata = this.createMetadata();
    
    try {
      const response = await this.fetchSupatrakData(testPostcode, metadata);
      
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
      externalDomains: ['api.supatrak.com'],
      handlesCredentials: true,
      securityConcerns: [
        'Uses hardcoded Basic Auth credentials from community project',
        'Credentials are shared public access (not private)',
        'Third-party API (Supatrak) — not directly controlled by Gosport',
        'Credentials may be revoked without notice',
        'Postcode-only lookup — potential privacy concern',
      ],
      lastSecurityReview: '2026-03-25',
      isSandboxed: true,
      networkIsolation: 'allowlist_only',
      requiredPermissions: ['network_egress_https'],
    };
  }
  
  /**
   * Fetch collection data from Supatrak API.
   * Response is JSON array of collection items.
   */
  private async fetchSupatrakData(
    postcode: string,
    metadata: AcquisitionMetadata
  ): Promise<BaseResult<SupatrakApiResponse>> {
    const url = `${SUPATRAK_API_ENDPOINT}?postcode=${encodeURIComponent(postcode)}`;
    const warnings: string[] = [];
    const securityWarnings: string[] = [];
    
    try {
      // Check for kill switch
      if (process.env.ADAPTER_KILL_SWITCH_GOSPORT === 'true') {
        throw new Error('Adapter disabled via kill switch');
      }
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': SUPATRAK_AUTH_HEADER,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeout);
      
      metadata.httpRequestCount = 1;
      metadata.bytesReceived = parseInt(response.headers.get('content-length') || '0', 10);
      
      // Handle HTTP errors
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          securityWarnings.push('Supatrak authentication failed — credentials may have changed');
          return this.failureResult(
            metadata,
            FailureCategory.AUTH_REQUIRED,
            `Supatrak authentication failed: ${response.status}. Shared credentials may have been revoked.`
          );
        }
        
        if (response.status === 404) {
          return this.failureResult(
            metadata,
            FailureCategory.NOT_FOUND,
            `Postcode ${postcode} not found at Supatrak`
          );
        }
        
        if (response.status >= 500) {
          return this.failureResult(
            metadata,
            FailureCategory.SERVER_ERROR,
            `Supatrak server error: ${response.status}`
          );
        }
        
        return this.failureResult(
          metadata,
          FailureCategory.CLIENT_ERROR,
          `HTTP ${response.status}: ${response.statusText}`
        );
      }
      
      // Get JSON response
      const jsonText = await response.text();
      
      let data: SupatrakApiResponse;
      try {
        data = JSON.parse(jsonText);
      } catch (parseError) {
        return this.failureResult(
          metadata,
          FailureCategory.SCHEMA_DRIFT,
          `Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`
        );
      }
      
      // Validate response structure
      if (!Array.isArray(data)) {
        warnings.push('Expected JSON array response — schema may have changed');
        return this.failureResult(
          metadata,
          FailureCategory.SCHEMA_DRIFT,
          'Response is not an array. API structure may have changed.'
        );
      }
      
      if (data.length === 0) {
        warnings.push('No collections found for this postcode');
      }
      
      // Store raw evidence
      const evidenceMetadata = {
        councilId: this.councilId,
        attemptId: metadata.attemptId,
        evidenceType: 'json' as const,
        capturedAt: new Date().toISOString(),
        propertyIdentifier: postcode,
        containsPii: false,
      };
      
      const evidenceResult = await storeEvidence(
        this.councilId,
        'json',
        jsonText,
        evidenceMetadata
      );
      const evidenceRef = evidenceResult.evidenceRef;
      
      metadata.completedAt = new Date().toISOString();
      metadata.durationMs = Date.now() - new Date(metadata.startedAt).getTime();
      
      return {
        success: true,
        data,
        acquisitionMetadata: metadata,
        sourceEvidenceRef: evidenceRef,
        confidence: data.length > 0 ? 0.85 : 0.3,
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
   * Map Supatrak waste type to our ServiceType enum.
   */
  private mapWasteTypeToServiceType(wasteType: string): ServiceType {
    const normalized = wasteType.toLowerCase();
    
    if (normalized.includes('refuse') || normalized.includes('general') || normalized.includes('rubbish') || normalized.includes('residual')) {
      return ServiceType.GENERAL_WASTE;
    }
    
    if (normalized.includes('recycl')) {
      return ServiceType.RECYCLING;
    }
    
    if (normalized.includes('food') || normalized.includes('organic') || normalized.includes('caddy')) {
      return ServiceType.FOOD_WASTE;
    }
    
    if (normalized.includes('garden') || normalized.includes('green')) {
      return ServiceType.GARDEN_WASTE;
    }
    
    if (normalized.includes('glass')) {
      return ServiceType.GLASS;
    }
    
    return ServiceType.OTHER;
  }
  
  /**
   * Parse collection events from Supatrak API response.
   */
  private parseCollectionEvents(response: SupatrakApiResponse): CollectionEvent[] {
    const events: CollectionEvent[] = [];
    
    for (const item of response) {
      try {
        const date = new Date(item.NextCollection);
        if (isNaN(date.getTime())) {
          continue; // Skip invalid dates
        }
        
        const isoDate = date.toISOString().split('T')[0];
        const serviceType = this.mapWasteTypeToServiceType(item.WasteType);
        const serviceId = serviceType.toLowerCase().replace(/_/g, '-');
        
        events.push({
          eventId: `${this.councilId}-${isoDate}-${serviceId}`,
          serviceId,
          serviceType,
          collectionDate: isoDate,
          isConfirmed: true,
          isRescheduled: false,
          isPast: date < new Date(),
        });
      } catch (error) {
        // Skip invalid items
        continue;
      }
    }
    
    // Sort by date ascending
    events.sort((a, b) => a.collectionDate.localeCompare(b.collectionDate));
    
    return events;
  }
  
  /**
   * Parse collection services from Supatrak API response.
   */
  private parseCollectionServices(response: SupatrakApiResponse): CollectionService[] {
    const services: CollectionService[] = [];
    const seenServiceTypes = new Set<ServiceType>();
    
    for (const item of response) {
      const serviceType = this.mapWasteTypeToServiceType(item.WasteType);
      
      // Only add each service type once
      if (seenServiceTypes.has(serviceType)) {
        continue;
      }
      
      seenServiceTypes.add(serviceType);
      const serviceId = serviceType.toLowerCase().replace(/_/g, '-');
      
      services.push({
        serviceId,
        serviceType,
        serviceNameRaw: item.WasteType,
        serviceNameDisplay: item.WasteType,
        isActive: true,
        requiresSubscription: serviceType === ServiceType.GARDEN_WASTE,
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
