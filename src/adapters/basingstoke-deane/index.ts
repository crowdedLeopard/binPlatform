/**
 * Basingstoke & Deane Borough Council Adapter
 * 
 * Production-quality adapter using Playwright browser automation for form-based lookup.
 * Implements postcode-based address resolution and collection schedule retrieval.
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
import type { BasingstokeAddress, BasingstokeHtmlData } from './types.js';
import {
  validatePostcode,
  parseAddressCandidates,
  parseCollectionEvents,
  parseCollectionServices,
  calculateConfidence,
} from './parser.js';
import { v4 as uuidv4 } from 'uuid';

const ADAPTER_VERSION = '1.0.0';
const BASINGSTOKE_URL = process.env.BASINGSTOKE_BASE_URL || 'https://www.basingstoke.gov.uk';
const LOOKUP_PATH = '/bincollections';

// Set to false initially - requires validation against live site
const SELECTORS_VALIDATED = false;

export class BasingstokeDeaneAdapter extends BrowserAdapter implements CouncilAdapter {
  readonly councilId = 'basingstoke-deane';
  
  constructor() {
    super({
      allowedDomains: ['basingstoke.gov.uk'],
      navigationTimeout: 30000,
      scriptTimeout: 15000,
      captureScreenshots: true,
      captureHar: false,
      headless: true,
    });
    
    if (!SELECTORS_VALIDATED) {
      console.warn(`[${this.councilId}] SELECTORS NOT YET VALIDATED - adapter may fail until selectors are verified against live site`);
    }
  }
  
  async discoverCapabilities(): Promise<CouncilCapabilities> {
    return {
      councilId: this.councilId,
      councilName: 'Basingstoke & Deane Borough Council',
      councilWebsite: 'https://www.basingstoke.gov.uk',
      supportsAddressLookup: true,
      supportsCollectionServices: true,
      supportsCollectionEvents: true,
      providesUprn: false,
      primaryLookupMethod: LookupMethod.BROWSER_AUTOMATION,
      maxEventRangeDays: 365,
      supportedServiceTypes: [
        ServiceType.GENERAL_WASTE,
        ServiceType.RECYCLING,
        ServiceType.FOOD_WASTE,
        ServiceType.GARDEN_WASTE,
      ],
      limitations: [
        'Requires browser automation (Playwright)',
        'Slower than API-based adapters',
        'Selectors require validation against live site',
      ],
      rateLimitRpm: 10,
      adapterLastUpdated: '2026-03-25',
      isProductionReady: SELECTORS_VALIDATED,
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
    if (process.env.ADAPTER_KILL_SWITCH_BASINGSTOKE_DEANE === 'true') {
      return this.failureResult(
        metadata,
        FailureCategory.ADAPTER_ERROR,
        'Adapter disabled via kill switch'
      );
    }
    
    try {
      const result = await this.executeBrowserTask<AddressCandidate[]>(async (page) => {
        const lookupUrl = `${BASINGSTOKE_URL}${LOOKUP_PATH}`;
        
        // Navigate to lookup page
        const navResult = await this.navigateToUrl(page, lookupUrl);
        if (!navResult.success) {
          throw new Error(navResult.error || 'Navigation failed');
        }
        
        // TODO: Validate these selectors against live site
        // Find and fill postcode input - try multiple common patterns
        const postcodeInput = await page.locator(
          'input[name*="postcode" i], input[id*="postcode" i], input[placeholder*="postcode" i]'
        ).first();
        
        if (!postcodeInput) {
          throw new Error('Postcode input not found — page structure may have changed (SELECTORS_VALIDATED=false)');
        }
        
        await postcodeInput.fill(validation.normalized!);
        
        // Submit form - try multiple patterns
        const submitButton = await page.locator(
          'button[type="submit"], input[type="submit"], button:has-text("Search"), button:has-text("Find")'
        ).first();
        
        await submitButton.click();
        
        // Wait for results
        await page.waitForLoadState('networkidle');
        
        // Extract addresses from results
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
      
      const warnings = result.data && result.data.length === 0 
        ? ['No addresses found for postcode'] 
        : [];
      
      if (!SELECTORS_VALIDATED) {
        warnings.push('Selectors not yet validated - results may be unreliable');
      }
      
      return {
        success: true,
        data: result.data || [],
        acquisitionMetadata: metadata,
        confidence: result.data && result.data.length > 0 ? 0.75 : 0.5,
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
        confidence: SELECTORS_VALIDATED ? calculateConfidence(htmlData) : 0.5,
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
        confidence: SELECTORS_VALIDATED ? calculateConfidence(htmlData) : 0.5,
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
      const testPostcode = 'RG24 8PJ'; // Basingstoke area test postcode
      const validation = validatePostcode(testPostcode);
      
      if (!validation.valid) {
        return this.createUnhealthyStatus('Test postcode validation failed');
      }
      
      const result = await this.executeBrowserTask(async (page) => {
        const lookupUrl = `${BASINGSTOKE_URL}${LOOKUP_PATH}`;
        const navResult = await this.navigateToUrl(page, lookupUrl);
        return navResult.success;
      });
      
      await this.cleanup();
      
      if (result.success) {
        return {
          councilId: this.councilId,
          status: SELECTORS_VALIDATED ? HealthStatus.HEALTHY : HealthStatus.DEGRADED,
          lastSuccessAt: new Date().toISOString(),
          successRate24h: 1.0,
          avgResponseTimeMs24h: metadata.durationMs || 0,
          acquisitionCount24h: 1,
          checkedAt: new Date().toISOString(),
          upstreamReachable: true,
          schemaDriftDetected: false,
        };
      } else {
        return this.createUnhealthyStatus(result.error || 'Health check failed', result.failureCategory);
      }
    } catch (error) {
      return this.createUnhealthyStatus(
        error instanceof Error ? error.message : 'Unknown error',
        FailureCategory.UNKNOWN
      );
    }
  }
  
  async securityProfile(): Promise<AdapterSecurityProfile> {
    return {
      councilId: this.councilId,
      riskLevel: ExecutionRiskLevel.MEDIUM,
      requiresBrowserAutomation: true,
      executesJavaScript: true,
      externalDomains: ['basingstoke.gov.uk'],
      handlesCredentials: false,
      securityConcerns: [
        'Browser automation required — resource intensive',
        'Executes JavaScript from basingstoke.gov.uk',
        'Page structure changes will break adapter',
        'Selectors not yet validated against live site',
      ],
      lastSecurityReview: '2026-03-25',
      isSandboxed: true,
      networkIsolation: 'allowlist_only',
      requiredPermissions: ['network_egress_https', 'browser_automation'],
    };
  }
  
  /**
   * Extract addresses from search results page.
   * TODO: Validate these selectors against live Basingstoke site.
   */
  private async extractAddresses(page: Page): Promise<BasingstokeAddress[]> {
    const addresses: BasingstokeAddress[] = [];
    
    // Try to extract addresses from various possible structures
    // Pattern 1: Select dropdown
    const selectOptions = await page.locator('select[name*="address" i] option, select[id*="address" i] option').all();
    
    for (const option of selectOptions) {
      const text = await option.textContent();
      const value = await option.getAttribute('value');
      
      if (text && value && text.trim() !== '' && text.trim().toLowerCase() !== 'select') {
        addresses.push({
          address: text.trim(),
          propertyId: value,
        });
      }
    }
    
    // Pattern 2: List items with links or radio buttons
    if (addresses.length === 0) {
      const listItems = await page.locator(
        'ul li a, div.address-item, label:has(input[type="radio"])'
      ).all();
      
      for (let i = 0; i < listItems.length; i++) {
        const item = listItems[i];
        const text = await item.textContent();
        const href = await item.getAttribute('href');
        const radioValue = await item.locator('input[type="radio"]').getAttribute('value');
        
        if (text && text.trim() !== '') {
          addresses.push({
            address: text.trim(),
            propertyId: radioValue || href || `addr-${i}`,
          });
        }
      }
    }
    
    // Pattern 3: Table rows
    if (addresses.length === 0) {
      const tableRows = await page.locator('table tbody tr').all();
      
      for (let i = 0; i < tableRows.length; i++) {
        const row = tableRows[i];
        const cells = await row.locator('td').allTextContents();
        const link = await row.locator('a').getAttribute('href');
        
        if (cells.length > 0 && cells[0].trim() !== '') {
          addresses.push({
            address: cells[0].trim(),
            propertyId: link || `row-${i}`,
          });
        }
      }
    }
    
    return addresses;
  }
  
  /**
   * Fetch collection data for a property.
   */
  private async fetchCollectionData(
    input: PropertyIdentity,
    metadata: AcquisitionMetadata
  ): Promise<BasingstokeHtmlData | null> {
    const result = await this.executeBrowserTask<BasingstokeHtmlData>(async (page) => {
      const lookupUrl = `${BASINGSTOKE_URL}${LOOKUP_PATH}`;
      
      // Navigate and perform lookup
      const navResult = await this.navigateToUrl(page, lookupUrl);
      if (!navResult.success) {
        throw new Error(navResult.error || 'Navigation failed');
      }
      
      // Fill postcode and search
      const postcodeInput = await page.locator(
        'input[name*="postcode" i], input[id*="postcode" i]'
      ).first();
      await postcodeInput.fill(input.postcode);
      
      const submitButton = await page.locator(
        'button[type="submit"], input[type="submit"]'
      ).first();
      await submitButton.click();
      
      await page.waitForLoadState('networkidle');
      
      // Select address if multiple results
      try {
        const addressSelect = await page.locator('select[name*="address" i]').first();
        if (addressSelect && await addressSelect.count() > 0) {
          await addressSelect.selectOption(input.councilLocalId);
          const confirmButton = await page.locator('button[type="submit"]').first();
          await confirmButton.click();
          await page.waitForLoadState('networkidle');
        }
      } catch {
        // Address selection not needed or pattern different
      }
      
      // Extract collection schedule from results page
      return await this.parseCollectionSchedule(page);
    });
    
    if (!result.success) {
      return null;
    }
    
    return result.data || null;
  }
  
  /**
   * Parse collection schedule from results page.
   * TODO: Validate these selectors against live Basingstoke site.
   */
  private async parseCollectionSchedule(page: Page): Promise<BasingstokeHtmlData> {
    const warnings: string[] = [];
    const collections: any[] = [];
    
    // Try to extract collection data from common patterns
    const collectionRows = await page.locator(
      'table tr, .collection-item, .bin-schedule div, dl dt, ul li'
    ).all();
    
    for (const row of collectionRows) {
      const text = await row.textContent();
      if (!text) continue;
      
      // Extract service type and date (best-effort pattern matching)
      const serviceMatch = text.match(/(rubbish|recycl|food|garden|waste|bin)/i);
      const dateMatch = text.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{1,2}(?:st|nd|rd|th)?\s+\w+/i);
      
      if (serviceMatch && dateMatch) {
        collections.push({
          service: serviceMatch[0],
          collectionDate: dateMatch[0],
        });
      }
    }
    
    if (collections.length === 0) {
      warnings.push('No collection data found on page — structure may have changed or selectors need validation');
    }
    
    if (!SELECTORS_VALIDATED) {
      warnings.push('Selectors not validated - parsing may be incomplete');
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
  
  private createUnhealthyStatus(
    message: string,
    category?: FailureCategory
  ): AdapterHealth {
    return {
      councilId: this.councilId,
      status: HealthStatus.UNHEALTHY,
      lastFailureAt: new Date().toISOString(),
      lastFailureCategory: category || FailureCategory.UNKNOWN,
      lastFailureMessage: message,
      successRate24h: 0,
      avgResponseTimeMs24h: 0,
      acquisitionCount24h: 0,
      checkedAt: new Date().toISOString(),
      upstreamReachable: false,
      schemaDriftDetected: false,
    };
  }
}
