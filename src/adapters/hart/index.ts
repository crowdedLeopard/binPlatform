/**
 * Hart District Council Adapter
 * 
 * Production-quality adapter using JSON API.
 * Implements UPRN-based collection schedule retrieval.
 * Method discovered from UKBinCollectionData community project.
 * 
 * @module adapters/hart
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
} from '../base/adapter.interface.js';
import {
  LookupMethod,
  FailureCategory,
  ExecutionRiskLevel,
  HealthStatus,
  ServiceType,
} from '../base/adapter.interface.js';
import type { HartJsonResponse, HartHtmlData } from './types.js';
import {
  validateUprn,
  parseCollectionEvents,
  parseCollectionServices,
  calculateConfidence,
} from './parser.js';
import { v4 as uuidv4 } from 'uuid';
import { storeEvidence } from '../../storage/evidence/store-evidence.js';

const ADAPTER_VERSION = '2.0.0';
const HART_BASE_URL = process.env.HART_BASE_URL || 'https://www.hart.gov.uk';
const HART_API_PATH = '/bbd-whitespace/next-collection-dates';
const HART_API_URI = 'entity:node/172';

export class HartAdapter implements CouncilAdapter {
  readonly councilId = 'hart';
  
  async discoverCapabilities(): Promise<CouncilCapabilities> {
    return {
      councilId: this.councilId,
      councilName: 'Hart District Council',
      councilWebsite: 'https://www.hart.gov.uk',
      supportsAddressLookup: false, // UPRN-based, no address search
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
        'Requires UPRN input (not postcode)',
        'JSON API wrapping HTML table',
      ],
      rateLimitRpm: 30,
      adapterLastUpdated: '2026-03-25',
      isProductionReady: true,
    };
  }
  
  async resolveAddresses(input: PropertyLookupInput): Promise<AddressCandidateResult> {
    const metadata = this.createMetadata();
    
    // Hart requires UPRN, not postcode lookup
    if (!input.uprn) {
      return this.failureResult(
        metadata,
        FailureCategory.NOT_FOUND,
        'Hart adapter requires UPRN. Use external UPRN resolution service first.'
      );
    }
    
    const validation = validateUprn(input.uprn);
    if (!validation.valid) {
      return this.failureResult(
        metadata,
        FailureCategory.VALIDATION_ERROR,
        validation.error || 'Invalid UPRN'
      );
    }
    
    metadata.completedAt = new Date().toISOString();
    metadata.durationMs = Date.now() - new Date(metadata.startedAt).getTime();
    
    // Return UPRN as an address candidate
    return {
      success: true,
      data: [
        {
          councilLocalId: validation.normalized!,
          uprn: validation.normalized,
          addressRaw: input.addressFragment || `UPRN ${validation.normalized}`,
          addressNormalised: `UPRN ${validation.normalized}`,
          addressDisplay: input.addressFragment || `Property ${validation.normalized}`,
          postcode: input.postcode,
          confidence: 1.0,
        },
      ],
      acquisitionMetadata: metadata,
      confidence: 1.0,
      warnings: ['Hart requires UPRN — address search not supported'],
      securityWarnings: [],
      fromCache: false,
    };
  }
  
  async getCollectionServices(input: PropertyIdentity): Promise<CollectionServiceResult> {
    const metadata = this.createMetadata();
    
    // Validate UPRN
    const validation = validateUprn(input.councilLocalId);
    if (!validation.valid) {
      return this.failureResult(
        metadata,
        FailureCategory.VALIDATION_ERROR,
        validation.error || 'Invalid UPRN'
      );
    }
    
    // Check kill switch
    if (process.env.ADAPTER_KILL_SWITCH_HART === 'true') {
      return this.failureResult(
        metadata,
        FailureCategory.ADAPTER_ERROR,
        'Adapter disabled via kill switch'
      );
    }
    
    try {
      const jsonData = await this.fetchCollectionData(validation.normalized!, metadata);
      
      if (!jsonData.success || !jsonData.data) {
        return this.failureResult(
          metadata,
          jsonData.failureCategory || FailureCategory.NOT_FOUND,
          jsonData.error || 'Failed to fetch collection data'
        );
      }
      
      const services = parseCollectionServices(jsonData.data);
      
      metadata.completedAt = new Date().toISOString();
      metadata.durationMs = Date.now() - new Date(metadata.startedAt).getTime();
      
      return {
        success: true,
        data: services,
        acquisitionMetadata: metadata,
        sourceEvidenceRef: jsonData.evidenceRef,
        confidence: calculateConfidence(jsonData.data),
        warnings: jsonData.warnings || [],
        securityWarnings: [],
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
    
    // Validate UPRN
    const validation = validateUprn(input.councilLocalId);
    if (!validation.valid) {
      return this.failureResult(
        metadata,
        FailureCategory.VALIDATION_ERROR,
        validation.error || 'Invalid UPRN'
      );
    }
    
    // Check kill switch
    if (process.env.ADAPTER_KILL_SWITCH_HART === 'true') {
      return this.failureResult(
        metadata,
        FailureCategory.ADAPTER_ERROR,
        'Adapter disabled via kill switch'
      );
    }
    
    try {
      const jsonData = await this.fetchCollectionData(validation.normalized!, metadata);
      
      if (!jsonData.success || !jsonData.data) {
        return this.failureResult(
          metadata,
          jsonData.failureCategory || FailureCategory.NOT_FOUND,
          jsonData.error || 'Failed to fetch collection data'
        );
      }
      
      let events = parseCollectionEvents(jsonData.data);
      
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
        sourceEvidenceRef: jsonData.evidenceRef,
        confidence: calculateConfidence(jsonData.data),
        warnings: jsonData.warnings || [],
        securityWarnings: [],
        fromCache: false,
      };
    } catch (error) {
      return this.handleError(metadata, error);
    }
  }
  
  async verifyHealth(): Promise<AdapterHealth> {
    const testUprn = '100062488143'; // Hart area test UPRN
    const metadata = this.createMetadata();
    
    try {
      const response = await this.fetchCollectionData(testUprn, metadata);
      
      return {
        councilId: this.councilId,
        status: response.success ? HealthStatus.HEALTHY : HealthStatus.UNHEALTHY,
        lastSuccessAt: response.success ? new Date().toISOString() : undefined,
        lastFailureAt: !response.success ? new Date().toISOString() : undefined,
        lastFailureCategory: response.failureCategory,
        lastFailureMessage: response.error,
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
      externalDomains: ['hart.gov.uk'],
      handlesCredentials: false,
      securityConcerns: [
        'JSON API wrapping HTML table',
        'UPRN enumeration risk — validate inputs carefully',
      ],
      lastSecurityReview: '2026-03-25',
      isSandboxed: true,
      networkIsolation: 'allowlist_only',
      requiredPermissions: ['network_egress_https'],
    };
  }
  
  /**
   * Fetch collection data using JSON API.
   * Community method: GET with uri and uprn params, returns JSON with HTML table in data field.
   */
  private async fetchCollectionData(
    uprn: string,
    metadata: AcquisitionMetadata
  ): Promise<{
    success: boolean;
    data?: HartHtmlData;
    error?: string;
    failureCategory?: FailureCategory;
    warnings?: string[];
    evidenceRef?: string;
  }> {
    const url = `${HART_BASE_URL}${HART_API_PATH}?uri=${encodeURIComponent(HART_API_URI)}&uprn=${encodeURIComponent(uprn)}`;
    const warnings: string[] = [];
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      metadata.httpRequestCount = 1;
      
      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          failureCategory: response.status >= 500 
            ? FailureCategory.SERVER_ERROR 
            : FailureCategory.CLIENT_ERROR,
          warnings,
        };
      }
      
      const jsonText = await response.text();
      metadata.bytesReceived = jsonText.length;
      
      // Store raw JSON evidence
      const evidenceMetadata = {
        councilId: this.councilId,
        attemptId: metadata.attemptId,
        evidenceType: 'json' as const,
        capturedAt: new Date().toISOString(),
        propertyIdentifier: uprn,
        containsPii: false,
      };
      
      const evidenceResult = await storeEvidence(
        this.councilId,
        'json',
        jsonText,
        evidenceMetadata
      );
      
      // Parse JSON response
      let jsonData: HartJsonResponse;
      try {
        jsonData = JSON.parse(jsonText);
      } catch (parseError) {
        return {
          success: false,
          error: 'Failed to parse JSON response',
          failureCategory: FailureCategory.PARSE_ERROR,
          warnings,
        };
      }
      
      // Extract HTML from JSON response
      // Community pattern: Response is array with single object containing HTML in 'data' field
      if (!Array.isArray(jsonData) || jsonData.length === 0) {
        return {
          success: false,
          error: 'Unexpected JSON structure (expected array)',
          failureCategory: FailureCategory.SCHEMA_DRIFT,
          warnings,
        };
      }
      
      const htmlContent = jsonData[0]?.data;
      if (typeof htmlContent !== 'string') {
        return {
          success: false,
          error: 'No HTML data found in JSON response',
          failureCategory: FailureCategory.NOT_FOUND,
          warnings,
        };
      }
      
      // Parse HTML table from data field
      const data = this.parseHtmlTable(htmlContent, uprn, warnings);
      
      metadata.completedAt = new Date().toISOString();
      metadata.durationMs = Date.now() - new Date(metadata.startedAt).getTime();
      
      return {
        success: true,
        data,
        warnings,
        evidenceRef: evidenceResult.evidenceRef,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          error: 'Request timeout (10s)',
          failureCategory: FailureCategory.TIMEOUT,
          warnings,
        };
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        failureCategory: FailureCategory.NETWORK_ERROR,
        warnings,
      };
    }
  }
  
  /**
   * Parse HTML table for collection schedule.
   * Community pattern: Extract <tr> rows, cells td.bin-service (types) and td.bin-service-date (dates)
   * Handle multiple bin types separated by & in single row
   * Date format: "23 January" - add year logic
   */
  private parseHtmlTable(
    html: string,
    uprn: string,
    warnings: string[]
  ): HartHtmlData {
    const collections: Array<{ services: string[]; date: string }> = [];
    
    // Extract table rows using regex
    const rowPattern = /<tr[^>]*>(.*?)<\/tr>/gis;
    const rows = html.matchAll(rowPattern);
    
    for (const rowMatch of rows) {
      const rowHtml = rowMatch[1];
      
      // Extract bin service types
      const serviceMatch = rowHtml.match(/<td[^>]*class="[^"]*bin-service[^"]*"[^>]*>(.*?)<\/td>/is);
      
      // Extract date
      const dateMatch = rowHtml.match(/<td[^>]*class="[^"]*bin-service-date[^"]*"[^>]*>(.*?)<\/td>/is);
      
      if (serviceMatch && dateMatch) {
        // Clean HTML tags from service text
        const serviceText = serviceMatch[1].replace(/<[^>]*>/g, '').trim();
        
        // Split multiple bin types separated by &
        const services = serviceText.split('&').map(s => s.trim()).filter(s => s.length > 0);
        
        // Clean HTML tags from date text
        const dateText = dateMatch[1].replace(/<[^>]*>/g, '').trim();
        
        if (services.length > 0 && dateText) {
          collections.push({
            services,
            date: dateText,
          });
        }
      }
    }
    
    if (collections.length === 0) {
      warnings.push('No collection data found in HTML table — UPRN may not have active bin services');
    }
    
    return {
      uprn,
      collections,
      warnings,
    };
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
  ): any {
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
  
  private handleError<T>(metadata: AcquisitionMetadata, error: unknown): any {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return this.failureResult(metadata, FailureCategory.ADAPTER_ERROR, message);
  }
}
