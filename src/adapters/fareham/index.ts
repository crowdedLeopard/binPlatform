/**
 * Fareham Borough Council Adapter
 * 
 * Production-quality adapter for Fareham waste collection data using public JSON API.
 * Replaces broken SOAP/Bartec implementation with working public lookup endpoint.
 * 
 * Platform: Public web form JSON API (no authentication required)
 * Method: JSON API endpoint at search_data.aspx
 * Input: Postcode (resolves to multiple addresses via public lookup)
 * 
 * @module adapters/fareham
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
import type { FarehamJsonResponse, FarehamAddressRow } from './types.js';
import {
  parseCollectionEvents,
  parseCollectionServices,
  normalizeServiceType,
} from './parser.js';
import { v4 as uuidv4 } from 'uuid';
import { storeEvidence } from '../../storage/evidence/store-evidence.js';

const ADAPTER_VERSION = '2.0.0';

const FAREHAM_JSON_API = 'https://www.fareham.gov.uk/internetlookups/search_data.aspx';
const REQUEST_TIMEOUT_MS = 10000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';

export class FarehamAdapter implements CouncilAdapter {
  readonly councilId = 'fareham';
  
  async discoverCapabilities(): Promise<CouncilCapabilities> {
    return {
      councilId: this.councilId,
      councilName: 'Fareham Borough Council',
      councilWebsite: 'https://www.fareham.gov.uk',
      supportsAddressLookup: true, // Postcode-based via public API
      supportsCollectionServices: true,
      supportsCollectionEvents: true,
      providesUprn: true, // UPRN available in calendar link
      primaryLookupMethod: LookupMethod.API,
      maxEventRangeDays: 365,
      supportedServiceTypes: [
        ServiceType.GENERAL_WASTE,
        ServiceType.RECYCLING,
        ServiceType.GARDEN_WASTE,
      ],
      limitations: [
        'Postcode-based lookup returns all addresses in postcode',
        'Public JSON API - no authentication required',
        'Next 2 collection dates only (Refuse and Recycling)',
      ],
      rateLimitRpm: 30,
      adapterLastUpdated: '2026-03-25',
      isProductionReady: true,
    };
  }
  
  async resolveAddresses(input: PropertyLookupInput): Promise<AddressCandidateResult> {
    const metadata = this.createMetadata();
    
    // Fareham public API supports postcode lookup
    if (!input.postcode) {
      return this.failureResult(
        metadata,
        FailureCategory.VALIDATION_ERROR,
        'Fareham adapter requires postcode for address lookup'
      );
    }
    
    try {
      // Check kill switch
      if (process.env.ADAPTER_KILL_SWITCH_FAREHAM === 'true') {
        return this.failureResult(
          metadata,
          FailureCategory.ADAPTER_ERROR,
          'Adapter disabled via kill switch'
        );
      }
      
      const jsonData = await this.fetchFarehamData(input.postcode, metadata);
      
      if (!jsonData.success || !jsonData.data) {
        return this.failureResult(
          metadata,
          jsonData.failureCategory || FailureCategory.UNKNOWN,
          jsonData.errorMessage || 'Failed to fetch address data'
        );
      }
      
      const rows = jsonData.data.data?.rows || [];
      
      if (rows.length === 0) {
        return this.failureResult(
          metadata,
          FailureCategory.NOT_FOUND,
          `No addresses found for postcode ${input.postcode}`
        );
      }
      
      // Convert each row to an address candidate
      // Encode postcode in property ID so we can re-fetch later
      const candidates = rows.map((row: FarehamAddressRow, index: number) => {
        // Extract UPRN from calendar link if available
        const calendarMatch = row.Calendar?.match(/ref=(\d+)/);
        const uprn = calendarMatch ? calendarMatch[1] : undefined;
        
        // Format: postcode (no spaces):uprn or postcode:index
        // Example: PO167DZ:100060355983
        const postcodeNoSpaces = input.postcode.replace(/\s+/g, '');
        const localId = uprn 
          ? `${postcodeNoSpaces}:${uprn}` 
          : `${postcodeNoSpaces}:${index}`;
        
        return {
          councilLocalId: localId,
          uprn,
          addressRaw: row.Address || '',
          addressNormalised: row.Address || '',
          addressDisplay: row.Address || '',
          postcode: input.postcode,
          confidence: 1.0,
        };
      });
      
      metadata.completedAt = new Date().toISOString();
      metadata.durationMs = Date.now() - new Date(metadata.startedAt).getTime();
      
      return {
        success: true,
        data: candidates,
        acquisitionMetadata: metadata,
        sourceEvidenceRef: jsonData.sourceEvidenceRef,
        confidence: 1.0,
        warnings: [],
        securityWarnings: [],
        fromCache: false,
      };
    } catch (error) {
      return this.handleError(metadata, error);
    }
  }
  
  async getCollectionServices(input: PropertyIdentity): Promise<CollectionServiceResult> {
    const metadata = this.createMetadata();
    
    try {
      const response = await this.fetchFarehamDataByAddress(input.councilLocalId, metadata);
      
      if (!response.success || !response.data) {
        return this.failureResult(
          metadata,
          response.failureCategory || FailureCategory.UNKNOWN,
          response.errorMessage || 'Failed to fetch data'
        );
      }
      
      // Parse services from the address row
      const services: CollectionService[] = [];
      const row = response.data;
      
      // Extract service information from BinCollectionInformation field
      if (row.BinCollectionInformation) {
        // Example: "26/03/2026 (Refuse) and 02/04/2026 (Recycling)"
        if (row.BinCollectionInformation.toLowerCase().includes('refuse')) {
          services.push({
            serviceId: 'fareham-general-waste',
            serviceType: ServiceType.GENERAL_WASTE,
            serviceNameRaw: 'Refuse',
            serviceNameDisplay: 'General Waste',
            isActive: true,
            requiresSubscription: false,
          });
        }
        if (row.BinCollectionInformation.toLowerCase().includes('recycling')) {
          services.push({
            serviceId: 'fareham-recycling',
            serviceType: ServiceType.RECYCLING,
            serviceNameRaw: 'Recycling',
            serviceNameDisplay: 'Recycling',
            isActive: true,
            requiresSubscription: false,
          });
        }
      }
      
      // Check for garden waste
      if (row['GardenWasteBinDay<br/>(seenotesabove)'] || row.GardenWasteDay || row.GardenWasteBinDay) {
        services.push({
          serviceId: 'fareham-garden-waste',
          serviceType: ServiceType.GARDEN_WASTE,
          serviceNameRaw: 'Garden Waste',
          serviceNameDisplay: 'Garden Waste',
          isActive: true,
          requiresSubscription: true,
        });
      }
      
      metadata.completedAt = new Date().toISOString();
      metadata.durationMs = Date.now() - new Date(metadata.startedAt).getTime();
      
      return {
        success: true,
        data: services,
        acquisitionMetadata: metadata,
        sourceEvidenceRef: response.sourceEvidenceRef,
        confidence: 0.7, // JSON parsing, some guesswork
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
    
    try {
      const response = await this.fetchFarehamDataByAddress(input.councilLocalId, metadata);
      
      if (!response.success || !response.data) {
        return this.failureResult(
          metadata,
          response.failureCategory || FailureCategory.UNKNOWN,
          response.errorMessage || 'Failed to fetch data'
        );
      }
      
      // Parse events from the address row
      const events: CollectionEvent[] = [];
      const row = response.data;
      const today = new Date().toISOString().split('T')[0];
      
      // Parse BinCollectionInformation field
      // Example: "26/03/2026 (Refuse) and 02/04/2026 (Recycling)"
      if (row.BinCollectionInformation) {
        const datePattern = /(\d{2})\/(\d{2})\/(\d{4})\s*\((\w+)\)/g;
        let match;
        
        while ((match = datePattern.exec(row.BinCollectionInformation)) !== null) {
          const [, day, month, year, serviceType] = match;
          const collectionDate = `${year}-${month}-${day}`;
          const normalizedType = normalizeServiceType(serviceType);
          
          events.push({
            eventId: `fareham-${collectionDate}-${normalizedType}`,
            serviceId: `fareham-${normalizedType}`,
            serviceType: normalizedType,
            collectionDate,
            isConfirmed: true,
            isRescheduled: false,
            isPast: collectionDate < today,
          });
        }
      }
      
      // Parse garden waste if present
      const gardenWasteField = row['GardenWasteBinDay<br/>(seenotesabove)'] || row.GardenWasteDay || row.GardenWasteBinDay;
      if (gardenWasteField) {
        // Example: "Thursday 02/04/2026"
        const gardenDateMatch = gardenWasteField.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (gardenDateMatch) {
          const [, day, month, year] = gardenDateMatch;
          const collectionDate = `${year}-${month}-${day}`;
          
          events.push({
            eventId: `fareham-${collectionDate}-garden-waste`,
            serviceId: `fareham-garden-waste`,
            serviceType: ServiceType.GARDEN_WASTE,
            collectionDate,
            isConfirmed: true,
            isRescheduled: false,
            isPast: collectionDate < today,
          });
        }
      }
      
      // Filter by date range if provided
      let filteredEvents = events;
      if (range) {
        filteredEvents = events.filter(event => 
          event.collectionDate >= range.from && event.collectionDate <= range.to
        );
      }
      
      metadata.completedAt = new Date().toISOString();
      metadata.durationMs = Date.now() - new Date(metadata.startedAt).getTime();
      
      return {
        success: true,
        data: filteredEvents,
        acquisitionMetadata: metadata,
        sourceEvidenceRef: response.sourceEvidenceRef,
        confidence: 0.7, // JSON parsing with regex extraction
        warnings: response.warnings,
        securityWarnings: response.securityWarnings,
        fromCache: false,
      };
    } catch (error) {
      return this.handleError(metadata, error);
    }
  }
  
  async verifyHealth(): Promise<AdapterHealth> {
    const testPostcode = 'PO16 7DZ'; // Test postcode in Fareham
    const metadata = this.createMetadata();
    
    try {
      const response = await this.fetchFarehamData(testPostcode, metadata);
      
      return {
        councilId: this.councilId,
        status: response.success ? HealthStatus.HEALTHY : HealthStatus.DEGRADED,
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
      externalDomains: ['fareham.gov.uk'],
      handlesCredentials: false,
      securityConcerns: [
        'Public JSON API - no authentication required',
        'Postcode-based lookup may return multiple addresses',
      ],
      lastSecurityReview: '2026-03-25',
      isSandboxed: true,
      networkIsolation: 'allowlist_only',
      requiredPermissions: ['network_egress_https'],
    };
  }
  
  /**
   * Fetch data from Fareham public JSON API by postcode.
   * Returns all addresses for the given postcode.
   */
  private async fetchFarehamData(
    postcode: string,
    metadata: AcquisitionMetadata
  ): Promise<BaseResult<FarehamJsonResponse>> {
    const warnings: string[] = [];
    const securityWarnings: string[] = [];
    
    try {
      // Check kill switch
      if (process.env.ADAPTER_KILL_SWITCH_FAREHAM === 'true') {
        throw new Error('Adapter disabled via kill switch');
      }
      
      // Try new dataset first, fall back to old dataset if no data
      const datasets = ['DomesticBinCollections2025on', 'DomesticBinCollections'];
      let jsonResponse: FarehamJsonResponse | null = null;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      
      try {
        for (const dataset of datasets) {
          const url = new URL(FAREHAM_JSON_API);
          url.searchParams.set('type', 'JSON');
          url.searchParams.set('list', dataset);
          url.searchParams.set('Road or Postcode', postcode);
          
          const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
              'User-Agent': USER_AGENT,
            },
            signal: controller.signal,
          });
          
          metadata.httpRequestCount = (metadata.httpRequestCount || 0) + 1;
          
          if (!response.ok) {
            if (response.status === 404) {
              continue; // Try next dataset
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          const jsonText = await response.text();
          metadata.bytesReceived = (metadata.bytesReceived || 0) + jsonText.length;
          
          const json: FarehamJsonResponse = JSON.parse(jsonText);
          
          // Check if we got actual data
          if (json.data && json.data.rows && json.data.rows.length > 0) {
            jsonResponse = json;
            break;
          }
        }
      } finally {
        clearTimeout(timeoutId);
      }
      
      if (!jsonResponse || !jsonResponse.data || !jsonResponse.data.rows || jsonResponse.data.rows.length === 0) {
        return this.failureResult(
          metadata,
          FailureCategory.NOT_FOUND,
          `No data found for postcode ${postcode}`
        );
      }
      
      // Store raw JSON as evidence
      const evidenceMetadata = {
        councilId: this.councilId,
        attemptId: metadata.attemptId,
        evidenceType: 'html' as const, // JSON stored as html type (text-based)
        capturedAt: new Date().toISOString(),
        propertyIdentifier: postcode,
        containsPii: true, // Contains addresses
      };
      
      const evidenceResult = await storeEvidence(
        this.councilId,
        'html',
        JSON.stringify(jsonResponse, null, 2),
        evidenceMetadata
      );
      const evidenceRef = evidenceResult.evidenceRef;
      
      metadata.completedAt = new Date().toISOString();
      metadata.durationMs = Date.now() - new Date(metadata.startedAt).getTime();
      
      return {
        success: true,
        data: jsonResponse,
        acquisitionMetadata: metadata,
        sourceEvidenceRef: evidenceRef,
        confidence: 0.85,
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
      
      if (error instanceof Error && error.message.includes('fetch')) {
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
   * Fetch data for a specific address.
   * This re-fetches by postcode and finds the matching address row.
   */
  private async fetchFarehamDataByAddress(
    councilLocalId: string,
    metadata: AcquisitionMetadata
  ): Promise<BaseResult<FarehamAddressRow>> {
    // Parse councilLocalId - format is now "postcode:uprn" or "postcode:index"
    // Example: "PO167DZ:100060355983" or "PO167DZ:0"
    const parts = councilLocalId.split(':');
    
    if (parts.length < 2) {
      return this.failureResult(
        metadata,
        FailureCategory.VALIDATION_ERROR,
        'Cannot fetch by UPRN alone - postcode context required'
      );
    }
    
    const postcode = parts[0]; // "PO167DZ"
    const identifier = parts[1]; // "100060355983" or "0"
    
    // Re-query Fareham endpoint with postcode
    const response = await this.fetchFarehamData(postcode, metadata);
    
    if (!response.success || !response.data) {
      return this.failureResult(
        metadata,
        response.failureCategory || FailureCategory.UNKNOWN,
        response.errorMessage || 'Failed to fetch data'
      );
    }
    
    const rows = response.data.data?.rows || [];
    
    // Try to match by UPRN first
    const uprnMatch = rows.find((row: FarehamAddressRow) => {
      const calendarMatch = row.Calendar?.match(/ref=(\d+)/);
      return calendarMatch && calendarMatch[1] === identifier;
    });
    
    if (uprnMatch) {
      return {
        success: true,
        data: uprnMatch,
        acquisitionMetadata: metadata,
        sourceEvidenceRef: response.sourceEvidenceRef,
        confidence: 0.85,
        warnings: response.warnings,
        securityWarnings: response.securityWarnings,
        fromCache: false,
      };
    }
    
    // Fall back to index-based lookup
    const index = parseInt(identifier, 10);
    if (!isNaN(index) && index >= 0 && index < rows.length) {
      return {
        success: true,
        data: rows[index],
        acquisitionMetadata: metadata,
        sourceEvidenceRef: response.sourceEvidenceRef,
        confidence: 0.85,
        warnings: response.warnings,
        securityWarnings: response.securityWarnings,
        fromCache: false,
      };
    }
    
    return this.failureResult(
      metadata,
      FailureCategory.NOT_FOUND,
      `Address not found for identifier ${identifier} in postcode ${postcode}`
    );
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
