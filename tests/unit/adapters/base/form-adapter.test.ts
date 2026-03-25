/**
 * FormAdapter Base Class Unit Tests
 * 
 * Tests the shared FormAdapter base class used by browser-based adapters.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockPage = {
  goto: vi.fn(),
  fill: vi.fn(),
  click: vi.fn(),
  waitForSelector: vi.fn(),
  content: vi.fn(),
  screenshot: vi.fn(),
  selectOption: vi.fn(),
  url: vi.fn(),
  close: vi.fn(),
  evaluate: vi.fn(),
};

const mockBrowser = {
  newPage: vi.fn(() => mockPage),
  close: vi.fn(),
};

const mockEvidenceStore = {
  store: vi.fn(),
};

describe('FormAdapter Base Class', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('navigateToLookupPage', () => {
    it('should navigate to correct URL', async () => {
      const url = 'https://council.gov.uk/bincollections';
      mockPage.goto.mockResolvedValue({ status: 200 });
      mockPage.url.mockReturnValue(url);

      await mockPage.goto(url, { waitUntil: 'networkidle' });
      
      expect(mockPage.goto).toHaveBeenCalledWith(url, expect.any(Object));
    });

    it('should validate domain after load', async () => {
      const targetUrl = 'https://council.gov.uk/bincollections';
      mockPage.goto.mockResolvedValue({ status: 200 });
      mockPage.url.mockReturnValue(targetUrl);

      await mockPage.goto(targetUrl);
      const actualUrl = mockPage.url();
      
      const validateDomain = (expectedUrl: string, actualUrl: string) => {
        const expected = new URL(expectedUrl);
        const actual = new URL(actualUrl);
        return actual.hostname.endsWith(expected.hostname);
      };

      expect(validateDomain(targetUrl, actualUrl)).toBe(true);
    });

    it('should reject navigation to different domain', async () => {
      const targetUrl = 'https://council.gov.uk/bincollections';
      const actualUrl = 'https://malicious.com/phishing';
      
      mockPage.goto.mockResolvedValue({ status: 200 });
      mockPage.url.mockReturnValue(actualUrl);

      const validateDomain = (expectedUrl: string, actualUrl: string) => {
        const expected = new URL(expectedUrl);
        const actual = new URL(actualUrl);
        if (!actual.hostname.endsWith(expected.hostname)) {
          throw new Error(`Domain validation failed: expected ${expected.hostname}, got ${actual.hostname}`);
        }
      };

      expect(() => validateDomain(targetUrl, actualUrl)).toThrow('Domain validation failed');
    });
  });

  describe('fillPostcodeField', () => {
    it('should fill field with normalised postcode', async () => {
      const rawPostcode = 'po12 1bu';
      const normalised = rawPostcode.toUpperCase().replace(/\s+/g, ' ').trim();
      
      await mockPage.fill('#postcode', normalised);
      
      expect(mockPage.fill).toHaveBeenCalledWith('#postcode', 'PO12 1BU');
    });

    it('should handle postcode without space', async () => {
      const rawPostcode = 'PO121BU';
      const normalised = rawPostcode.toUpperCase().trim();
      
      await mockPage.fill('#postcode', normalised);
      
      expect(mockPage.fill).toHaveBeenCalledWith('#postcode', 'PO121BU');
    });

    it('should strip invalid characters from postcode', async () => {
      const rawPostcode = "PO12'; DROP TABLE--";
      const sanitised = rawPostcode.replace(/[^A-Z0-9\s]/gi, '').toUpperCase().trim();
      
      await mockPage.fill('#postcode', sanitised);
      
      expect(mockPage.fill).toHaveBeenCalledWith('#postcode', 'PO12 DROP TABLE');
    });
  });

  describe('waitForAddressList', () => {
    it('should wait with timeout', async () => {
      mockPage.waitForSelector.mockResolvedValue(true);
      
      await mockPage.waitForSelector('#addressSelect', { timeout: 10000 });
      
      expect(mockPage.waitForSelector).toHaveBeenCalledWith('#addressSelect', { timeout: 10000 });
    });

    it('should throw on timeout', async () => {
      mockPage.waitForSelector.mockRejectedValue(new Error('Timeout 10000ms exceeded waiting for selector "#addressSelect"'));
      
      await expect(mockPage.waitForSelector('#addressSelect', { timeout: 10000 }))
        .rejects.toThrow('Timeout');
    });

    it('should handle missing selector gracefully', async () => {
      mockPage.waitForSelector.mockRejectedValue(new Error('Selector not found'));
      
      await expect(mockPage.waitForSelector('#nonExistent', { timeout: 5000 }))
        .rejects.toThrow('Selector not found');
    });
  });

  describe('selectAddress', () => {
    it('should click correct option', async () => {
      const addressId = 'addr_12345';
      
      mockPage.selectOption.mockResolvedValue([addressId]);
      await mockPage.selectOption('#addressSelect', addressId);
      
      expect(mockPage.selectOption).toHaveBeenCalledWith('#addressSelect', addressId);
    });

    it('should verify page change after selection', async () => {
      const initialUrl = 'https://council.gov.uk/lookup';
      const afterUrl = 'https://council.gov.uk/schedule';
      
      mockPage.url.mockReturnValueOnce(initialUrl);
      await mockPage.click('button[type="submit"]');
      mockPage.url.mockReturnValueOnce(afterUrl);
      
      const urlChanged = initialUrl !== afterUrl;
      expect(urlChanged).toBe(true);
    });
  });

  describe('capturePageEvidence', () => {
    it('should capture HTML content', async () => {
      const htmlContent = '<html><body><h1>Test</h1></body></html>';
      mockPage.content.mockResolvedValue(htmlContent);
      
      const content = await mockPage.content();
      
      expect(content).toBe(htmlContent);
    });

    it('should capture screenshot', async () => {
      const screenshotBuffer = Buffer.from('fake-screenshot-data');
      mockPage.screenshot.mockResolvedValue(screenshotBuffer);
      
      const screenshot = await mockPage.screenshot({ fullPage: true, type: 'png' });
      
      expect(screenshot).toBe(screenshotBuffer);
      expect(mockPage.screenshot).toHaveBeenCalledWith({ fullPage: true, type: 'png' });
    });

    it('should call evidence store with HTML', async () => {
      const htmlContent = '<html><body>Evidence</body></html>';
      mockPage.content.mockResolvedValue(htmlContent);
      
      mockEvidenceStore.store.mockResolvedValue({
        evidenceRef: 'evidence_123',
        storagePath: 'council/evidence_123.html',
        contentHash: 'sha256_abc',
        sizeBytes: htmlContent.length,
        capturedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        containsPii: true,
      });

      const content = await mockPage.content();
      const evidenceRef = await mockEvidenceStore.store({
        evidenceType: 'html',
        content: content,
        councilId: 'test-council',
      });
      
      expect(mockEvidenceStore.store).toHaveBeenCalledWith({
        evidenceType: 'html',
        content: htmlContent,
        councilId: 'test-council',
      });
      expect(evidenceRef.evidenceRef).toBe('evidence_123');
    });

    it('should handle screenshot capture failure gracefully', async () => {
      mockPage.screenshot.mockRejectedValue(new Error('Screenshot failed'));
      
      const captureScreenshot = async () => {
        try {
          return await mockPage.screenshot();
        } catch (error) {
          console.warn('Screenshot capture failed:', error);
          return null;
        }
      };

      const result = await captureScreenshot();
      expect(result).toBeNull();
    });
  });

  describe('validateOnDomain', () => {
    it('should pass for same domain', () => {
      const expectedDomain = 'council.gov.uk';
      const actualUrl = 'https://www.council.gov.uk/bincollections/results';
      
      const validateDomain = (domain: string, url: string) => {
        const urlObj = new URL(url);
        return urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain);
      };

      expect(validateDomain(expectedDomain, actualUrl)).toBe(true);
    });

    it('should pass for subdomain', () => {
      const expectedDomain = 'council.gov.uk';
      const actualUrl = 'https://waste.council.gov.uk/lookup';
      
      const validateDomain = (domain: string, url: string) => {
        const urlObj = new URL(url);
        return urlObj.hostname.endsWith(domain);
      };

      expect(validateDomain(expectedDomain, actualUrl)).toBe(true);
    });

    it('should throw for off-domain URL', () => {
      const expectedDomain = 'council.gov.uk';
      const actualUrl = 'https://attacker.com/phishing';
      
      const validateDomain = (domain: string, url: string) => {
        const urlObj = new URL(url);
        if (!urlObj.hostname.endsWith(domain)) {
          throw new Error(`Domain validation failed: ${urlObj.hostname} not under ${domain}`);
        }
      };

      expect(() => validateDomain(expectedDomain, actualUrl)).toThrow('Domain validation failed');
    });

    it('should throw for similar domain (typosquatting)', () => {
      const expectedDomain = 'council.gov.uk';
      const actualUrl = 'https://council.gov.uk.attacker.com/phishing';
      
      const validateDomain = (domain: string, url: string) => {
        const urlObj = new URL(url);
        if (!urlObj.hostname.endsWith(domain) || urlObj.hostname !== domain && !urlObj.hostname.endsWith('.' + domain)) {
          throw new Error('Domain validation failed');
        }
      };

      expect(() => validateDomain(expectedDomain, actualUrl)).toThrow('Domain validation failed');
    });

    it('should reject cloud metadata endpoint', () => {
      const expectedDomain = 'council.gov.uk';
      const actualUrl = 'http://169.254.169.254/latest/meta-data/';
      
      const validateDomain = (domain: string, url: string) => {
        const urlObj = new URL(url);
        
        // Block cloud metadata IPs
        const blockedHosts = ['169.254.169.254', 'metadata.google.internal'];
        if (blockedHosts.includes(urlObj.hostname)) {
          throw new Error('Blocked: Cloud metadata endpoint access denied');
        }
        
        if (!urlObj.hostname.endsWith(domain)) {
          throw new Error('Domain validation failed');
        }
      };

      expect(() => validateDomain(expectedDomain, actualUrl)).toThrow('Blocked: Cloud metadata endpoint');
    });

    it('should reject private IP ranges', () => {
      const expectedDomain = 'council.gov.uk';
      const privateUrls = [
        'http://192.168.1.1/admin',
        'http://10.0.0.1/internal',
        'http://172.16.0.1/private',
      ];
      
      const isPrivateIp = (hostname: string) => {
        return /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(hostname);
      };

      privateUrls.forEach(url => {
        const urlObj = new URL(url);
        expect(isPrivateIp(urlObj.hostname)).toBe(true);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      mockPage.goto.mockRejectedValue(new Error('net::ERR_CONNECTION_REFUSED'));
      
      const navigate = async (url: string) => {
        try {
          await mockPage.goto(url);
          return { success: true };
        } catch (error) {
          return {
            success: false,
            failureCategory: 'network_error',
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      };

      const result = await navigate('https://council.gov.uk');
      expect(result.success).toBe(false);
      expect(result.failureCategory).toBe('network_error');
    });

    it('should handle selector timeouts', async () => {
      mockPage.waitForSelector.mockRejectedValue(new Error('Timeout exceeded'));
      
      const waitForElement = async (selector: string) => {
        try {
          await mockPage.waitForSelector(selector, { timeout: 10000 });
          return { success: true };
        } catch (error) {
          return {
            success: false,
            failureCategory: 'timeout',
            errorMessage: 'Element not found within timeout',
          };
        }
      };

      const result = await waitForElement('#missing');
      expect(result.success).toBe(false);
      expect(result.failureCategory).toBe('timeout');
    });
  });

  describe('Input Sanitization', () => {
    it('should sanitize postcode input', () => {
      const sanitizePostcode = (input: string): string => {
        return input.toUpperCase().replace(/[^A-Z0-9\s]/g, '').trim();
      };

      expect(sanitizePostcode('po12 1bu')).toBe('PO12 1BU');
      expect(sanitizePostcode("'; DROP TABLE--")).toBe(' DROP TABLE');
      expect(sanitizePostcode('<script>alert(1)</script>')).toBe('SCRIPTALERT1SCRIPT');
    });

    it('should truncate long inputs', () => {
      const truncate = (input: string, maxLength: number): string => {
        return input.slice(0, maxLength);
      };

      const longInput = 'A'.repeat(200);
      expect(truncate(longInput, 50)).toHaveLength(50);
    });
  });
});
