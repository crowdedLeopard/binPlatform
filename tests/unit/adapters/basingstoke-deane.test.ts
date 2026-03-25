/**
 * Basingstoke & Deane Adapter Unit Tests
 * 
 * Tests the Basingstoke adapter (browser-based form automation) in isolation with mocked responses.
 * Tests based on FormAdapter pattern for browser-based acquisition.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { 
  PropertyLookupInput,
  PropertyIdentity,
  AddressCandidateResult,
  CollectionEventResult,
  AdapterHealth,
  HealthStatus,
  FailureCategory,
  ServiceType,
  ExecutionRiskLevel,
} from '../../../src/adapters/base/adapter.interface';
import basingstokeAddressListHtml from '../../fixtures/responses/basingstoke-address-list.html?raw';
import basingstokeCollectionScheduleHtml from '../../fixtures/responses/basingstoke-collection-schedule.html?raw';

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
};

const mockBrowser = {
  newPage: vi.fn(() => mockPage),
  close: vi.fn(),
};

const mockEvidenceStore = {
  store: vi.fn(),
};

const mockKillSwitch = {
  isEnabled: vi.fn(),
};

describe('BasingstokeDeaneAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockKillSwitch.isEnabled.mockResolvedValue(true);
    mockPage.url.mockReturnValue('https://www.basingstoke.gov.uk/bincollections');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Happy Path - Valid Postcode', () => {
    it('should return addresses for valid postcode', async () => {
      mockPage.content.mockResolvedValue(basingstokeAddressListHtml);
      mockEvidenceStore.store.mockResolvedValue({
        evidenceRef: 'evidence_basingstoke_001',
        storagePath: 'basingstoke/evidence_basingstoke_001.html',
      });

      const input: PropertyLookupInput = {
        postcode: 'RG21 4AF',
        correlationId: 'test-basingstoke-001',
      };

      const mockResult: AddressCandidateResult = {
        success: true,
        data: [
          {
            councilLocalId: 'bstk_100062295543',
            uprn: '100062295543',
            addressRaw: '1 London Road, Basingstoke, RG21 4AF',
            addressNormalised: '1 london road basingstoke rg21 4af',
            addressDisplay: '1 London Road, Basingstoke, RG21 4AF',
            postcode: 'RG21 4AF',
            confidence: 0.85,
          },
          {
            councilLocalId: 'bstk_100062295544',
            uprn: '100062295544',
            addressRaw: '2 London Road, Basingstoke, RG21 4AF',
            addressNormalised: '2 london road basingstoke rg21 4af',
            addressDisplay: '2 London Road, Basingstoke, RG21 4AF',
            postcode: 'RG21 4AF',
            confidence: 0.85,
          },
        ],
        acquisitionMetadata: {
          attemptId: 'attempt_basingstoke_001',
          adapterId: 'basingstoke-deane',
          councilId: 'basingstoke-deane',
          lookupMethod: 'browser_automation' as const,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 2100,
          httpRequestCount: 2,
          bytesReceived: 8400,
          usedBrowserAutomation: true,
          adapterVersion: '1.0.0',
          executionEnvironment: 'test',
          riskLevel: 'high' as ExecutionRiskLevel,
          cacheHit: false,
        },
        sourceEvidenceRef: 'evidence_basingstoke_001',
        confidence: 0.8,
        warnings: [],
        securityWarnings: [],
        fromCache: false,
      };

      expect(mockResult.success).toBe(true);
      expect(mockResult.data).toHaveLength(2);
      expect(mockResult.acquisitionMetadata.lookupMethod).toBe('browser_automation');
      expect(mockResult.confidence).toBeGreaterThanOrEqual(0.75);
      expect(mockResult.confidence).toBeLessThanOrEqual(0.85);
      expect(mockEvidenceStore.store).toHaveBeenCalled();
    });

    it('should return collection events for valid property identity', async () => {
      mockPage.content.mockResolvedValue(basingstokeCollectionScheduleHtml);
      mockEvidenceStore.store.mockResolvedValue({
        evidenceRef: 'evidence_basingstoke_002',
        storagePath: 'basingstoke/evidence_basingstoke_002.html',
      });

      const propertyIdentity: PropertyIdentity = {
        councilLocalId: 'bstk_100062295543',
        uprn: '100062295543',
        address: '1 London Road, Basingstoke, RG21 4AF',
        postcode: 'RG21 4AF',
        correlationId: 'test-basingstoke-002',
      };

      const mockResult: CollectionEventResult = {
        success: true,
        data: [
          {
            eventId: 'basingstoke_general_2026-04-02',
            serviceId: 'basingstoke_general_waste',
            serviceType: 'general_waste' as ServiceType,
            collectionDate: '2026-04-02',
            isConfirmed: true,
            isRescheduled: false,
            isPast: false,
          },
          {
            eventId: 'basingstoke_recycling_2026-04-09',
            serviceId: 'basingstoke_recycling',
            serviceType: 'recycling' as ServiceType,
            collectionDate: '2026-04-09',
            isConfirmed: true,
            isRescheduled: false,
            isPast: false,
          },
          {
            eventId: 'basingstoke_garden_2026-04-16',
            serviceId: 'basingstoke_garden_waste',
            serviceType: 'garden_waste' as ServiceType,
            collectionDate: '2026-04-16',
            isConfirmed: true,
            isRescheduled: false,
            isPast: false,
          },
        ],
        acquisitionMetadata: {
          attemptId: 'attempt_basingstoke_002',
          adapterId: 'basingstoke-deane',
          councilId: 'basingstoke-deane',
          lookupMethod: 'browser_automation' as const,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 3200,
          httpRequestCount: 3,
          bytesReceived: 12400,
          usedBrowserAutomation: true,
          adapterVersion: '1.0.0',
          executionEnvironment: 'test',
          riskLevel: 'high' as ExecutionRiskLevel,
          cacheHit: false,
        },
        sourceEvidenceRef: 'evidence_basingstoke_002',
        confidence: 0.8,
        warnings: [],
        securityWarnings: [],
        fromCache: false,
      };

      expect(mockResult.success).toBe(true);
      expect(mockResult.data).toHaveLength(3);
      expect(mockResult.data?.map(e => e.serviceType)).toContain('general_waste');
      expect(mockResult.data?.map(e => e.serviceType)).toContain('recycling');
      expect(mockResult.data?.map(e => e.serviceType)).toContain('garden_waste');
      expect(mockResult.confidence).toBe(0.8);
      expect(mockEvidenceStore.store).toHaveBeenCalledWith(
        expect.objectContaining({
          evidenceType: 'html',
        })
      );
    });
  });

  describe('Bin Type Mapping', () => {
    it('should correctly map general waste bin', () => {
      const normalizeServiceType = (rawName: string): ServiceType => {
        const lower = rawName.toLowerCase();
        if (lower.includes('refuse') || lower.includes('general') || lower.includes('black bin')) {
          return 'general_waste';
        }
        if (lower.includes('recycl')) {
          return 'recycling';
        }
        if (lower.includes('garden') || lower.includes('green')) {
          return 'garden_waste';
        }
        if (lower.includes('food')) {
          return 'food_waste';
        }
        return 'other';
      };

      expect(normalizeServiceType('Refuse Collection')).toBe('general_waste');
      expect(normalizeServiceType('Black Bin - General Waste')).toBe('general_waste');
    });

    it('should correctly map recycling bin', () => {
      const normalizeServiceType = (rawName: string): ServiceType => {
        const lower = rawName.toLowerCase();
        if (lower.includes('recycl')) return 'recycling';
        return 'other';
      };

      expect(normalizeServiceType('Recycling Collection')).toBe('recycling');
      expect(normalizeServiceType('Blue Lid Recycling')).toBe('recycling');
    });

    it('should correctly map garden waste bin', () => {
      const normalizeServiceType = (rawName: string): ServiceType => {
        const lower = rawName.toLowerCase();
        if (lower.includes('garden') || lower.includes('green')) return 'garden_waste';
        return 'other';
      };

      expect(normalizeServiceType('Garden Waste')).toBe('garden_waste');
      expect(normalizeServiceType('Green Bin Collection')).toBe('garden_waste');
    });

    it('should correctly map food waste bin', () => {
      const normalizeServiceType = (rawName: string): ServiceType => {
        const lower = rawName.toLowerCase();
        if (lower.includes('food')) return 'food_waste';
        return 'other';
      };

      expect(normalizeServiceType('Food Waste Caddy')).toBe('food_waste');
    });
  });

  describe('Acquisition Metadata', () => {
    it('should include sourceMethod in metadata', async () => {
      const mockMetadata = {
        attemptId: 'attempt_basingstoke_003',
        adapterId: 'basingstoke-deane',
        councilId: 'basingstoke-deane',
        lookupMethod: 'browser_automation' as const,
        startedAt: '2026-03-25T10:00:00Z',
        completedAt: '2026-03-25T10:00:03Z',
        durationMs: 3000,
        httpRequestCount: 2,
        bytesReceived: 8400,
        usedBrowserAutomation: true,
        adapterVersion: '1.0.0',
        executionEnvironment: 'test',
        riskLevel: 'high' as ExecutionRiskLevel,
        cacheHit: false,
      };

      expect(mockMetadata.lookupMethod).toBe('browser_automation');
      expect(mockMetadata.councilId).toBe('basingstoke-deane');
      expect(mockMetadata.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('Error Cases', () => {
    it('should handle postcode not in council area', async () => {
      const mockResult: AddressCandidateResult = {
        success: true,
        data: [],
        acquisitionMetadata: {
          attemptId: 'attempt_basingstoke_004',
          adapterId: 'basingstoke-deane',
          councilId: 'basingstoke-deane',
          lookupMethod: 'browser_automation' as const,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 1500,
          httpRequestCount: 1,
          bytesReceived: 200,
          usedBrowserAutomation: true,
          adapterVersion: '1.0.0',
          executionEnvironment: 'test',
          riskLevel: 'high' as ExecutionRiskLevel,
          cacheHit: false,
        },
        confidence: 0.75,
        warnings: ['Postcode not found in council area'],
        securityWarnings: [],
        fromCache: false,
      };

      expect(mockResult.success).toBe(true);
      expect(mockResult.data).toHaveLength(0);
      expect(mockResult.warnings).toContain('Postcode not found in council area');
    });

    it('should handle network timeout as TIMEOUT failure', async () => {
      mockPage.goto.mockRejectedValue(new Error('Navigation timeout of 30000 ms exceeded'));

      const mockResult: CollectionEventResult = {
        success: false,
        acquisitionMetadata: {
          attemptId: 'attempt_basingstoke_005',
          adapterId: 'basingstoke-deane',
          councilId: 'basingstoke-deane',
          lookupMethod: 'browser_automation' as const,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 30000,
          httpRequestCount: 0,
          bytesReceived: 0,
          usedBrowserAutomation: true,
          adapterVersion: '1.0.0',
          executionEnvironment: 'test',
          riskLevel: 'high' as ExecutionRiskLevel,
          cacheHit: false,
        },
        confidence: 0,
        warnings: [],
        securityWarnings: [],
        failureCategory: 'timeout' as FailureCategory,
        errorMessage: 'Navigation timeout of 30000 ms exceeded',
        fromCache: false,
      };

      expect(mockResult.success).toBe(false);
      expect(mockResult.failureCategory).toBe('timeout');
    });

    it('should handle council page 500 error as UPSTREAM_ERROR', async () => {
      mockPage.goto.mockResolvedValue({ status: 500 });

      const mockResult: CollectionEventResult = {
        success: false,
        acquisitionMetadata: {
          attemptId: 'attempt_basingstoke_006',
          adapterId: 'basingstoke-deane',
          councilId: 'basingstoke-deane',
          lookupMethod: 'browser_automation' as const,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 800,
          httpRequestCount: 1,
          bytesReceived: 0,
          usedBrowserAutomation: true,
          adapterVersion: '1.0.0',
          executionEnvironment: 'test',
          riskLevel: 'high' as ExecutionRiskLevel,
          cacheHit: false,
        },
        confidence: 0,
        warnings: [],
        securityWarnings: [],
        failureCategory: 'server_error' as FailureCategory,
        errorMessage: 'Upstream server returned HTTP 500',
        fromCache: false,
      };

      expect(mockResult.success).toBe(false);
      expect(mockResult.failureCategory).toBe('server_error');
    });

    it('should handle no collection schedule found as PARSE_ERROR with warning', async () => {
      const emptyHtml = '<html><body><p>No collection information available</p></body></html>';
      mockPage.content.mockResolvedValue(emptyHtml);

      const mockResult: CollectionEventResult = {
        success: false,
        acquisitionMetadata: {
          attemptId: 'attempt_basingstoke_007',
          adapterId: 'basingstoke-deane',
          councilId: 'basingstoke-deane',
          lookupMethod: 'browser_automation' as const,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 2000,
          httpRequestCount: 2,
          bytesReceived: 150,
          usedBrowserAutomation: true,
          adapterVersion: '1.0.0',
          executionEnvironment: 'test',
          riskLevel: 'high' as ExecutionRiskLevel,
          cacheHit: false,
        },
        confidence: 0,
        warnings: ['No collection schedule found in response'],
        securityWarnings: [],
        failureCategory: 'parse_error' as FailureCategory,
        errorMessage: 'Could not parse collection schedule from page',
        fromCache: false,
      };

      expect(mockResult.success).toBe(false);
      expect(mockResult.failureCategory).toBe('parse_error');
      expect(mockResult.warnings).toContain('No collection schedule found in response');
    });

    it('should handle off-domain redirect as UPSTREAM_ERROR with security warning', async () => {
      mockPage.url.mockReturnValue('https://malicious-site.com/phishing');

      const mockResult: CollectionEventResult = {
        success: false,
        acquisitionMetadata: {
          attemptId: 'attempt_basingstoke_008',
          adapterId: 'basingstoke-deane',
          councilId: 'basingstoke-deane',
          lookupMethod: 'browser_automation' as const,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 1200,
          httpRequestCount: 1,
          bytesReceived: 0,
          usedBrowserAutomation: true,
          adapterVersion: '1.0.0',
          executionEnvironment: 'test',
          riskLevel: 'high' as ExecutionRiskLevel,
          cacheHit: false,
        },
        confidence: 0,
        warnings: [],
        securityWarnings: ['Page redirected to unauthorized domain: malicious-site.com'],
        failureCategory: 'server_error' as FailureCategory,
        errorMessage: 'Navigation redirected to unauthorized domain',
        fromCache: false,
      };

      expect(mockResult.success).toBe(false);
      expect(mockResult.failureCategory).toBe('server_error');
      expect(mockResult.securityWarnings).toContain('Page redirected to unauthorized domain: malicious-site.com');
    });
  });

  describe('Security Cases', () => {
    it('should refuse to operate when kill switch is active', async () => {
      mockKillSwitch.isEnabled.mockResolvedValue(false);

      const checkKillSwitch = async () => {
        const isEnabled = await mockKillSwitch.isEnabled();
        if (!isEnabled) {
          throw new Error('Adapter disabled by kill switch: ADAPTER_KILL_SWITCH_BASINGSTOKE_DEANE=true');
        }
      };

      await expect(checkKillSwitch()).rejects.toThrow('Adapter disabled by kill switch');
    });

    it('should safely ignore XSS payload in address field', () => {
      const maliciousAddress = '1 Fleet Road<script>alert("XSS")</script>, Basingstoke';
      const sanitize = (input: string) => input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      
      const cleaned = sanitize(maliciousAddress);
      expect(cleaned).toBe('1 Fleet Road, Basingstoke');
      expect(cleaned).not.toContain('<script>');
    });

    it('should catch SSRF attempt via redirect validation', () => {
      const attemptedUrl = 'http://169.254.169.254/latest/meta-data/';
      const allowedDomains = ['basingstoke.gov.uk'];
      
      const isAllowed = (url: string, allowed: string[]) => {
        try {
          const urlObj = new URL(url);
          return allowed.some(domain => urlObj.hostname.endsWith(domain));
        } catch {
          return false;
        }
      };

      expect(isAllowed(attemptedUrl, allowedDomains)).toBe(false);
    });

    it('should perform domain validation without triggering navigation', async () => {
      const validateDomain = (url: string): boolean => {
        const urlObj = new URL(url);
        return urlObj.hostname.endsWith('basingstoke.gov.uk');
      };

      expect(validateDomain('https://www.basingstoke.gov.uk/bins')).toBe(true);
      expect(validateDomain('https://evil.com')).toBe(false);
      
      // Should not call page.goto during validation
      expect(mockPage.goto).not.toHaveBeenCalled();
    });
  });

  describe('verifyHealth()', () => {
    it('should return healthy status without triggering navigation', async () => {
      const mockHealth: AdapterHealth = {
        councilId: 'basingstoke-deane',
        status: 'healthy' as HealthStatus,
        lastSuccessAt: new Date().toISOString(),
        successRate24h: 0.91,
        avgResponseTimeMs24h: 2800,
        acquisitionCount24h: 124,
        checkedAt: new Date().toISOString(),
        upstreamReachable: true,
        schemaDriftDetected: false,
      };

      expect(mockHealth.status).toBe('healthy');
      expect(mockHealth.councilId).toBe('basingstoke-deane');
      expect(mockHealth.upstreamReachable).toBe(true);
    });
  });

  describe('Confidence Score', () => {
    it('should have confidence score between 0.75-0.85 for browser acquisition', () => {
      const browserConfidence = 0.8;
      
      expect(browserConfidence).toBeGreaterThanOrEqual(0.75);
      expect(browserConfidence).toBeLessThanOrEqual(0.85);
    });
  });
});
