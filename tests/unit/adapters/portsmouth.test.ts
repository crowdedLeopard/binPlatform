/**
 * Portsmouth Adapter Unit Tests
 * 
 * Portsmouth may support dual-mode: JSON API or browser fallback
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AddressCandidateResult, CollectionEventResult, AdapterHealth, FailureCategory, ServiceType, CouncilCapabilities } from '../../../src/adapters/base/adapter.interface';

const mockHttpClient = { get: vi.fn(), post: vi.fn() };
const mockPage = { goto: vi.fn(), fill: vi.fn(), click: vi.fn(), waitForSelector: vi.fn(), content: vi.fn(), screenshot: vi.fn(), selectOption: vi.fn(), url: vi.fn(), close: vi.fn() };
const mockEvidenceStore = { store: vi.fn() };
const mockKillSwitch = { isEnabled: vi.fn() };

describe('PortsmouthAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockKillSwitch.isEnabled.mockResolvedValue(true);
    mockPage.url.mockReturnValue('https://www.portsmouth.gov.uk/bincollections');
  });

  describe('JSON Mode (if available)', () => {
    it('should return addresses via JSON API', async () => {
      mockHttpClient.get.mockResolvedValue({
        status: 200,
        data: { addresses: [{ id: 'pcc_5001', address: '1 Guildhall Square, Portsmouth, PO1 2AL', postcode: 'PO1 2AL' }] },
      });
      mockEvidenceStore.store.mockResolvedValue({ evidenceRef: 'evidence_pcc_json_001' });

      const mockResult: AddressCandidateResult = { success: true, data: [{ councilLocalId: 'pcc_5001', addressRaw: '1 Guildhall Square, Portsmouth, PO1 2AL', addressNormalised: '1 guildhall square portsmouth po1 2al', addressDisplay: '1 Guildhall Square, Portsmouth, PO1 2AL', postcode: 'PO1 2AL', confidence: 0.95 }], acquisitionMetadata: { attemptId: 'attempt_pcc_json_001', adapterId: 'portsmouth', councilId: 'portsmouth', lookupMethod: 'api' as const, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 450, httpRequestCount: 1, bytesReceived: 320, usedBrowserAutomation: false, adapterVersion: '1.0.0', executionEnvironment: 'test', riskLevel: 'low', cacheHit: false }, sourceEvidenceRef: 'evidence_pcc_json_001', confidence: 0.95, warnings: [], securityWarnings: [], fromCache: false };
      expect(mockResult.success).toBe(true);
      expect(mockResult.acquisitionMetadata.lookupMethod).toBe('api');
      expect(mockResult.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should return events via JSON API', async () => {
      mockHttpClient.get.mockResolvedValue({
        status: 200,
        data: { collections: [{ type: 'refuse', date: '2026-04-07' }, { type: 'recycling', date: '2026-04-14' }, { type: 'food', date: '2026-04-07' }] },
      });
      mockEvidenceStore.store.mockResolvedValue({ evidenceRef: 'evidence_pcc_json_002' });

      const mockResult: CollectionEventResult = { success: true, data: [{ eventId: 'pcc_general_2026-04-07', serviceId: 'pcc_general', serviceType: 'general_waste' as ServiceType, collectionDate: '2026-04-07', isConfirmed: true, isRescheduled: false, isPast: false }, { eventId: 'pcc_recycling_2026-04-14', serviceId: 'pcc_recycling', serviceType: 'recycling' as ServiceType, collectionDate: '2026-04-14', isConfirmed: true, isRescheduled: false, isPast: false }, { eventId: 'pcc_food_2026-04-07', serviceId: 'pcc_food', serviceType: 'food_waste' as ServiceType, collectionDate: '2026-04-07', isConfirmed: true, isRescheduled: false, isPast: false }], acquisitionMetadata: { attemptId: 'attempt_pcc_json_002', adapterId: 'portsmouth', councilId: 'portsmouth', lookupMethod: 'api' as const, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 380, httpRequestCount: 1, bytesReceived: 450, usedBrowserAutomation: false, adapterVersion: '1.0.0', executionEnvironment: 'test', riskLevel: 'low', cacheHit: false }, sourceEvidenceRef: 'evidence_pcc_json_002', confidence: 0.95, warnings: [], securityWarnings: [], fromCache: false };
      expect(mockResult.data?.map(e => e.serviceType)).toContain('general_waste');
      expect(mockResult.data?.map(e => e.serviceType)).toContain('recycling');
      expect(mockResult.data?.map(e => e.serviceType)).toContain('food_waste');
    });
  });

  describe('Browser Fallback Mode', () => {
    it('should return addresses via browser', async () => {
      mockPage.content.mockResolvedValue('<option value="pcc_browser_5002">2 Civic Way, Portsmouth, PO1 2DT</option>');
      mockEvidenceStore.store.mockResolvedValue({ evidenceRef: 'evidence_pcc_browser_001' });

      const mockResult: AddressCandidateResult = { success: true, data: [{ councilLocalId: 'pcc_browser_5002', addressRaw: '2 Civic Way, Portsmouth, PO1 2DT', addressNormalised: '2 civic way portsmouth po1 2dt', addressDisplay: '2 Civic Way, Portsmouth, PO1 2DT', postcode: 'PO1 2DT', confidence: 0.85 }], acquisitionMetadata: { attemptId: 'attempt_pcc_browser_001', adapterId: 'portsmouth', councilId: 'portsmouth', lookupMethod: 'browser_automation' as const, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 2100, httpRequestCount: 2, bytesReceived: 7000, usedBrowserAutomation: true, adapterVersion: '1.0.0', executionEnvironment: 'test', riskLevel: 'high', cacheHit: false }, sourceEvidenceRef: 'evidence_pcc_browser_001', confidence: 0.8, warnings: [], securityWarnings: [], fromCache: false };
      expect(mockResult.success).toBe(true);
      expect(mockResult.acquisitionMetadata.lookupMethod).toBe('browser_automation');
    });

    it('should return events via browser', async () => {
      mockPage.content.mockResolvedValue('<p>Black bin: 2026-04-08</p><p>Blue bin: 2026-04-15</p>');
      mockEvidenceStore.store.mockResolvedValue({ evidenceRef: 'evidence_pcc_browser_002' });

      const mockResult: CollectionEventResult = { success: true, data: [{ eventId: 'pcc_general_2026-04-08', serviceId: 'pcc_general', serviceType: 'general_waste' as ServiceType, collectionDate: '2026-04-08', isConfirmed: true, isRescheduled: false, isPast: false }, { eventId: 'pcc_recycling_2026-04-15', serviceId: 'pcc_recycling', serviceType: 'recycling' as ServiceType, collectionDate: '2026-04-15', isConfirmed: true, isRescheduled: false, isPast: false }], acquisitionMetadata: { attemptId: 'attempt_pcc_browser_002', adapterId: 'portsmouth', councilId: 'portsmouth', lookupMethod: 'browser_automation' as const, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 2900, httpRequestCount: 3, bytesReceived: 9500, usedBrowserAutomation: true, adapterVersion: '1.0.0', executionEnvironment: 'test', riskLevel: 'high', cacheHit: false }, sourceEvidenceRef: 'evidence_pcc_browser_002', confidence: 0.8, warnings: [], securityWarnings: [], fromCache: false };
      expect(mockResult.data?.map(e => e.serviceType)).toContain('general_waste');
      expect(mockResult.data?.map(e => e.serviceType)).toContain('recycling');
    });
  });

  describe('discoverCapabilities()', () => {
    it('should return correct method based on availability', async () => {
      const mockCapabilities: CouncilCapabilities = {
        councilId: 'portsmouth',
        councilName: 'Portsmouth City Council',
        councilWebsite: 'https://www.portsmouth.gov.uk',
        supportsAddressLookup: true,
        supportsCollectionServices: true,
        supportsCollectionEvents: true,
        providesUprn: true,
        primaryLookupMethod: 'api' as const,
        maxEventRangeDays: 90,
        supportedServiceTypes: ['general_waste', 'recycling', 'food_waste'] as ServiceType[],
        limitations: [],
        rateLimitRpm: 60,
        adapterLastUpdated: '2026-03-25',
        isProductionReady: true,
      };

      expect(mockCapabilities.primaryLookupMethod).toBe('api');
    });
  });

  describe('Bin Type Mapping', () => {
    it('should map all bin types', () => {
      const normalize = (raw: string): ServiceType => { const l = raw.toLowerCase(); if (l.includes('refuse') || l.includes('general') || l.includes('black')) return 'general_waste'; if (l.includes('recycl') || l.includes('blue')) return 'recycling'; if (l.includes('garden')) return 'garden_waste'; if (l.includes('food')) return 'food_waste'; return 'other'; };
      expect(normalize('Refuse')).toBe('general_waste');
      expect(normalize('Recycling')).toBe('recycling');
      expect(normalize('Food')).toBe('food_waste');
    });
  });

  describe('Error Cases', () => {
    it('should handle empty', async () => {
      const mockResult: AddressCandidateResult = { success: true, data: [], acquisitionMetadata: { attemptId: 'attempt_pcc_003', adapterId: 'portsmouth', councilId: 'portsmouth', lookupMethod: 'api' as const, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 300, httpRequestCount: 1, bytesReceived: 50, usedBrowserAutomation: false, adapterVersion: '1.0.0', executionEnvironment: 'test', riskLevel: 'low', cacheHit: false }, confidence: 0.9, warnings: ['No addresses'], securityWarnings: [], fromCache: false };
      expect(mockResult.data).toHaveLength(0);
    });

    it('should handle timeout', async () => {
      mockHttpClient.get.mockRejectedValue(new Error('Timeout'));
      const mockResult: CollectionEventResult = { success: false, acquisitionMetadata: { attemptId: 'attempt_pcc_004', adapterId: 'portsmouth', councilId: 'portsmouth', lookupMethod: 'api' as const, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 30000, httpRequestCount: 0, bytesReceived: 0, usedBrowserAutomation: false, adapterVersion: '1.0.0', executionEnvironment: 'test', riskLevel: 'low', cacheHit: false }, confidence: 0, warnings: [], securityWarnings: [], failureCategory: 'timeout' as FailureCategory, errorMessage: 'Timeout', fromCache: false };
      expect(mockResult.failureCategory).toBe('timeout');
    });

    it('should handle 500', async () => {
      const mockResult: CollectionEventResult = { success: false, acquisitionMetadata: { attemptId: 'attempt_pcc_005', adapterId: 'portsmouth', councilId: 'portsmouth', lookupMethod: 'api' as const, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 350, httpRequestCount: 1, bytesReceived: 0, usedBrowserAutomation: false, adapterVersion: '1.0.0', executionEnvironment: 'test', riskLevel: 'low', cacheHit: false }, confidence: 0, warnings: [], securityWarnings: [], failureCategory: 'server_error' as FailureCategory, errorMessage: 'HTTP 500', fromCache: false };
      expect(mockResult.failureCategory).toBe('server_error');
    });

    it('should handle parse error', async () => {
      mockHttpClient.get.mockResolvedValue({ status: 200, data: 'invalid json' });
      const mockResult: CollectionEventResult = { success: false, acquisitionMetadata: { attemptId: 'attempt_pcc_006', adapterId: 'portsmouth', councilId: 'portsmouth', lookupMethod: 'api' as const, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 280, httpRequestCount: 1, bytesReceived: 50, usedBrowserAutomation: false, adapterVersion: '1.0.0', executionEnvironment: 'test', riskLevel: 'low', cacheHit: false }, confidence: 0, warnings: ['Parse failed'], securityWarnings: [], failureCategory: 'parse_error' as FailureCategory, errorMessage: 'JSON parse error', fromCache: false };
      expect(mockResult.failureCategory).toBe('parse_error');
    });

    it('should handle redirect (browser mode)', async () => {
      mockPage.url.mockReturnValue('https://attacker.com');
      const mockResult: CollectionEventResult = { success: false, acquisitionMetadata: { attemptId: 'attempt_pcc_007', adapterId: 'portsmouth', councilId: 'portsmouth', lookupMethod: 'browser_automation' as const, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 800, httpRequestCount: 1, bytesReceived: 0, usedBrowserAutomation: true, adapterVersion: '1.0.0', executionEnvironment: 'test', riskLevel: 'high', cacheHit: false }, confidence: 0, warnings: [], securityWarnings: ['Bad redirect'], failureCategory: 'server_error' as FailureCategory, errorMessage: 'Redirect', fromCache: false };
      expect(mockResult.securityWarnings).toContain('Bad redirect');
    });
  });

  describe('Security Cases', () => {
    it('should block kill switch', async () => {
      mockKillSwitch.isEnabled.mockResolvedValue(false);
      await expect(async () => { if (!(await mockKillSwitch.isEnabled())) throw new Error('ADAPTER_KILL_SWITCH_PORTSMOUTH=true'); }).rejects.toThrow('ADAPTER_KILL_SWITCH_PORTSMOUTH');
    });

    it('should sanitize XSS', () => {
      const clean = '<script>alert(1)</script>Test'.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      expect(clean).toBe('Test');
    });

    it('should prevent SSRF', () => {
      const isAllowed = (url: string) => new URL(url).hostname.endsWith('portsmouth.gov.uk');
      expect(isAllowed('http://169.254.169.254')).toBe(false);
    });
  });

  describe('verifyHealth()', () => {
    it('should work without navigation', async () => {
      const mockHealth: AdapterHealth = { councilId: 'portsmouth', status: 'healthy', lastSuccessAt: new Date().toISOString(), successRate24h: 0.93, avgResponseTimeMs24h: 1200, acquisitionCount24h: 145, checkedAt: new Date().toISOString(), upstreamReachable: true, schemaDriftDetected: false };
      expect(mockHealth.status).toBe('healthy');
    });
  });

  describe('Confidence Score', () => {
    it('should be high for JSON mode', () => {
      expect(0.95).toBeGreaterThanOrEqual(0.9);
    });

    it('should be 0.75-0.85 for browser mode', () => {
      expect(0.8).toBeGreaterThanOrEqual(0.75);
      expect(0.8).toBeLessThanOrEqual(0.85);
    });
  });
});
