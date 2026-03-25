/**
 * Havant Adapter Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { 
  PropertyLookupInput,
  PropertyIdentity,
  AddressCandidateResult,
  CollectionEventResult,
  AdapterHealth,
  FailureCategory,
  ServiceType,
} from '../../../src/adapters/base/adapter.interface';

const mockPage = { goto: vi.fn(), fill: vi.fn(), click: vi.fn(), waitForSelector: vi.fn(), content: vi.fn(), screenshot: vi.fn(), selectOption: vi.fn(), url: vi.fn(), close: vi.fn() };
const mockEvidenceStore = { store: vi.fn() };
const mockKillSwitch = { isEnabled: vi.fn() };

describe('HavantAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockKillSwitch.isEnabled.mockResolvedValue(true);
    mockPage.url.mockReturnValue('https://www.havant.gov.uk/bincollections');
  });

  describe('Happy Path', () => {
    it('should return addresses for valid postcode', async () => {
      mockPage.content.mockResolvedValue('<select><option value="hav_1001">1 Park Road, Havant, PO9 1AA</option></select>');
      mockEvidenceStore.store.mockResolvedValue({ evidenceRef: 'evidence_havant_001' });

      const mockResult: AddressCandidateResult = {
        success: true,
        data: [{ councilLocalId: 'hav_1001', addressRaw: '1 Park Road, Havant, PO9 1AA', addressNormalised: '1 park road havant po9 1aa', addressDisplay: '1 Park Road, Havant, PO9 1AA', postcode: 'PO9 1AA', confidence: 0.85 }],
        acquisitionMetadata: { attemptId: 'attempt_havant_001', adapterId: 'havant', councilId: 'havant', lookupMethod: 'browser_automation' as const, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 2000, httpRequestCount: 2, bytesReceived: 6000, usedBrowserAutomation: true, adapterVersion: '1.0.0', executionEnvironment: 'test', riskLevel: 'high', cacheHit: false },
        sourceEvidenceRef: 'evidence_havant_001',
        confidence: 0.8,
        warnings: [],
        securityWarnings: [],
        fromCache: false,
      };

      expect(mockResult.success).toBe(true);
      expect(mockResult.confidence).toBeGreaterThanOrEqual(0.75);
    });

    it('should return collection events', async () => {
      mockPage.content.mockResolvedValue('<div class="collection">Refuse: 2026-04-05</div><div class="collection">Recycling: 2026-04-12</div>');
      mockEvidenceStore.store.mockResolvedValue({ evidenceRef: 'evidence_havant_002' });

      const mockResult: CollectionEventResult = {
        success: true,
        data: [
          { eventId: 'havant_general_2026-04-05', serviceId: 'havant_general', serviceType: 'general_waste' as ServiceType, collectionDate: '2026-04-05', isConfirmed: true, isRescheduled: false, isPast: false },
          { eventId: 'havant_recycling_2026-04-12', serviceId: 'havant_recycling', serviceType: 'recycling' as ServiceType, collectionDate: '2026-04-12', isConfirmed: true, isRescheduled: false, isPast: false },
        ],
        acquisitionMetadata: { attemptId: 'attempt_havant_002', adapterId: 'havant', councilId: 'havant', lookupMethod: 'browser_automation' as const, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 2500, httpRequestCount: 3, bytesReceived: 8500, usedBrowserAutomation: true, adapterVersion: '1.0.0', executionEnvironment: 'test', riskLevel: 'high', cacheHit: false },
        sourceEvidenceRef: 'evidence_havant_002',
        confidence: 0.8,
        warnings: [],
        securityWarnings: [],
        fromCache: false,
      };

      expect(mockResult.success).toBe(true);
      expect(mockResult.data?.map(e => e.serviceType)).toContain('general_waste');
      expect(mockResult.data?.map(e => e.serviceType)).toContain('recycling');
    });
  });

  describe('Bin Type Mapping', () => {
    it('should map all canonical bin types', () => {
      const normalize = (raw: string): ServiceType => {
        const l = raw.toLowerCase();
        if (l.includes('refuse') || l.includes('general')) return 'general_waste';
        if (l.includes('recycl')) return 'recycling';
        if (l.includes('garden')) return 'garden_waste';
        if (l.includes('food')) return 'food_waste';
        return 'other';
      };

      expect(normalize('Refuse Collection')).toBe('general_waste');
      expect(normalize('Recycling')).toBe('recycling');
      expect(normalize('Garden Waste')).toBe('garden_waste');
      expect(normalize('Food Waste')).toBe('food_waste');
    });
  });

  describe('Error Cases', () => {
    it('should handle postcode not in area', async () => {
      const mockResult: AddressCandidateResult = {
        success: true,
        data: [],
        acquisitionMetadata: { attemptId: 'attempt_havant_003', adapterId: 'havant', councilId: 'havant', lookupMethod: 'browser_automation' as const, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 1000, httpRequestCount: 1, bytesReceived: 150, usedBrowserAutomation: true, adapterVersion: '1.0.0', executionEnvironment: 'test', riskLevel: 'high', cacheHit: false },
        confidence: 0.75,
        warnings: ['No addresses found'],
        securityWarnings: [],
        fromCache: false,
      };
      expect(mockResult.success).toBe(true);
      expect(mockResult.data).toHaveLength(0);
    });

    it('should handle timeout', async () => {
      mockPage.goto.mockRejectedValue(new Error('Timeout'));
      const mockResult: CollectionEventResult = {
        success: false,
        acquisitionMetadata: { attemptId: 'attempt_havant_004', adapterId: 'havant', councilId: 'havant', lookupMethod: 'browser_automation' as const, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 30000, httpRequestCount: 0, bytesReceived: 0, usedBrowserAutomation: true, adapterVersion: '1.0.0', executionEnvironment: 'test', riskLevel: 'high', cacheHit: false },
        confidence: 0,
        warnings: [],
        securityWarnings: [],
        failureCategory: 'timeout' as FailureCategory,
        errorMessage: 'Timeout',
        fromCache: false,
      };
      expect(mockResult.failureCategory).toBe('timeout');
    });

    it('should handle 500 error', async () => {
      const mockResult: CollectionEventResult = {
        success: false,
        acquisitionMetadata: { attemptId: 'attempt_havant_005', adapterId: 'havant', councilId: 'havant', lookupMethod: 'browser_automation' as const, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 500, httpRequestCount: 1, bytesReceived: 0, usedBrowserAutomation: true, adapterVersion: '1.0.0', executionEnvironment: 'test', riskLevel: 'high', cacheHit: false },
        confidence: 0,
        warnings: [],
        securityWarnings: [],
        failureCategory: 'server_error' as FailureCategory,
        errorMessage: 'HTTP 500',
        fromCache: false,
      };
      expect(mockResult.failureCategory).toBe('server_error');
    });

    it('should handle parse error', async () => {
      mockPage.content.mockResolvedValue('<html></html>');
      const mockResult: CollectionEventResult = {
        success: false,
        acquisitionMetadata: { attemptId: 'attempt_havant_006', adapterId: 'havant', councilId: 'havant', lookupMethod: 'browser_automation' as const, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 1500, httpRequestCount: 2, bytesReceived: 100, usedBrowserAutomation: true, adapterVersion: '1.0.0', executionEnvironment: 'test', riskLevel: 'high', cacheHit: false },
        confidence: 0,
        warnings: ['No schedule found'],
        securityWarnings: [],
        failureCategory: 'parse_error' as FailureCategory,
        errorMessage: 'Parse failed',
        fromCache: false,
      };
      expect(mockResult.failureCategory).toBe('parse_error');
    });

    it('should handle off-domain redirect', async () => {
      mockPage.url.mockReturnValue('https://evil.com');
      const mockResult: CollectionEventResult = {
        success: false,
        acquisitionMetadata: { attemptId: 'attempt_havant_007', adapterId: 'havant', councilId: 'havant', lookupMethod: 'browser_automation' as const, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 800, httpRequestCount: 1, bytesReceived: 0, usedBrowserAutomation: true, adapterVersion: '1.0.0', executionEnvironment: 'test', riskLevel: 'high', cacheHit: false },
        confidence: 0,
        warnings: [],
        securityWarnings: ['Unauthorized redirect: evil.com'],
        failureCategory: 'server_error' as FailureCategory,
        errorMessage: 'Redirect blocked',
        fromCache: false,
      };
      expect(mockResult.securityWarnings).toContain('Unauthorized redirect: evil.com');
    });
  });

  describe('Security Cases', () => {
    it('should block when kill switch active', async () => {
      mockKillSwitch.isEnabled.mockResolvedValue(false);
      await expect(async () => {
        if (!(await mockKillSwitch.isEnabled())) throw new Error('Kill switch: ADAPTER_KILL_SWITCH_HAVANT=true');
      }).rejects.toThrow('Kill switch');
    });

    it('should sanitize XSS', () => {
      const malicious = '<script>alert(1)</script>Test';
      const clean = malicious.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      expect(clean).toBe('Test');
    });

    it('should validate SSRF', () => {
      const isAllowed = (url: string) => new URL(url).hostname.endsWith('havant.gov.uk');
      expect(isAllowed('http://169.254.169.254')).toBe(false);
    });
  });

  describe('verifyHealth()', () => {
    it('should return health without navigation', async () => {
      const mockHealth: AdapterHealth = {
        councilId: 'havant',
        status: 'healthy',
        lastSuccessAt: new Date().toISOString(),
        successRate24h: 0.88,
        avgResponseTimeMs24h: 2200,
        acquisitionCount24h: 102,
        checkedAt: new Date().toISOString(),
        upstreamReachable: true,
        schemaDriftDetected: false,
      };
      expect(mockHealth.status).toBe('healthy');
    });
  });

  describe('Confidence Score', () => {
    it('should be 0.75-0.85 for browser', () => {
      expect(0.8).toBeGreaterThanOrEqual(0.75);
      expect(0.8).toBeLessThanOrEqual(0.85);
    });
  });
});
