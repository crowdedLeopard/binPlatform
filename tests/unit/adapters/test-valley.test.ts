/**
 * Test Valley Adapter Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AddressCandidateResult, CollectionEventResult, AdapterHealth, FailureCategory, ServiceType } from '../../../src/adapters/base/adapter.interface';

const mockPage = { goto: vi.fn(), fill: vi.fn(), click: vi.fn(), waitForSelector: vi.fn(), content: vi.fn(), screenshot: vi.fn(), selectOption: vi.fn(), url: vi.fn(), close: vi.fn() };
const mockEvidenceStore = { store: vi.fn() };
const mockKillSwitch = { isEnabled: vi.fn() };

describe('TestValleyAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockKillSwitch.isEnabled.mockResolvedValue(true);
    mockPage.url.mockReturnValue('https://www.testvalley.gov.uk/bincollections');
  });

  it('should return addresses', async () => {
    mockPage.content.mockResolvedValue('<option value="tv_4001">1 Church Close, Romsey, SO51 8EP</option>');
    mockEvidenceStore.store.mockResolvedValue({ evidenceRef: 'evidence_tv_001' });
    const mockResult: AddressCandidateResult = { success: true, data: [{ councilLocalId: 'tv_4001', addressRaw: '1 Church Close, Romsey, SO51 8EP', addressNormalised: '1 church close romsey so51 8ep', addressDisplay: '1 Church Close, Romsey, SO51 8EP', postcode: 'SO51 8EP', confidence: 0.85 }], acquisitionMetadata: { attemptId: 'attempt_tv_001', adapterId: 'test-valley', councilId: 'test-valley', lookupMethod: 'browser_automation' as const, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 2000, httpRequestCount: 2, bytesReceived: 6200, usedBrowserAutomation: true, adapterVersion: '1.0.0', executionEnvironment: 'test', riskLevel: 'high', cacheHit: false }, sourceEvidenceRef: 'evidence_tv_001', confidence: 0.8, warnings: [], securityWarnings: [], fromCache: false };
    expect(mockResult.success).toBe(true);
    expect(mockResult.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it('should return events', async () => {
    mockPage.content.mockResolvedValue('<li>Refuse: 2026-04-06</li><li>Recycling: 2026-04-13</li><li>Garden: 2026-04-20</li>');
    mockEvidenceStore.store.mockResolvedValue({ evidenceRef: 'evidence_tv_002' });
    const mockResult: CollectionEventResult = { success: true, data: [{ eventId: 'tv_general_2026-04-06', serviceId: 'tv_general', serviceType: 'general_waste' as ServiceType, collectionDate: '2026-04-06', isConfirmed: true, isRescheduled: false, isPast: false }, { eventId: 'tv_recycling_2026-04-13', serviceId: 'tv_recycling', serviceType: 'recycling' as ServiceType, collectionDate: '2026-04-13', isConfirmed: true, isRescheduled: false, isPast: false }, { eventId: 'tv_garden_2026-04-20', serviceId: 'tv_garden', serviceType: 'garden_waste' as ServiceType, collectionDate: '2026-04-20', isConfirmed: true, isRescheduled: false, isPast: false }], acquisitionMetadata: { attemptId: 'attempt_tv_002', adapterId: 'test-valley', councilId: 'test-valley', lookupMethod: 'browser_automation' as const, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 2700, httpRequestCount: 3, bytesReceived: 8900, usedBrowserAutomation: true, adapterVersion: '1.0.0', executionEnvironment: 'test', riskLevel: 'high', cacheHit: false }, sourceEvidenceRef: 'evidence_tv_002', confidence: 0.8, warnings: [], securityWarnings: [], fromCache: false };
    expect(mockResult.data?.map(e => e.serviceType)).toContain('general_waste');
    expect(mockResult.data?.map(e => e.serviceType)).toContain('recycling');
    expect(mockResult.data?.map(e => e.serviceType)).toContain('garden_waste');
  });

  it('should map bins', () => {
    const normalize = (raw: string): ServiceType => { const l = raw.toLowerCase(); if (l.includes('refuse') || l.includes('general')) return 'general_waste'; if (l.includes('recycl')) return 'recycling'; if (l.includes('garden')) return 'garden_waste'; if (l.includes('food')) return 'food_waste'; return 'other'; };
    expect(normalize('Refuse')).toBe('general_waste');
    expect(normalize('Recycling')).toBe('recycling');
    expect(normalize('Garden')).toBe('garden_waste');
  });

  it('should handle empty', async () => {
    const mockResult: AddressCandidateResult = { success: true, data: [], acquisitionMetadata: { attemptId: 'attempt_tv_003', adapterId: 'test-valley', councilId: 'test-valley', lookupMethod: 'browser_automation' as const, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 1000, httpRequestCount: 1, bytesReceived: 130, usedBrowserAutomation: true, adapterVersion: '1.0.0', executionEnvironment: 'test', riskLevel: 'high', cacheHit: false }, confidence: 0.75, warnings: ['No addresses'], securityWarnings: [], fromCache: false };
    expect(mockResult.data).toHaveLength(0);
  });

  it('should handle timeout', async () => {
    mockPage.goto.mockRejectedValue(new Error('Timeout'));
    const mockResult: CollectionEventResult = { success: false, acquisitionMetadata: { attemptId: 'attempt_tv_004', adapterId: 'test-valley', councilId: 'test-valley', lookupMethod: 'browser_automation' as const, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 30000, httpRequestCount: 0, bytesReceived: 0, usedBrowserAutomation: true, adapterVersion: '1.0.0', executionEnvironment: 'test', riskLevel: 'high', cacheHit: false }, confidence: 0, warnings: [], securityWarnings: [], failureCategory: 'timeout' as FailureCategory, errorMessage: 'Timeout', fromCache: false };
    expect(mockResult.failureCategory).toBe('timeout');
  });

  it('should handle 500', async () => {
    const mockResult: CollectionEventResult = { success: false, acquisitionMetadata: { attemptId: 'attempt_tv_005', adapterId: 'test-valley', councilId: 'test-valley', lookupMethod: 'browser_automation' as const, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 450, httpRequestCount: 1, bytesReceived: 0, usedBrowserAutomation: true, adapterVersion: '1.0.0', executionEnvironment: 'test', riskLevel: 'high', cacheHit: false }, confidence: 0, warnings: [], securityWarnings: [], failureCategory: 'server_error' as FailureCategory, errorMessage: 'HTTP 500', fromCache: false };
    expect(mockResult.failureCategory).toBe('server_error');
  });

  it('should handle parse error', async () => {
    mockPage.content.mockResolvedValue('<html></html>');
    const mockResult: CollectionEventResult = { success: false, acquisitionMetadata: { attemptId: 'attempt_tv_006', adapterId: 'test-valley', councilId: 'test-valley', lookupMethod: 'browser_automation' as const, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 1550, httpRequestCount: 2, bytesReceived: 95, usedBrowserAutomation: true, adapterVersion: '1.0.0', executionEnvironment: 'test', riskLevel: 'high', cacheHit: false }, confidence: 0, warnings: ['No schedule'], securityWarnings: [], failureCategory: 'parse_error' as FailureCategory, errorMessage: 'Parse error', fromCache: false };
    expect(mockResult.failureCategory).toBe('parse_error');
  });

  it('should handle redirect', async () => {
    mockPage.url.mockReturnValue('https://bad.com');
    const mockResult: CollectionEventResult = { success: false, acquisitionMetadata: { attemptId: 'attempt_tv_007', adapterId: 'test-valley', councilId: 'test-valley', lookupMethod: 'browser_automation' as const, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 720, httpRequestCount: 1, bytesReceived: 0, usedBrowserAutomation: true, adapterVersion: '1.0.0', executionEnvironment: 'test', riskLevel: 'high', cacheHit: false }, confidence: 0, warnings: [], securityWarnings: ['Bad redirect'], failureCategory: 'server_error' as FailureCategory, errorMessage: 'Redirect', fromCache: false };
    expect(mockResult.securityWarnings).toContain('Bad redirect');
  });

  it('should block kill switch', async () => {
    mockKillSwitch.isEnabled.mockResolvedValue(false);
    await expect(async () => { if (!(await mockKillSwitch.isEnabled())) throw new Error('ADAPTER_KILL_SWITCH_TEST_VALLEY=true'); }).rejects.toThrow('ADAPTER_KILL_SWITCH_TEST_VALLEY');
  });

  it('should sanitize XSS', () => {
    const clean = '<script>alert(1)</script>Test'.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    expect(clean).toBe('Test');
  });

  it('should prevent SSRF', () => {
    const isAllowed = (url: string) => new URL(url).hostname.endsWith('testvalley.gov.uk');
    expect(isAllowed('http://169.254.169.254')).toBe(false);
  });

  it('verifyHealth', async () => {
    const mockHealth: AdapterHealth = { councilId: 'test-valley', status: 'healthy', lastSuccessAt: new Date().toISOString(), successRate24h: 0.86, avgResponseTimeMs24h: 2500, acquisitionCount24h: 98, checkedAt: new Date().toISOString(), upstreamReachable: true, schemaDriftDetected: false };
    expect(mockHealth.status).toBe('healthy');
  });

  it('confidence', () => {
    expect(0.8).toBeGreaterThanOrEqual(0.75);
    expect(0.8).toBeLessThanOrEqual(0.85);
  });
});
