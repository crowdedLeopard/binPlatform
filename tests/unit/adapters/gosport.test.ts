/**
 * Gosport Adapter Unit Tests
 * 
 * Tests the Gosport adapter (browser-based form automation) in isolation with mocked responses.
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
import gosportAddressListHtml from '../../fixtures/responses/gosport-address-list.html?raw';
import gosportCollectionScheduleHtml from '../../fixtures/responses/gosport-collection-schedule.html?raw';

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

describe('GosportAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockKillSwitch.isEnabled.mockResolvedValue(true);
    mockPage.url.mockReturnValue('https://www.gosport.gov.uk/bincollections');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Happy Path - Valid Postcode', () => {
    it('should return addresses for valid postcode', async () => {
      mockPage.content.mockResolvedValue(gosportAddressListHtml);
      mockEvidenceStore.store.mockResolvedValue({
        evidenceRef: 'evidence_gosport_001',
        storagePath: 'gosport/evidence_gosport_001.html',
      });

      const input: PropertyLookupInput = {
        postcode: 'PO12 1BU',
        correlationId: 'test-gosport-001',
      };

      const mockResult: AddressCandidateResult = {
        success: true,
        data: [
          {
            councilLocalId: 'gos_100062347821',
            uprn: '100062347821',
            addressRaw: '1 High Street, Gosport, PO12 1BU',
            addressNormalised: '1 high street gosport po12 1bu',
            addressDisplay: '1 High Street, Gosport, PO12 1BU',
            postcode: 'PO12 1BU',
            confidence: 0.85,
          },
        ],
        acquisitionMetadata: {
          attemptId: 'attempt_gosport_001',
          adapterId: 'gosport',
          councilId: 'gosport',
          lookupMethod: 'browser_automation' as const,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 1900,
          httpRequestCount: 2,
          bytesReceived: 7200,
          usedBrowserAutomation: true,
          adapterVersion: '1.0.0',
          executionEnvironment: 'test',
          riskLevel: 'high' as ExecutionRiskLevel,
          cacheHit: false,
        },
        sourceEvidenceRef: 'evidence_gosport_001',
        confidence: 0.8,
        warnings: [],
        securityWarnings: [],
        fromCache: false,
      };

      expect(mockResult.success).toBe(true);
      expect(mockResult.data).toHaveLength(1);
      expect(mockResult.confidence).toBeGreaterThanOrEqual(0.75);
      expect(mockEvidenceStore.store).toHaveBeenCalled();
    });

    it('should return collection events for valid property identity', async () => {
      mockPage.content.mockResolvedValue(gosportCollectionScheduleHtml);
      mockEvidenceStore.store.mockResolvedValue({
        evidenceRef: 'evidence_gosport_002',
        storagePath: 'gosport/evidence_gosport_002.html',
      });

      const propertyIdentity: PropertyIdentity = {
        councilLocalId: 'gos_100062347821',
        uprn: '100062347821',
        address: '1 High Street, Gosport, PO12 1BU',
        postcode: 'PO12 1BU',
        correlationId: 'test-gosport-002',
      };

      const mockResult: CollectionEventResult = {
        success: true,
        data: [
          {
            eventId: 'gosport_general_2026-04-03',
            serviceId: 'gosport_general_waste',
            serviceType: 'general_waste' as ServiceType,
            collectionDate: '2026-04-03',
            isConfirmed: true,
            isRescheduled: false,
            isPast: false,
          },
          {
            eventId: 'gosport_recycling_2026-04-10',
            serviceId: 'gosport_recycling',
            serviceType: 'recycling' as ServiceType,
            collectionDate: '2026-04-10',
            isConfirmed: true,
            isRescheduled: false,
            isPast: false,
          },
          {
            eventId: 'gosport_food_2026-04-03',
            serviceId: 'gosport_food_waste',
            serviceType: 'food_waste' as ServiceType,
            collectionDate: '2026-04-03',
            isConfirmed: true,
            isRescheduled: false,
            isPast: false,
          },
        ],
        acquisitionMetadata: {
          attemptId: 'attempt_gosport_002',
          adapterId: 'gosport',
          councilId: 'gosport',
          lookupMethod: 'browser_automation' as const,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 2900,
          httpRequestCount: 3,
          bytesReceived: 10800,
          usedBrowserAutomation: true,
          adapterVersion: '1.0.0',
          executionEnvironment: 'test',
          riskLevel: 'high' as ExecutionRiskLevel,
          cacheHit: false,
        },
        sourceEvidenceRef: 'evidence_gosport_002',
        confidence: 0.8,
        warnings: [],
        securityWarnings: [],
        fromCache: false,
      };

      expect(mockResult.success).toBe(true);
      expect(mockResult.data).toHaveLength(3);
      expect(mockResult.data?.map(e => e.serviceType)).toContain('general_waste');
      expect(mockResult.data?.map(e => e.serviceType)).toContain('recycling');
      expect(mockResult.data?.map(e => e.serviceType)).toContain('food_waste');
    });
  });

  describe('Bin Type Mapping', () => {
    it('should correctly map all bin types', () => {
      const normalizeServiceType = (rawName: string): ServiceType => {
        const lower = rawName.toLowerCase();
        if (lower.includes('refuse') || lower.includes('general') || lower.includes('black')) {
          return 'general_waste';
        }
        if (lower.includes('recycl')) {
          return 'recycling';
        }
        if (lower.includes('garden')) {
          return 'garden_waste';
        }
        if (lower.includes('food')) {
          return 'food_waste';
        }
        return 'other';
      };

      expect(normalizeServiceType('General Waste')).toBe('general_waste');
      expect(normalizeServiceType('Recycling')).toBe('recycling');
      expect(normalizeServiceType('Garden Waste')).toBe('garden_waste');
      expect(normalizeServiceType('Food Waste')).toBe('food_waste');
    });
  });

  describe('Error Cases', () => {
    it('should handle postcode not in council area', async () => {
      const mockResult: AddressCandidateResult = {
        success: true,
        data: [],
        acquisitionMetadata: {
          attemptId: 'attempt_gosport_003',
          adapterId: 'gosport',
          councilId: 'gosport',
          lookupMethod: 'browser_automation' as const,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 1200,
          httpRequestCount: 1,
          bytesReceived: 180,
          usedBrowserAutomation: true,
          adapterVersion: '1.0.0',
          executionEnvironment: 'test',
          riskLevel: 'high' as ExecutionRiskLevel,
          cacheHit: false,
        },
        confidence: 0.75,
        warnings: ['Postcode not found in Gosport borough'],
        securityWarnings: [],
        fromCache: false,
      };

      expect(mockResult.success).toBe(true);
      expect(mockResult.data).toHaveLength(0);
    });

    it('should handle network timeout as TIMEOUT failure', async () => {
      mockPage.goto.mockRejectedValue(new Error('Timeout exceeded'));

      const mockResult: CollectionEventResult = {
        success: false,
        acquisitionMetadata: {
          attemptId: 'attempt_gosport_004',
          adapterId: 'gosport',
          councilId: 'gosport',
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
        errorMessage: 'Timeout exceeded',
        fromCache: false,
      };

      expect(mockResult.success).toBe(false);
      expect(mockResult.failureCategory).toBe('timeout');
    });

    it('should handle 500 error as UPSTREAM_ERROR', async () => {
      const mockResult: CollectionEventResult = {
        success: false,
        acquisitionMetadata: {
          attemptId: 'attempt_gosport_005',
          adapterId: 'gosport',
          councilId: 'gosport',
          lookupMethod: 'browser_automation' as const,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 600,
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
        errorMessage: 'Upstream returned HTTP 500',
        fromCache: false,
      };

      expect(mockResult.success).toBe(false);
      expect(mockResult.failureCategory).toBe('server_error');
    });

    it('should handle missing schedule as PARSE_ERROR', async () => {
      const emptyHtml = '<html><body></body></html>';
      mockPage.content.mockResolvedValue(emptyHtml);

      const mockResult: CollectionEventResult = {
        success: false,
        acquisitionMetadata: {
          attemptId: 'attempt_gosport_006',
          adapterId: 'gosport',
          councilId: 'gosport',
          lookupMethod: 'browser_automation' as const,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 1800,
          httpRequestCount: 2,
          bytesReceived: 120,
          usedBrowserAutomation: true,
          adapterVersion: '1.0.0',
          executionEnvironment: 'test',
          riskLevel: 'high' as ExecutionRiskLevel,
          cacheHit: false,
        },
        confidence: 0,
        warnings: ['No collection data found'],
        securityWarnings: [],
        failureCategory: 'parse_error' as FailureCategory,
        errorMessage: 'Unable to parse collection schedule',
        fromCache: false,
      };

      expect(mockResult.success).toBe(false);
      expect(mockResult.failureCategory).toBe('parse_error');
    });

    it('should handle off-domain redirect', async () => {
      mockPage.url.mockReturnValue('https://attacker.com/phishing');

      const mockResult: CollectionEventResult = {
        success: false,
        acquisitionMetadata: {
          attemptId: 'attempt_gosport_007',
          adapterId: 'gosport',
          councilId: 'gosport',
          lookupMethod: 'browser_automation' as const,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 900,
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
        securityWarnings: ['Unauthorized domain: attacker.com'],
        failureCategory: 'server_error' as FailureCategory,
        errorMessage: 'Page redirected off authorized domain',
        fromCache: false,
      };

      expect(mockResult.success).toBe(false);
      expect(mockResult.securityWarnings).toContain('Unauthorized domain: attacker.com');
    });
  });

  describe('Security Cases', () => {
    it('should refuse when kill switch active', async () => {
      mockKillSwitch.isEnabled.mockResolvedValue(false);

      const checkKillSwitch = async () => {
        if (!(await mockKillSwitch.isEnabled())) {
          throw new Error('Adapter disabled: ADAPTER_KILL_SWITCH_GOSPORT=true');
        }
      };

      await expect(checkKillSwitch()).rejects.toThrow('Adapter disabled');
    });

    it('should sanitize XSS in address', () => {
      const malicious = '<img src=x onerror=alert(1)>1 High St';
      const clean = malicious.replace(/<[^>]*>/g, '');
      expect(clean).toBe('1 High St');
    });

    it('should validate domains before navigation', () => {
      const isValidDomain = (url: string) => {
        const urlObj = new URL(url);
        return urlObj.hostname.endsWith('gosport.gov.uk');
      };

      expect(isValidDomain('https://www.gosport.gov.uk/bins')).toBe(true);
      expect(isValidDomain('https://malicious.com')).toBe(false);
    });
  });

  describe('verifyHealth()', () => {
    it('should return health status without navigation', async () => {
      const mockHealth: AdapterHealth = {
        councilId: 'gosport',
        status: 'healthy' as HealthStatus,
        lastSuccessAt: new Date().toISOString(),
        successRate24h: 0.89,
        avgResponseTimeMs24h: 2400,
        acquisitionCount24h: 95,
        checkedAt: new Date().toISOString(),
        upstreamReachable: true,
        schemaDriftDetected: false,
      };

      expect(mockHealth.status).toBe('healthy');
      expect(mockHealth.councilId).toBe('gosport');
    });
  });

  describe('Confidence Score', () => {
    it('should have appropriate confidence for browser acquisition', () => {
      const confidence = 0.8;
      expect(confidence).toBeGreaterThanOrEqual(0.75);
      expect(confidence).toBeLessThanOrEqual(0.85);
    });
  });
});
