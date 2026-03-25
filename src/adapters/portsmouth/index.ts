/**
 * Portsmouth City Council Adapter
 * 
 * Production-quality adapter using Playwright browser automation for Portsmouth's Granicus portal.
 * Portsmouth uses a Granicus-based platform (my.portsmouth.gov.uk) which requires session management.
 * 
 * SELECTORS_VALIDATED: false (pending manual verification)
 * THIRD_PARTY_RISK: Granicus platform (managed service)
 * 
 * @module adapters/portsmouth
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
import type { PortsmouthAddress, PortsmouthHtmlData } from './types.js';
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
const PORTSMOUTH_BASE_URL = process.env.PORTSMOUTH_BASE_URL || 'https://my.portsmouth.gov.uk';
const PORTSMOUTH_LOOKUP_PATH = '/service/collection_schedules';

export class PortsmouthAdapter extends BrowserAdapter implements CouncilAdapter {
  readonly councilId = 'portsmouth';
  
  constructor() {
    super({
      allowedDomains: ['portsmouth.gov.uk', 'my.portsmouth.gov.uk'],
      navigationTimeout: 35000,
      scriptTimeout: 15000,
      captureScreenshots: true,
      captureHar: false,
      headless: true,
    });
  }
  
  async discoverCapabilities(): Promise<CouncilCapabilities> {
    return {
      councilId: this.councilId,
      councilName: 'Portsmouth City Council',
      councilWebsite: PORTSMOUTH_BASE_URL,
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
        ServiceType.FOOD_WASTE,
      ],
      limitations: [
        'Requires browser automation (Granicus portal)',
        'Session/Cookie management required',
        'Potential CSRF token handling',
        'Selectors not yet validated in production',
      ],
      rateLimitRpm: 6,
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
    if (process.env.ADAPTER_KILL_SWITCH_PORTSMOUTH === 'true') {
      return this.failureResult(
        metadata,
        FailureCategory.ADAPTER_ERROR,
        'Adapter disabled via kill switch'
      );
    }
    
    // Log warning if selectors not validated
    if (!SELECTORS_VALIDATED) {
      console.warn('[PORTSMOUTH] Selectors not yet validated in production — schema drift risk');
    }
    
    try {
      const result = await this.executeBrowserTask<AddressCandidate[]>(async (page) => {
        const lookupUrl = `${PORTSMOUTH_BASE_URL}${PORTSMOUTH_LOOKUP_PATH}`;
        const navResult = await navigateToLookupPage(page, {
          baseUrl: lookupUrl,
          expectedDomain: 'my.portsmouth.gov.uk',
        });
        
        if (!navResult.success) {
          throw new Error(navResult.error || 'Navigation failed');
        }
        
        // Handle Granicus-specific cookie consent
        await this.handleGranicusCookieConsent(page);
        await page.waitForTimeout(2500);
        
        const postcodeResult = await fillPostcodeField(
          page,
          'input[name*="postcode" i], input[placeholder*="postcode" i], input[id*="postcode" i]',
          validation.normalized!
        );
        
        if (!postcodeResult.success) {
          throw new Error(postcodeResult.error || 'Failed to fill postcode');
        }
        
        const submitButton = page.locator('button[type="submit"], button:has-text("Find"), button:has-text("Search")').first();
        await submitButton.click();
        
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(3500);
        
        if (!validateOnDomain(page, 'my.portsmouth.gov.uk')) {
          throw new Error('Redirected off my.portsmouth.gov.uk domain');
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
      const testPostcode = 'PO1 1AA';
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
        const lookupUrl = `${PORTSMOUTH_BASE_URL}${PORTSMOUTH_LOOKUP_PATH}`;
        const navResult = await navigateToLookupPage(page, {
          baseUrl: lookupUrl,
          expectedDomain: 'my.portsmouth.gov.uk',
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
      riskLevel: ExecutionRiskLevel.MEDIUM,
      requiresBrowserAutomation: true,
      executesJavaScript: true,
      externalDomains: ['my.portsmouth.gov.uk', 'portsmouth.gov.uk'],
      handlesCredentials: false,
      securityConcerns: [
        'Browser automation required (Granicus portal)',
        'Session and cookie management needed',
        'Potential CSRF token handling',
        'Selectors not validated — schema drift risk',
        'Third-party platform (Granicus)',
      ],
      lastSecurityReview: '2026-03-25',
      isSandboxed: true,
      networkIsolation: 'allowlist_only',
      requiredPermissions: ['network_egress_https', 'browser_automation'],
    };
  }
  
  private async handleGranicusCookieConsent(page: Page): Promise<void> {
    // Try multiple cookie consent button selectors (Granicus uses various implementations)
    const selectors = [
      'button[id*="cookie" i]',
      'button:has-text("Accept")',
      'button:has-text("Agree")',
      'a[id*="cookie" i]',
      '[role="button"][aria-label*="cookie" i]',
    ];
    
    for (const selector of selectors) {
      try {
        const button = page.locator(selector).first();
        if (await button.isVisible()) {
          await button.click();
          await page.waitForTimeout(500);
          break;
        }
      } catch {
        // Continue to next selector
      }
    }
  }
  
  private async extractAddresses(page: Page): Promise<PortsmouthAddress[]> {
    const addresses: PortsmouthAddress[] = [];
    
    const selectors = [
      'select[name*="address" i] option',
      'div[class*="address" i] button',
      'div[class*="property" i]',
      'li[data-address]',
      'a[href*="property"]',
      '.address-option',
      '[data-property-id]',
    ];
    
    for (const selector of selectors) {
      const elements = await page.locator(selector).all();
      
      if (elements.length === 0) continue;
      
      for (let i = 0; i < elements.length; i++) {
        const element = elements[i];
        const text = await element.textContent();
        const value = await element.getAttribute('value') || 
                     await element.getAttribute('data-id') ||
                     await element.getAttribute('data-property-id') ||
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
  ): Promise<PortsmouthHtmlData | null> {
    const result = await this.executeBrowserTask<PortsmouthHtmlData>(async (page) => {
      const lookupUrl = `${PORTSMOUTH_BASE_URL}${PORTSMOUTH_LOOKUP_PATH}`;
      const navResult = await navigateToLookupPage(page, {
        baseUrl: lookupUrl,
        expectedDomain: 'my.portsmouth.gov.uk',
      });
      
      if (!navResult.success) {
        throw new Error(navResult.error || 'Navigation failed');
      }
      
      await this.handleGranicusCookieConsent(page);
      await page.waitForTimeout(2500);
      
      await fillPostcodeField(
        page,
        'input[name*="postcode" i], input[placeholder*="postcode" i]',
        input.postcode
      );
      
      const submitButton = page.locator('button[type="submit"], button:has-text("Find")').first();
      await submitButton.click();
      
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3500);
      
      const addressElements = await page.locator('select[name*="address" i], div[class*="address-select" i]').all();
      if (addressElements.length > 0) {
        try {
          await page.selectOption('select[name*="address" i]', input.councilLocalId);
        } catch {
          // Address may be a button, not a select
          const addressButton = page.locator(`button:has-text("${input.councilLocalId}")`).first();
          if (await addressButton.isVisible()) {
            await addressButton.click();
          }
        }
        
        const confirmButton = page.locator('button[type="submit"], button:has-text("View"), button:has-text("Continue")').first();
        await confirmButton.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(3500);
      }
      
      return await this.parseCollectionSchedule(page);
    });
    
    if (!result.success) {
      return null;
    }
    
    return result.data || null;
  }
  
  private async parseCollectionSchedule(page: Page): Promise<PortsmouthHtmlData> {
    const warnings: string[] = [];
    const collections: any[] = [];
    
    const collectionSelectors = [
      'table tr',
      'div[class*="collection" i]',
      'div[class*="schedule" i]',
      'div[class*="bin" i]',
      '[data-collection]',
      '.collection-item',
    ];
    
    for (const selector of collectionSelectors) {
      const rows = await page.locator(selector).all();
      
      for (const row of rows) {
        const text = await row.textContent();
        if (!text) continue;
        
        const serviceMatch = text.match(/(Refuse|Recycling|Food|Garden|Glass|Waste|Grey|Blue|Brown|Green|General|Mixed)\s*(bin|waste)?/i);
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
      warnings.push('No collection data found — Granicus portal structure may have changed');
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
