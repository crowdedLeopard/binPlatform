/**
 * Eastleigh Borough Council Adapter
 * 
 * Production-quality adapter for Eastleigh waste collection data.
 * Implements Oracle APEX endpoint acquisition with full security hardening.
 * 
 * @module adapters/eastleigh
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
} from '../base/adapter.interface.js';
import {
  LookupMethod,
  FailureCategory,
  ExecutionRiskLevel,
  HealthStatus,
  ServiceType,
} from '../base/adapter.interface.js';
import type { EastleighRawResponse } from './types.js';
import {
  validateUprn,
  parseCollectionEvents,
  parseCollectionServices,
  calculateConfidence,
  sanitiseString,
} from './parser.js';
import { v4 as uuidv4 } from 'uuid';

const ADAPTER_VERSION = '1.0.0';
const EASTLEIGH_ENDPOINT = 'https://my.eastleigh.gov.uk/apex/EBC_Waste_Calendar';
const USER_AGENT = 'HampshireBinData/1.0 (Municipal Service; +https://binday.example.com/about)';
const REQUEST_TIMEOUT_MS = 30000;
const CONNECT_TIMEOUT_MS = 15000;

export class EastleighAdapter implements CouncilAdapter {
  readonly councilId = 'eastleigh';
  
  async discoverCapabilities(): Promise<CouncilCapabilities> {
    return {
      councilId: this.councilId,
      councilName: 'Eastleigh Borough Council',
      councilWebsite: 'https://www.eastleigh.gov.uk',
      supportsAddressLookup: false, // UPRN-based, no address search
      supportsCollectionServices: true,
      supportsCollectionEvents: true,
      providesUprn: true,
      primaryLookupMethod: LookupMethod.API,
      maxEventRangeDays: 365,
      supportedServiceTypes: [
        ServiceType.GENERAL_WASTE,
        ServiceType.RECYCLING,
        ServiceType.GARDEN_WASTE,
        ServiceType.FOOD_WASTE,
      ],
      limitations: [
        'Requires UPRN input (not postcode)',
        'Bot protection may trigger on high request rates',
        'No address search capability',
      ],
      rateLimitRpm: 30,
      adapterLastUpdated: '2026-03-25',
      isProductionReady: true,
    };
  }
  
  async resolveAddresses(input: PropertyLookupInput): Promise<AddressCandidateResult> {
    const metadata = this.createMetadata();
    
    // Eastleigh requires UPRN, not postcode lookup
    // If UPRN is provided, we can construct a minimal candidate
    if (!input.uprn) {
      return this.failureResult(
        metadata,
        FailureCategory.NOT_FOUND,
        'Eastleigh adapter requires UPRN. Use external UPRN resolution service first.'
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
      warnings: ['Eastleigh requires UPRN — address search not supported'],
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
    
    try {
      // Fetch from Eastleigh endpoint
      const response = await this.fetchEastleighData(validation.normalized!, metadata);
      
      if (!response.success || !response.data) {
        return this.failureResult(
          metadata,
          response.failureCategory || FailureCategory.UNKNOWN,
          response.errorMessage || 'Failed to fetch data'
        );
      }
      
      // Parse services
      const services = parseCollectionServices(response.data);
      
      metadata.completedAt = new Date().toISOString();
      metadata.durationMs = Date.now() - new Date(metadata.startedAt).getTime();
      
      return {
        success: true,
        data: services,
        acquisitionMetadata: metadata,
        sourceEvidenceRef: response.sourceEvidenceRef,
        confidence: calculateConfidence(response.data),
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
    
    // Validate UPRN
    const validation = validateUprn(input.councilLocalId);
    if (!validation.valid) {
      return this.failureResult(
        metadata,
        FailureCategory.VALIDATION_ERROR,
        validation.error || 'Invalid UPRN'
      );
    }
    
    try {
      // Fetch from Eastleigh endpoint
      const response = await this.fetchEastleighData(validation.normalized!, metadata);
      
      if (!response.success || !response.data) {
        return this.failureResult(
          metadata,
          response.failureCategory || FailureCategory.UNKNOWN,
          response.errorMessage || 'Failed to fetch data'
        );
      }
      
      // Parse events
      let events = parseCollectionEvents(response.data);
      
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
        confidence: calculateConfidence(response.data),
        warnings: response.warnings,
        securityWarnings: response.securityWarnings,
        fromCache: false,
      };
    } catch (error) {
      return this.handleError(metadata, error);
    }
  }
  
  async verifyHealth(): Promise<AdapterHealth> {
    const testUprn = '100060321174'; // Known test UPRN from discovery
    const metadata = this.createMetadata();
    
    try {
      const response = await this.fetchEastleighData(testUprn, metadata);
      
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
      externalDomains: ['my.eastleigh.gov.uk'],
      handlesCredentials: false,
      securityConcerns: [
        'Bot protection may block automated access',
        'No authentication — rate limiting essential',
        'UPRN enumeration risk — validate inputs carefully',
      ],
      lastSecurityReview: '2026-03-25',
      isSandboxed: true,
      networkIsolation: 'allowlist_only',
      requiredPermissions: ['network_egress_https'],
    };
  }
  
  /**
   * Fetch data from Eastleigh Oracle APEX endpoint.
   * Handles HTTP request, bot protection, and error scenarios.
   */
  private async fetchEastleighData(
    uprn: string,
    metadata: AcquisitionMetadata
  ): Promise<BaseResult<EastleighRawResponse>> {
    const url = `${EASTLEIGH_ENDPOINT}?UPRN=${encodeURIComponent(uprn)}`;
    const warnings: string[] = [];
    const securityWarnings: string[] = [];
    
    try {
      // Check for kill switch
      if (process.env.ADAPTER_KILL_SWITCH_EASTLEIGH === 'true') {
        throw new Error('Adapter disabled via kill switch');
      }
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'application/json, text/html, */*',
          'Accept-Language': 'en-GB,en;q=0.9',
          'Referer': 'https://www.eastleigh.gov.uk/waste-bins-and-recycling/collection-dates',
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeout);
      
      metadata.httpRequestCount = 1;
      metadata.bytesReceived = parseInt(response.headers.get('content-length') || '0', 10);
      
      // Handle HTTP errors
      if (!response.ok) {
        if (response.status === 403) {
          securityWarnings.push('Bot protection triggered (403 Forbidden)');
          return this.failureResult(
            metadata,
            FailureCategory.BOT_DETECTION,
            'Bot protection triggered — reduce request rate or implement browser automation'
          );
        }
        
        if (response.status === 429) {
          securityWarnings.push('Rate limited by upstream (429 Too Many Requests)');
          return this.failureResult(
            metadata,
            FailureCategory.RATE_LIMITED,
            'Rate limited by Eastleigh — backoff required'
          );
        }
        
        if (response.status === 404) {
          return this.failureResult(
            metadata,
            FailureCategory.NOT_FOUND,
            `UPRN ${uprn} not found at Eastleigh`
          );
        }
        
        if (response.status >= 500) {
          return this.failureResult(
            metadata,
            FailureCategory.SERVER_ERROR,
            `Eastleigh server error: ${response.status}`
          );
        }
        
        return this.failureResult(
          metadata,
          FailureCategory.CLIENT_ERROR,
          `HTTP ${response.status}: ${response.statusText}`
        );
      }
      
      // Parse response
      const contentType = response.headers.get('content-type') || '';
      let data: EastleighRawResponse;
      
      if (contentType.includes('application/json')) {
        data = await response.json() as EastleighRawResponse;
      } else if (contentType.includes('text/html')) {
        // HTML response — may need parsing or indicates error
        warnings.push('Received HTML response instead of JSON — may indicate endpoint change');
        const html = await response.text();
        
        // Try to parse as JSON anyway (some endpoints return JSON with wrong content-type)
        try {
          data = JSON.parse(html) as EastleighRawResponse;
        } catch {
          return this.failureResult(
            metadata,
            FailureCategory.PARSE_ERROR,
            'Received HTML instead of expected JSON — endpoint may have changed'
          );
        }
      } else {
        const text = await response.text();
        try {
          data = JSON.parse(text) as EastleighRawResponse;
        } catch {
          return this.failureResult(
            metadata,
            FailureCategory.PARSE_ERROR,
            `Unexpected content-type: ${contentType}`
          );
        }
      }
      
      // Check for error in response
      if (data.error) {
        return this.failureResult(
          metadata,
          FailureCategory.NOT_FOUND,
          sanitiseString(data.error)
        );
      }
      
      // Store evidence reference (implementation depends on storage layer)
      const evidenceRef = uuidv4();
      
      metadata.completedAt = new Date().toISOString();
      metadata.durationMs = Date.now() - new Date(metadata.startedAt).getTime();
      
      return {
        success: true,
        data,
        acquisitionMetadata: metadata,
        sourceEvidenceRef: evidenceRef,
        confidence: calculateConfidence(data),
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
