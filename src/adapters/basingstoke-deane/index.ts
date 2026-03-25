/**
 * Basingstoke & Deane Borough Council Adapter
 * 
 * Production-quality adapter using cookie-based HTTP GET request.
 * Implements UPRN-based collection schedule retrieval.
 * Method discovered from UKBinCollectionData community project.
 * 
 * @module adapters/basingstoke-deane
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
import type { BasingstokeHtmlData } from './types.js';
import {
  validateUprn,
  parseCollectionEvents,
  parseCollectionServices,
  calculateConfidence,
} from './parser.js';
import { v4 as uuidv4 } from 'uuid';
import { storeEvidence } from '../../storage/evidence/store-evidence.js';

const ADAPTER_VERSION = '2.0.0';
const BASINGSTOKE_URL = process.env.BASINGSTOKE_BASE_URL || 'https://www.basingstoke.gov.uk';
const LOOKUP_PATH = '/bincollections';

export class BasingstokeDeaneAdapter implements CouncilAdapter {
  readonly councilId = 'basingstoke-deane';
  
  async discoverCapabilities(): Promise<CouncilCapabilities> {
    return {
      councilId: this.councilId,
      councilName: 'Basingstoke & Deane Borough Council',
      councilWebsite: 'https://www.basingstoke.gov.uk',
      supportsAddressLookup: false, // UPRN-based, no address search
      supportsCollectionServices: true,
      supportsCollectionEvents: true,
      providesUprn: true,
      primaryLookupMethod: LookupMethod.HIDDEN_JSON,
      maxEventRangeDays: 365,
      supportedServiceTypes: [
        ServiceType.GENERAL_WASTE,
        ServiceType.RECYCLING,
        ServiceType.FOOD_WASTE,
        ServiceType.GARDEN_WASTE,
        ServiceType.GLASS,
      ],
      limitations: [
        'Requires UPRN input (not postcode)',
        'Cookie-based authentication',
      ],
      rateLimitRpm: 30,
      adapterLastUpdated: '2026-03-25',
      isProductionReady: true,
    };
  }
  
  async resolveAddresses(input: PropertyLookupInput): Promise<AddressCandidateResult> {
    const metadata = this.createMetadata();
    
    // Basingstoke requires UPRN, not postcode lookup
    if (!input.uprn) {
      return this.failureResult(
        metadata,
        FailureCategory.NOT_FOUND,
        'Basingstoke adapter requires UPRN. Use external UPRN resolution service first.'
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
      warnings: ['Basingstoke requires UPRN — address search not supported'],
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
    if (process.env.ADAPTER_KILL_SWITCH_BASINGSTOKE_DEANE === 'true') {
      return this.failureResult(
        metadata,
        FailureCategory.ADAPTER_ERROR,
        'Adapter disabled via kill switch'
      );
    }
    
    try {
      const htmlData = await this.fetchCollectionData(validation.normalized!, metadata);
      
      if (!htmlData.success || !htmlData.data) {
        return this.failureResult(
          metadata,
          htmlData.failureCategory || FailureCategory.NOT_FOUND,
          htmlData.error || 'Failed to fetch collection data'
        );
      }
      
      const services = parseCollectionServices(htmlData.data);
      
      metadata.completedAt = new Date().toISOString();
      metadata.durationMs = Date.now() - new Date(metadata.startedAt).getTime();
      
      return {
        success: true,
        data: services,
        acquisitionMetadata: metadata,
        sourceEvidenceRef: htmlData.evidenceRef,
        confidence: calculateConfidence(htmlData.data),
        warnings: htmlData.warnings || [],
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
    if (process.env.ADAPTER_KILL_SWITCH_BASINGSTOKE_DEANE === 'true') {
      return this.failureResult(
        metadata,
        FailureCategory.ADAPTER_ERROR,
        'Adapter disabled via kill switch'
      );
    }
    
    try {
      const htmlData = await this.fetchCollectionData(validation.normalized!, metadata);
      
      if (!htmlData.success || !htmlData.data) {
        return this.failureResult(
          metadata,
          htmlData.failureCategory || FailureCategory.NOT_FOUND,
          htmlData.error || 'Failed to fetch collection data'
        );
      }
      
      let events = parseCollectionEvents(htmlData.data);
      
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
        sourceEvidenceRef: htmlData.evidenceRef,
        confidence: calculateConfidence(htmlData.data),
        warnings: htmlData.warnings || [],
        securityWarnings: [],
        fromCache: false,
      };
    } catch (error) {
      return this.handleError(metadata, error);
    }
  }
  
  async verifyHealth(): Promise<AdapterHealth> {
    const testUprn = '100062371274'; // Basingstoke area test UPRN
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
      externalDomains: ['basingstoke.gov.uk'],
      handlesCredentials: false,
      securityConcerns: [
        'Cookie-based authentication (UPRN in cookie)',
        'UPRN enumeration risk — validate inputs carefully',
      ],
      lastSecurityReview: '2026-03-25',
      isSandboxed: true,
      networkIsolation: 'allowlist_only',
      requiredPermissions: ['network_egress_https'],
    };
  }
  
  /**
   * Fetch collection data using cookie-based GET request.
   * Community method: Set UPRN in cookie, GET /bincollections, parse HTML divs.
   */
  private async fetchCollectionData(
    uprn: string,
    metadata: AcquisitionMetadata
  ): Promise<{
    success: boolean;
    data?: BasingstokeHtmlData;
    error?: string;
    failureCategory?: FailureCategory;
    warnings?: string[];
    evidenceRef?: string;
  }> {
    const url = `${BASINGSTOKE_URL}${LOOKUP_PATH}`;
    const warnings: string[] = [];
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    try {
      // GET request with UPRN in cookie
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Cookie': `WhenAreMyBinsCollected=${uprn}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
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
      
      const html = await response.text();
      metadata.bytesReceived = html.length;
      
      // Store raw HTML evidence
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
      
      // Parse HTML for collection divs
      const data = this.parseCollectionHtml(html, uprn, warnings);
      
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
   * Parse HTML for collection schedule.
   * Community pattern: div#{collection_class} for each bin type
   * Collection classes: rteelem_ctl03_pnlCollections_{Refuse|Recycling|Glass|GardenWaste|Food}
   * Extract dates from <li> elements using regex \d{1,2}\s\w+\s\d{4}
   */
  private parseCollectionHtml(
    html: string,
    uprn: string,
    warnings: string[]
  ): BasingstokeHtmlData {
    const collections: Array<{ service: string; dates: string[] }> = [];
    
    // Map of bin types to search for
    const binTypes = ['Refuse', 'Recycling', 'Glass', 'GardenWaste', 'Food'];
    
    for (const binType of binTypes) {
      // Look for div with ID pattern rteelem_ctl03_pnlCollections_{binType}
      const divPattern = new RegExp(
        `<div[^>]*id="[^"]*${binType}[^"]*"[^>]*>(.*?)</div>`,
        'is'
      );
      const match = html.match(divPattern);
      
      if (match) {
        // Extract dates from <li> elements
        const datePattern = /\d{1,2}\s+\w+\s+\d{4}/g;
        const dates = match[1].match(datePattern) || [];
        
        if (dates.length > 0) {
          collections.push({
            service: binType,
            dates: dates,
          });
        }
      }
    }
    
    if (collections.length === 0) {
      warnings.push('No collection data found in HTML — UPRN may not have active bin services');
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
      lookupMethod: LookupMethod.HIDDEN_JSON,
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
