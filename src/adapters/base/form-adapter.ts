/**
 * Shared Form Automation Base for Council Adapters
 * 
 * Provides reusable helpers for HTML form-based council adapters:
 * - Postcode field filling
 * - Address list selection
 * - Domain validation
 * - Evidence capture
 * 
 * @module adapters/base/form-adapter
 */

import type { Page } from 'playwright';
import { FailureCategory } from './adapter.interface.js';
import type { BrowserResult } from './browser-adapter.js';

export interface FormNavigationOptions {
  /** Base URL to navigate to */
  baseUrl: string;
  
  /** Expected domain for validation */
  expectedDomain: string;
  
  /** Timeout in milliseconds */
  timeout?: number;
}

export interface FormFieldSelectors {
  /** Postcode input field selector */
  postcodeField: string;
  
  /** Submit button selector */
  submitButton: string;
  
  /** Address select/list selector */
  addressSelect?: string;
  
  /** Address list items selector (alternative to select) */
  addressListItems?: string;
}

/**
 * Navigate to lookup page and validate domain.
 */
export async function navigateToLookupPage(
  page: Page,
  options: FormNavigationOptions
): Promise<BrowserResult<void>> {
  try {
    const url = new URL(options.baseUrl);
    const expectedDomain = options.expectedDomain;
    
    // Navigate to page
    await page.goto(options.baseUrl, {
      waitUntil: 'networkidle',
      timeout: options.timeout || 30000,
    });
    
    // Validate domain (ensure no redirect)
    const currentUrl = new URL(page.url());
    if (!currentUrl.hostname.endsWith(expectedDomain)) {
      return {
        success: false,
        error: `Domain validation failed: expected ${expectedDomain}, got ${currentUrl.hostname}`,
        failureCategory: FailureCategory.ADAPTER_ERROR,
      };
    }
    
    return { success: true };
  } catch (error) {
    if (error instanceof Error && error.message.includes('timeout')) {
      return {
        success: false,
        error: `Navigation timeout after ${options.timeout || 30000}ms`,
        failureCategory: FailureCategory.TIMEOUT,
      };
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Navigation failed',
      failureCategory: FailureCategory.NETWORK_ERROR,
    };
  }
}

/**
 * Fill postcode field with validation.
 */
export async function fillPostcodeField(
  page: Page,
  selector: string,
  postcode: string
): Promise<BrowserResult<void>> {
  try {
    const input = page.locator(selector).first();
    const count = await input.count();
    
    if (count === 0) {
      return {
        success: false,
        error: 'Postcode input field not found — page structure may have changed',
        failureCategory: FailureCategory.SCHEMA_DRIFT,
      };
    }
    
    await input.fill(postcode);
    
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fill postcode field',
      failureCategory: FailureCategory.ADAPTER_ERROR,
    };
  }
}

/**
 * Wait for address list to appear after postcode submission.
 */
export async function waitForAddressList(
  page: Page,
  selector: string,
  timeout: number = 10000
): Promise<BrowserResult<void>> {
  try {
    await page.waitForSelector(selector, { timeout });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: `Address list not found after ${timeout}ms — no results or page structure changed`,
      failureCategory: FailureCategory.NOT_FOUND,
    };
  }
}

/**
 * Select address from dropdown or list.
 */
export async function selectAddress(
  page: Page,
  addressId: string,
  selectors: { select?: string; listItem?: string }
): Promise<BrowserResult<void>> {
  try {
    // Try dropdown first
    if (selectors.select) {
      const selectCount = await page.locator(selectors.select).count();
      if (selectCount > 0) {
        await page.locator(selectors.select).selectOption(addressId);
        return { success: true };
      }
    }
    
    // Try list item click
    if (selectors.listItem) {
      const items = await page.locator(selectors.listItem).all();
      for (const item of items) {
        const value = await item.getAttribute('data-id') || 
                     await item.getAttribute('href') || 
                     await item.getAttribute('value');
        
        if (value === addressId) {
          await item.click();
          return { success: true };
        }
      }
    }
    
    return {
      success: false,
      error: 'Address selection element not found',
      failureCategory: FailureCategory.SCHEMA_DRIFT,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to select address',
      failureCategory: FailureCategory.ADAPTER_ERROR,
    };
  }
}

/**
 * Capture page evidence (screenshot + HTML).
 */
export async function capturePageEvidence(
  page: Page
): Promise<{ screenshot?: Buffer; html?: string }> {
  try {
    const screenshot = await page.screenshot({ fullPage: true, type: 'png' });
    const html = await page.content();
    
    return { screenshot, html };
  } catch (error) {
    console.error('Failed to capture evidence:', error);
    return {};
  }
}

/**
 * Validate current page is on expected domain.
 */
export function validateOnDomain(page: Page, expectedDomain: string): boolean {
  try {
    const url = new URL(page.url());
    return url.hostname.endsWith(expectedDomain);
  } catch {
    return false;
  }
}

/**
 * Dismiss cookie consent banner if present.
 */
export async function dismissCookieConsent(page: Page): Promise<void> {
  try {
    // Common cookie consent button patterns
    const selectors = [
      'button:has-text("Accept")',
      'button:has-text("Accept all")',
      'button:has-text("I agree")',
      'button:has-text("OK")',
      'button[id*="cookie" i][id*="accept" i]',
      'a:has-text("Accept")',
    ];
    
    for (const selector of selectors) {
      const button = page.locator(selector).first();
      const count = await button.count();
      
      if (count > 0) {
        await button.click({ timeout: 2000 });
        await page.waitForTimeout(1000);
        break;
      }
    }
  } catch {
    // Silently fail — cookie consent is optional
  }
}
