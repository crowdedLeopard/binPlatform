/**
 * Shared Browser Automation Base for Council Adapters
 * 
 * Wraps Playwright with security hardening:
 * - Timeout enforcement
 * - Network interception for XHR capture
 * - Automatic screenshot on failure (stored as evidence)
 * - Navigation restricted to pre-approved domains
 * 
 * @module adapters/base/browser-adapter
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';
import type { AcquisitionMetadata } from './adapter.interface.js';
import { FailureCategory } from './adapter.interface.js';

export interface BrowserAdapterConfig {
  /** Allowed domains for navigation (e.g., ['rushmoor.gov.uk']) */
  allowedDomains: string[];
  
  /** Page load timeout in milliseconds */
  navigationTimeout: number;
  
  /** Script execution timeout in milliseconds */
  scriptTimeout: number;
  
  /** Whether to capture screenshots on failure */
  captureScreenshots: boolean;
  
  /** Whether to capture HAR (HTTP Archive) for debugging */
  captureHar: boolean;
  
  /** Headless mode */
  headless: boolean;
}

export interface BrowserResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  failureCategory?: FailureCategory;
  screenshotRef?: string;
  harRef?: string;
  networkRequests?: NetworkRequest[];
}

export interface NetworkRequest {
  url: string;
  method: string;
  statusCode?: number;
  requestHeaders: Record<string, string>;
  responseHeaders?: Record<string, string>;
  requestBody?: string;
  responseBody?: string;
  timestamp: string;
}

const DEFAULT_CONFIG: BrowserAdapterConfig = {
  allowedDomains: [],
  navigationTimeout: 30000,
  scriptTimeout: 15000,
  captureScreenshots: true,
  captureHar: false,
  headless: true,
};

/**
 * Base class for browser-based adapters.
 * Provides sandboxed Playwright execution with security controls.
 */
export abstract class BrowserAdapter {
  protected config: BrowserAdapterConfig;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  
  constructor(config: Partial<BrowserAdapterConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * Initialize browser instance.
   * Should be called before any automation.
   */
  protected async initBrowser(): Promise<void> {
    if (this.browser) return;
    
    this.browser = await chromium.launch({
      headless: this.config.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-extensions',
      ],
    });
    
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'en-GB',
      timezoneId: 'Europe/London',
      acceptDownloads: false,
      javaScriptEnabled: true,
      bypassCSP: false,
    });
  }
  
  /**
   * Create a new page with security controls.
   */
  protected async createPage(): Promise<Page> {
    if (!this.context) {
      await this.initBrowser();
    }
    
    const page = await this.context!.newPage();
    
    // Set timeouts
    page.setDefaultNavigationTimeout(this.config.navigationTimeout);
    page.setDefaultTimeout(this.config.scriptTimeout);
    
    // Block navigation to non-allowed domains
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url());
      const isAllowed = this.config.allowedDomains.some(domain => 
        url.hostname.endsWith(domain)
      );
      
      if (!isAllowed && route.request().resourceType() === 'document') {
        route.abort('blockedbyclient');
      } else {
        route.continue();
      }
    });
    
    return page;
  }
  
  /**
   * Navigate to URL with safety checks.
   */
  protected async navigateToUrl(
    page: Page,
    url: string
  ): Promise<BrowserResult<void>> {
    try {
      // Validate URL is in allowed domains
      const urlObj = new URL(url);
      const isAllowed = this.config.allowedDomains.some(domain => 
        urlObj.hostname.endsWith(domain)
      );
      
      if (!isAllowed) {
        return {
          success: false,
          error: `Navigation blocked: ${urlObj.hostname} not in allowed domains`,
          failureCategory: FailureCategory.ADAPTER_ERROR,
        };
      }
      
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: this.config.navigationTimeout,
      });
      
      return { success: true };
    } catch (error) {
      if (error instanceof Error && error.message.includes('timeout')) {
        return {
          success: false,
          error: `Navigation timeout after ${this.config.navigationTimeout}ms`,
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
   * Capture network requests for debugging.
   */
  protected async captureNetworkRequests(page: Page): Promise<NetworkRequest[]> {
    const requests: NetworkRequest[] = [];
    
    page.on('request', (request) => {
      requests.push({
        url: request.url(),
        method: request.method(),
        requestHeaders: request.headers(),
        requestBody: request.postData() || undefined,
        timestamp: new Date().toISOString(),
      });
    });
    
    page.on('response', async (response) => {
      const request = requests.find(r => r.url === response.url());
      if (request) {
        request.statusCode = response.status();
        request.responseHeaders = response.headers();
        
        // Capture response body for JSON/text responses
        const contentType = response.headers()['content-type'] || '';
        if (contentType.includes('json') || contentType.includes('text')) {
          try {
            request.responseBody = await response.text();
          } catch {
            // Ignore if body can't be read
          }
        }
      }
    });
    
    return requests;
  }
  
  /**
   * Take screenshot and store as evidence.
   */
  protected async captureScreenshot(page: Page): Promise<string | undefined> {
    if (!this.config.captureScreenshots) return undefined;
    
    try {
      const screenshot = await page.screenshot({
        fullPage: true,
        type: 'png',
      });
      
      // Store screenshot (implementation depends on evidence storage layer)
      const screenshotRef = `screenshot-${Date.now()}.png`;
      // TODO: Integrate with storeEvidence()
      
      return screenshotRef;
    } catch (error) {
      console.error('Failed to capture screenshot:', error);
      return undefined;
    }
  }
  
  /**
   * Clean up browser resources.
   */
  async cleanup(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
  
  /**
   * Execute browser automation with error handling.
   */
  protected async executeBrowserTask<T>(
    task: (page: Page) => Promise<T>
  ): Promise<BrowserResult<T>> {
    let page: Page | null = null;
    
    try {
      page = await this.createPage();
      const networkRequests = await this.captureNetworkRequests(page);
      
      const result = await task(page);
      
      return {
        success: true,
        data: result,
        networkRequests,
      };
    } catch (error) {
      let screenshotRef: string | undefined;
      if (page && this.config.captureScreenshots) {
        screenshotRef = await this.captureScreenshot(page);
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        failureCategory: this.classifyBrowserError(error),
        screenshotRef,
      };
    } finally {
      if (page) {
        await page.close();
      }
    }
  }
  
  /**
   * Classify browser error into failure category.
   */
  private classifyBrowserError(error: unknown): FailureCategory {
    if (!(error instanceof Error)) return FailureCategory.UNKNOWN;
    
    const message = error.message.toLowerCase();
    
    if (message.includes('timeout')) {
      return FailureCategory.TIMEOUT;
    }
    
    if (message.includes('navigation') || message.includes('net::')) {
      return FailureCategory.NETWORK_ERROR;
    }
    
    if (message.includes('selector') || message.includes('element')) {
      return FailureCategory.SCHEMA_DRIFT;
    }
    
    if (message.includes('blocked')) {
      return FailureCategory.BOT_DETECTION;
    }
    
    return FailureCategory.ADAPTER_ERROR;
  }
}
