/**
 * Test Valley Borough Council Adapter
 * 
 * Production-quality adapter using Playwright browser automation for Test Valley's HTML form.
 * Test Valley uses a standard form-based interface with alternate weekly collections.
 * 
 * SELECTORS_VALIDATED: false (pending manual verification)
 * THIRD_PARTY_RISK: none
 * 
 * @module adapters/test-valley
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
import { BrowserAdapter } from '../base/browser-adapter.js';
import type { Page } from 'playwright';
import type { TestValleyAddress, TestValleyHtmlData } from './types.js';
import {
  validatePostcode,
  parseAddressCandidates,
  parseCollectionEvents,
  parseCollectionServices,
  calculateConfidence,
} from './parser.js';
import {
  navigateToLookupPage,
  fillPostcodeField,
  dismissCookieConsent,
  validateOnDomain,
} from '../base/form-adapter.js';
import { v4 as uuidv4 } from 'uuid';

const ADAPTER_VERSION = '1.0.0';
const SELECTORS_VALIDATED = false;

// Configurable URLs via environment variables
const TEST_VALLEY_BASE_URL = process.env.TEST_VALLEY_BASE_URL || 'https://www.testvalley.gov.uk';
const TEST_VALLEY_LOOKUP_PATH = '/wasteandrecycling/when-are-my-bins-collected';

export class TestValleyAdapter extends BrowserAdapter implements CouncilAdapter {
  readonly councilId = 'test-valley';
  
  constructor() {
    super({
      allowedDomains: ['testvalley.gov.uk'],
      navigationTimeout: 30000,
      scriptTimeout: 15000,
      captureScreenshots: true,
      captureHar: false,
      headless: true,
    });
  }
  
  async discoverCapabilities(): Promise<CouncilCapabilities> {
    return {
      councilId: this.councilId,
      councilName: 'Test Valley Borough Council',
      councilWebsite: TEST_VALLEY_BASE_URL,
      supportsAddressLookup: true,
      supportsCollectionServices: true,
      supportsCollectionEvents: true,
      providesUprn: false,
      primaryLookupMethod: LookupMethod.BROWSER_AUTOMATION,
      maxEventRangeDays: 365,
      supportedServiceTypes: [
        ServiceType.GENERAL_WASTE,
        ServiceType.RECYCLING,
        ServiceType.GARDEN_WASTE,
      ],
      limitations: [
        'Requires browser automation (HTML form)',
        'Alternate weekly collections (black/brown bins)',
        'Selectors not yet validated in production',
      ],
      rateLimitRpm: 8,
      adapterLastUpdated: '2026-03-25',
      isProductionReady: false,
    };
  }
  
  async resolveAddresses(input: PropertyLookupInput): Promise<AddressCandidateResult> {
    const metadata = this.createMetadata();
    metadata.usedBrowserAutomation = true;
    
    // Validate postcode
    const validation = validatePostcode(input.postcode);
    if (!validation.valid) {
      return this.failureResult(
        metadata,
        FailureCategory.VALIDATION_ERROR,
        validation.error || 'Invalid postcode'
      );
    }
    
    // Check kill switch
    if (process.env.ADAPTER_KILL_SWITCH_TEST_VALLEY === 'true') {
      return this.failureResult(
        metadata,
        FailureCategory.ADAPTER_ERROR,
        'Adapter disabled via kill switch'
      );
    }
    
    // Log warning if selectors not validated
    if (!SELECTORS_VALIDATED) {
      console.warn('[TEST_VALLEY] Selectors not yet validated in production — schema drift risk');
    }
    
    try {
      const result = await this.executeBrowserTask<AddressCandidate[]>(async (page) => {
        const lookupUrl = `${TEST_VALLEY_BASE_URL}${TEST_VALLEY_LOOKUP_PATH}`;
        const navResult = await navigateToLookupPage(page, {
          baseUrl: lookupUrl,
          expectedDomain: 'testvalley.gov.uk',
        });
        
        if (!navResult.success) {
          throw new Error(navResult.error || 'Navigation failed');
        }
        
        await dismissCookieConsent(page);
        await page.waitForTimeout(2000);
        
        const postcodeResult = await fillPostcodeField(
          page,
          'input[name*="postcode" i], input[placeholder*="postcode" i], input[type="text"]',
          validation.normalized!
        );
        
        if (!postcodeResult.success) {
          throw new Error(postcodeResult.error || 'Failed to fill postcode');
        }
        
        const submitButton = page.locator('button[type="submit"], button:has-text("Search"), button:has-text("Find")').first();
        await submitButton.click();
        
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(3000);
        
        if (!validateOnDomain(page, 'testvalley.gov.uk')) {
          throw new Error('Redirected off testvalley.gov.uk domain');
        }
        
        const addresses = await this.extractAddresses(page);
        
        return parseAddressCandidates(addresses, validation.normalized!);
      });
      
      if (!result.success) {
        return this.failureResult(
          metadata,
          result.failureCategory || FailureCategory.UNKNOWN,
          result.error || 'Browser automation failed'
        );
      }
      
      metadata.completedAt = new Date().toISOString();
      metadata.durationMs = Date.now() - new Date(metadata.startedAt).getTime();
      
      const warnings: string[] = [];
      if (!SELECTORS_VALIDATED) {
        warnings.push('Selectors not validated — schema drift risk');
      }
      if (result.data && result.data.length === 0) {
        warnings.push('No addresses found for postcode');
      }
      
      return {
        success: true,
        data: result.data || [],
        acquisitionMetadata: metadata,
        confidence: result.data && result.data.length > 0 ? 1.0 : 0.5,
        warnings,
        securityWarnings: [],
        fromCache: false,
      };
    } catch (error) {
      return this.handleError(metadata, error);
    } finally {
      await this.cleanup();
    }
  }
  
  async getCollectionServices(input: PropertyIdentity): Promise<CollectionServiceResult> {
    const metadata = this.createMetadata();
    metadata.usedBrowserAutomation = true;
    
    try {
      const htmlData = await this.fetchCollectionData(input, metadata);
      
      if (!htmlData) {
        return this.failureResult(
          metadata,
          FailureCategory.NOT_FOUND,
          'Failed to fetch collection data'
        );
      }
      
      const services = parseCollectionServices(htmlData);
      
      metadata.completedAt = new Date().toISOString();
      metadata.durationMs = Date.now() - new Date(metadata.startedAt).getTime();
      
      return {
        success: true,
        data: services,
        acquisitionMetadata: metadata,
        confidence: calculateConfidence(htmlData),
        warnings: htmlData.warnings,
        securityWarnings: [],
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
    
    try {
      const htmlData = await this.fetchCollectionData(input, metadata);
      
      if (!htmlData) {
        return this.failureResult(
          metadata,
          FailureCategory.NOT_FOUND,
          'Failed to fetch collection data'
        );
      }
      
      let events = parseCollectionEvents(htmlData);
      
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
        confidence: calculateConfidence(htmlData),
        warnings: htmlData.warnings,
        securityWarnings: [],
        fromCache: false,
      };
    } catch (error) {
      return this.handleError(metadata, error);
    } finally {
      await this.cleanup();
    }
  }
  
  async verifyHealth(): Promise<AdapterHealth> {
    const metadata = this.createMetadata();
    
    try {
      const testPostcode = 'SP10 1AA';
      const validation = validatePostcode(testPostcode);
      
      if (!validation.valid) {
        return {
          councilId: this.councilId,
          status: HealthStatus.UNHEALTHY,
          lastFailureAt: new Date().toISOString(),
          lastFailureCategory: FailureCategory.ADAPTER_ERROR,
          lastFailureMessage: 'Test postcode validation failed',
          successRate24h: 0,
          avgResponseTimeMs24h: 0,
          acquisitionCount24h: 0,
          checkedAt: new Date().toISOString(),
          upstreamReachable: false,
          schemaDriftDetected: false,
        };
      }
      
      const result = await this.executeBrowserTask(async (page) => {
        const lookupUrl = `${TEST_VALLEY_BASE_URL}${TEST_VALLEY_LOOKUP_PATH}`;
        const navResult = await navigateToLookupPage(page, {
          baseUrl: lookupUrl,
          expectedDomain: 'testvalley.gov.uk',
        });
        return navResult.success;
      });
      
      await this.cleanup();
      
      return {
        councilId: this.councilId,
        status: result.success ? HealthStatus.HEALTHY : HealthStatus.UNHEALTHY,
        lastSuccessAt: result.success ? new Date().toISOString() : undefined,
        lastFailureAt: !result.success ? new Date().toISOString() : undefined,
        lastFailureCategory: result.failureCategory,
        lastFailureMessage: result.error,
        successRate24h: result.success ? 1.0 : 0.0,
        avgResponseTimeMs24h: metadata.durationMs || 0,
        acquisitionCount24h: 1,
        checkedAt: new Date().toISOString(),
        upstreamReachable: result.success || 
          result.failureCategory !== FailureCategory.NETWORK_ERROR,
        schemaDriftDetected: result.failureCategory === FailureCategory.SCHEMA_DRIFT,
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
      requiresBrowserAutomation: true,
      executesJavaScript: false,
      externalDomains: ['testvalley.gov.uk'],
      handlesCredentials: false,
      securityConcerns: [
        'Browser automation required',
        'Selectors not validated — schema drift risk',
        'Form updates may break adapter',
      ],
      lastSecurityReview: '2026-03-25',
      isSandboxed: true,
      networkIsolation: 'allowlist_only',
      requiredPermissions: ['network_egress_https', 'browser_automation'],
    };
  }
  
  private async extractAddresses(page: Page): Promise<TestValleyAddress[]> {
    const addresses: TestValleyAddress[] = [];
    
    const selectors = [
      'select[name*="address" i] option',
      'div[class*="address" i]',
      'li[data-address]',
      'a[href*="property"]',
    ];
    
    for (const selector of selectors) {
      const elements = await page.locator(selector).all();
      
      if (elements.length === 0) continue;
      
      for (let i = 0; i < elements.length; i++) {
        const element = elements[i];
        const text = await element.textContent();
        const value = await element.getAttribute('value') || 
                     await element.getAttribute('data-id') ||
                     await element.getAttribute('href');
        
        if (text && text.trim() !== '' && text.toLowerCase() !== 'select') {
          addresses.push({
            address: text.trim(),
            propertyId: value || `addr-${i}`,
          });
        }
      }
      
      if (addresses.length > 0) break;
    }
    
    return addresses;
  }
  
  private async fetchCollectionData(
    input: PropertyIdentity,
    metadata: AcquisitionMetadata
  ): Promise<TestValleyHtmlData | null> {
    const result = await this.executeBrowserTask<TestValleyHtmlData>(async (page) => {
      const lookupUrl = `${TEST_VALLEY_BASE_URL}${TEST_VALLEY_LOOKUP_PATH}`;
      const navResult = await navigateToLookupPage(page, {
        baseUrl: lookupUrl,
        expectedDomain: 'testvalley.gov.uk',
      });
      
      if (!navResult.success) {
        throw new Error(navResult.error || 'Navigation failed');
      }
      
      await dismissCookieConsent(page);
      await page.waitForTimeout(2000);
      
      await fillPostcodeField(
        page,
        'input[name*="postcode" i], input[placeholder*="postcode" i]',
        input.postcode
      );
      
      const submitButton = page.locator('button[type="submit"], button:has-text("Search")').first();
      await submitButton.click();
      
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);
      
      const addressElements = await page.locator('select[name*="address" i]').all();
      if (addressElements.length > 0) {
        await page.selectOption('select[name*="address" i]', input.councilLocalId);
        const confirmButton = page.locator('button[type="submit"], button:has-text("View")').first();
        await confirmButton.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(3000);
      }
      
      return await this.parseCollectionSchedule(page);
    });
    
    if (!result.success) {
      return null;
    }
    
    return result.data || null;
  }
  
  private async parseCollectionSchedule(page: Page): Promise<TestValleyHtmlData> {
    const warnings: string[] = [];
    const collections: any[] = [];
    
    const collectionSelectors = [
      'table tr',
      'div[class*="collection" i]',
      'div[class*="schedule" i]',
      'li[class*="bin" i]',
    ];
    
    for (const selector of collectionSelectors) {
      const rows = await page.locator(selector).all();
      
      for (const row of rows) {
        const text = await row.textContent();
        if (!text) continue;
        
        const serviceMatch = text.match(/(Refuse|Recycling|Food|Garden|Glass|Waste|Black|Blue|Brown|Green)\s*(bin)?/i);
        const dateMatch = text.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{1,2}(?:st|nd|rd|th)?\s+\w+(?:\s+\d{4})?/i);
        
        if (serviceMatch && dateMatch) {
          collections.push({
            service: serviceMatch[0],
            collectionDate: dateMatch[0],
          });
        }
      }
      
      if (collections.length > 0) break;
    }
    
    if (collections.length === 0) {
      warnings.push('No collection data found — form structure may have changed');
    }
    
    return {
      collections,
      warnings,
    };
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
