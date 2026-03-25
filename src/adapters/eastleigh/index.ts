/**
 * Eastleigh Borough Council Adapter
 * 
 * Production-quality adapter using Playwright browser automation.
 * Bypasses Cloudflare Bot Management by using real browser with JavaScript execution.
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
} from '../base/adapter.interface.js';
import {
  LookupMethod,
  FailureCategory,
  ExecutionRiskLevel,
  HealthStatus,
  ServiceType,
} from '../base/adapter.interface.js';
import { BrowserAdapter } from '../base/browser-adapter.js';
import type { Page } from 'playwright';
import type { EastleighRawResponse, EastleighCollection } from './types.js';
import {
  validateUprn,
  parseCollectionEvents,
  parseCollectionServices,
  calculateConfidence,
  sanitiseString,
} from './parser.js';
import { v4 as uuidv4 } from 'uuid';
import { storeEvidence } from '../../storage/evidence/store-evidence.js';

const ADAPTER_VERSION = '1.0.0';
const EASTLEIGH_URL = 'https://www.eastleigh.gov.uk';
const COLLECTION_PATH = '/waste-bins-and-recycling/collection-dates/your-waste-bin-and-recycling-collections';

// Cloudflare challenge timeout
const CLOUDFLARE_TIMEOUT_MS = 30000;
const PAGE_LOAD_TIMEOUT_MS = 10000;

export class EastleighAdapter extends BrowserAdapter implements CouncilAdapter {
  readonly councilId = 'eastleigh';
  
  constructor() {
    super({
      allowedDomains: ['eastleigh.gov.uk'],
      navigationTimeout: CLOUDFLARE_TIMEOUT_MS + PAGE_LOAD_TIMEOUT_MS,
      scriptTimeout: 15000,
      captureScreenshots: true,
      captureHar: false,
      headless: true,
    });
  }
  
  async discoverCapabilities(): Promise<CouncilCapabilities> {
    return {
      councilId: this.councilId,
      councilName: 'Eastleigh Borough Council',
      councilWebsite: 'https://www.eastleigh.gov.uk',
      supportsAddressLookup: false, // UPRN-based, no address search
      supportsCollectionServices: true,
      supportsCollectionEvents: true,
      providesUprn: true,
      primaryLookupMethod: LookupMethod.BROWSER_AUTOMATION,
      maxEventRangeDays: 365,
      supportedServiceTypes: [
        ServiceType.GENERAL_WASTE,
        ServiceType.RECYCLING,
        ServiceType.GARDEN_WASTE,
        ServiceType.FOOD_WASTE,
        ServiceType.GLASS,
      ],
      limitations: [
        'Requires UPRN input (not postcode)',
        'Requires browser automation (Playwright) to bypass Cloudflare',
        'No address search capability',
        'Slower than API-based adapters',
      ],
      rateLimitRpm: 10,
      adapterLastUpdated: '2026-03-25',
      isProductionReady: true,
    };
  }
  
  async resolveAddresses(input: PropertyLookupInput): Promise<AddressCandidateResult> {
    const metadata = this.createMetadata();
    metadata.usedBrowserAutomation = true;
    
    // Eastleigh requires UPRN, not postcode lookup
    // Return 503 to signal that central UPRN resolution service should be used
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
    metadata.usedBrowserAutomation = true;
    
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
    if (process.env.ADAPTER_KILL_SWITCH_EASTLEIGH === 'true') {
      return this.failureResult(
        metadata,
        FailureCategory.ADAPTER_ERROR,
        'Adapter disabled via kill switch'
      );
    }
    
    try {
      // Fetch from Eastleigh using browser automation
      const response = await this.fetchEastleighData(validation.normalized!, metadata);
      
      if (!response.success || !response.data) {
        return this.failureResult(
          metadata,
          response.failureCategory || FailureCategory.UNKNOWN,
          response.error || 'Failed to fetch data'
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
        sourceEvidenceRef: response.evidenceRef,
        confidence: calculateConfidence(response.data),
        warnings: response.warnings || [],
        securityWarnings: response.securityWarnings || [],
        fromCache: false,
      };
    } catch (error) {
      return this.handleError(metadata, error);
    } finally {
      await this.cleanup();
    }
  }
  
  async getCollectionEvents(
    input: PropertyIdentity,
    range?: DateRange
  ): Promise<CollectionEventResult> {
    const metadata = this.createMetadata();
    metadata.usedBrowserAutomation = true;
    
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
    if (process.env.ADAPTER_KILL_SWITCH_EASTLEIGH === 'true') {
      return this.failureResult(
        metadata,
        FailureCategory.ADAPTER_ERROR,
        'Adapter disabled via kill switch'
      );
    }
    
    try {
      // Fetch from Eastleigh using browser automation
      const response = await this.fetchEastleighData(validation.normalized!, metadata);
      
      if (!response.success || !response.data) {
        return this.failureResult(
          metadata,
          response.failureCategory || FailureCategory.UNKNOWN,
          response.error || 'Failed to fetch data'
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
        sourceEvidenceRef: response.evidenceRef,
        confidence: calculateConfidence(response.data),
        warnings: response.warnings || [],
        securityWarnings: response.securityWarnings || [],
        fromCache: false,
      };
    } catch (error) {
      return this.handleError(metadata, error);
    } finally {
      await this.cleanup();
    }
  }
  
  async verifyHealth(): Promise<AdapterHealth> {
    const testUprn = '100060321174'; // Known test UPRN from discovery
    const metadata = this.createMetadata();
    metadata.usedBrowserAutomation = true;
    
    try {
      const response = await this.fetchEastleighData(testUprn, metadata);
      
      await this.cleanup();
      
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
      await this.cleanup();
      
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
      requiresBrowserAutomation: true,
      executesJavaScript: true,
      externalDomains: ['eastleigh.gov.uk'],
      handlesCredentials: false,
      securityConcerns: [
        'Browser automation required — resource intensive',
        'Executes JavaScript from eastleigh.gov.uk',
        'Cloudflare Bot Management requires real browser',
        'UPRN enumeration risk — validate inputs carefully',
      ],
      lastSecurityReview: '2026-03-25',
      isSandboxed: true,
      networkIsolation: 'allowlist_only',
      requiredPermissions: ['network_egress_https', 'browser_automation'],
    };
  }
  
  /**
   * Fetch data from Eastleigh waste collection page using Playwright.
   * Bypasses Cloudflare Bot Management with real browser automation.
   */
  private async fetchEastleighData(
    uprn: string,
    metadata: AcquisitionMetadata
  ): Promise<{
    success: boolean;
    data?: EastleighRawResponse;
    error?: string;
    failureCategory?: FailureCategory;
    warnings?: string[];
    securityWarnings?: string[];
    evidenceRef?: string;
  }> {
    const url = `${EASTLEIGH_URL}${COLLECTION_PATH}?uprn=${encodeURIComponent(uprn)}`;
    const warnings: string[] = [];
    const securityWarnings: string[] = [];
    
    try {
      const result = await this.executeBrowserTask<{
        html: string;
        data: EastleighRawResponse;
      }>(async (page: Page) => {
        // Navigate to the collection page with UPRN
        const navResult = await this.navigateToUrl(page, url);
        if (!navResult.success) {
          throw new Error(navResult.error || 'Navigation failed');
        }
        
        // Wait for Cloudflare challenge to complete (up to 30s)
        // Then wait for the dl.dl-horizontal element to appear
        try {
          await page.waitForSelector('dl.dl-horizontal', {
            timeout: CLOUDFLARE_TIMEOUT_MS,
            state: 'visible',
          });
        } catch (timeoutError) {
          // Check if still showing Cloudflare challenge
          const pageContent = await page.content();
          if (pageContent.includes('Just a moment') || 
              pageContent.includes('_cf_chl_opt') || 
              pageContent.includes('challenge-platform')) {
            throw new Error('Cloudflare challenge did not complete within timeout');
          }
          
          // Otherwise, dl.dl-horizontal element not found - may be UPRN issue
          throw new Error('Collection data element (dl.dl-horizontal) not found on page');
        }
        
        // Get the full page HTML after JavaScript execution
        const html = await page.content();
        
        // Extract collection data using page.evaluate for DOM parsing
        const data = await this.extractCollectionDataFromPage(page, uprn);
        
        return { html, data };
      });
      
      if (!result.success) {
        // Classify the error
        let category = result.failureCategory || FailureCategory.UNKNOWN;
        
        if (result.error?.includes('Cloudflare')) {
          category = FailureCategory.BOT_DETECTION;
          securityWarnings.push('Cloudflare challenge did not complete');
        } else if (result.error?.includes('timeout')) {
          category = FailureCategory.TIMEOUT;
        } else if (result.error?.includes('Navigation')) {
          category = FailureCategory.NETWORK_ERROR;
        } else if (result.error?.includes('not found')) {
          category = FailureCategory.NOT_FOUND;
        }
        
        return {
          success: false,
          error: result.error || 'Browser automation failed',
          failureCategory: category,
          warnings,
          securityWarnings,
        };
      }
      
      const { html, data } = result.data!;
      
      // Check if data has error
      if (data.error) {
        return {
          success: false,
          error: sanitiseString(data.error),
          failureCategory: FailureCategory.NOT_FOUND,
          warnings,
          securityWarnings,
        };
      }
      
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
      
      metadata.httpRequestCount = result.networkRequests?.length || 0;
      metadata.completedAt = new Date().toISOString();
      metadata.durationMs = Date.now() - new Date(metadata.startedAt).getTime();
      
      return {
        success: true,
        data,
        warnings,
        securityWarnings,
        evidenceRef: evidenceResult.evidenceRef,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        failureCategory: FailureCategory.ADAPTER_ERROR,
        warnings,
        securityWarnings,
      };
    }
  }
  
  /**
   * Extract collection data from the page DOM using Playwright page.evaluate.
   * This runs in the browser context and can access the DOM directly.
   */
  private async extractCollectionDataFromPage(
    page: Page,
    uprn: string
  ): Promise<EastleighRawResponse> {
    // @ts-ignore - page.evaluate runs in browser context where document is available
    return await page.evaluate((uprnParam) => {
      const collections: Array<{ service: string; collectionDate: string }> = [];
      
      // Find the dl.dl-horizontal element
      // @ts-ignore - document is available in browser context
      const dlElement = document.querySelector('dl.dl-horizontal');
      
      if (!dlElement) {
        // Check for error messages
        // @ts-ignore - document is available in browser context
        const bodyText = document.body.textContent || '';
        if (bodyText.includes('not found') || 
            bodyText.includes('no bins') || 
            bodyText.includes('invalid')) {
          return {
            uprn: uprnParam,
            error: 'UPRN not found or no bins registered',
            collections: null,
          };
        }
        
        return {
          uprn: uprnParam,
          error: 'Unable to find collection data in expected format',
          collections: null,
        };
      }
      
      // Extract dt (bin type) and dd (date) pairs
      const dtElements = dlElement.querySelectorAll('dt');
      const ddElements = dlElement.querySelectorAll('dd');
      
      const count = Math.min(dtElements.length, ddElements.length);
      
      for (let i = 0; i < count; i++) {
        const binType = dtElements[i].textContent?.trim() || '';
        const dateStr = ddElements[i].textContent?.trim() || '';
        
        // Skip if user hasn't signed up for this service
        if (dateStr.includes("haven't yet signed up") || 
            dateStr.includes("not subscribed") ||
            dateStr.includes("No collection") ||
            !dateStr) {
          continue;
        }
        
        if (binType) {
          collections.push({
            service: binType,
            collectionDate: dateStr,
          });
        }
      }
      
      return {
        uprn: uprnParam,
        collections: collections,
      };
    }, uprn);
  }
  
  private createMetadata(): AcquisitionMetadata {
    return {
      attemptId: uuidv4(),
      adapterId: this.councilId,
      councilId: this.councilId,
      lookupMethod: LookupMethod.BROWSER_AUTOMATION,
      startedAt: new Date().toISOString(),
      completedAt: '',
      durationMs: 0,
      httpRequestCount: 0,
      bytesReceived: 0,
      usedBrowserAutomation: true,
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
