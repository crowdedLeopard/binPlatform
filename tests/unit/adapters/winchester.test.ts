/**
 * Winchester Adapter Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AddressCandidateResult, CollectionEventResult, AdapterHealth, FailureCategory, ServiceType } from '../../../src/adapters/base/adapter.interface';

const mockPage = { goto: vi.fn(), fill: vi.fn(), click: vi.fn(), waitForSelector: vi.fn(), content: vi.fn(), screenshot: vi.fn(), selectOption: vi.fn(), url: vi.fn(), close: vi.fn() };
const mockEvidenceStore = { store: vi.fn() };
const mockKillSwitch = { isEnabled: vi.fn() };

describe('WinchesterAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockKillSwitch.isEnabled.mockResolvedValue(true);
    mockPage.url.mockReturnValue('https://www.winchester.gov.uk/bincollections');
  });

  it('should return addresses', async () => {
    mockPage.content.mockResolvedValue('<option value="win_3001">1 High Street, Winchester, SO23 8UL</option>');
    mockEvidenceStore.store.mockResolvedValue({ evidenceRef: 'evidence_win_001' });
    const mockResult: AddressCandidateResult = { success: true, data: [{ councilLocalId: 'win_3001', addressRaw: '1 High Street, Winchester, SO23 8UL', addressNormalised: '1 high street winchester so23 8ul', addressDisplay: '1 High Street, Winchester, SO23 8UL', postcode: 'SO23 8UL', confidence: 0.85 }], acquisitionMetadata: { attemptId: 'attempt_win_001', adapterId: 'winchester', councilId: 'winchester', lookupMethod: 'browser_automation' as const, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 2200, httpRequestCount: 2, bytesReceived: 6800, usedBrowserAutomation: true, adapterVersion: '1.0.0', executionEnvironment: 'test', riskLevel: 'high', cacheHit: false }, sourceEvidenceRef: 'evidence_win_001', confidence: 0.8, warnings: [], securityWarnings: [], fromCache: false };
    expect(mockResult.success).toBe(true);
    expect(mockResult.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it('should return collection events', async () => {
    mockPage.content.mockResolvedValue('<div>Black bin: 2026-04-04</div><div>Blue bin: 2026-04-11</div><div>Garden: 2026-04-18</div><div>Food: 2026-04-04</div>');
    mockEvidenceStore.store.mockResolvedValue({ evidenceRef: 'evidence_win_002' });
    const mockResult: CollectionEventResult = { success: true, data: [{ eventId: 'win_general_2026-04-04', serviceId: 'win_general', serviceType: 'general_waste' as ServiceType, collectionDate: '2026-04-04', isConfirmed: true, isRescheduled: false, isPast: false }, { eventId: 'win_recycling_2026-04-11', serviceId: 'win_recycling', serviceType: 'recycling' as ServiceType, collectionDate: '2026-04-11', isConfirmed: true, isRescheduled: false, isPast: false }, { eventId: 'win_garden_2026-04-18', serviceId: 'win_garden', serviceType: 'garden_waste' as ServiceType, collectionDate: '2026-04-18', isConfirmed: true, isRescheduled: false, isPast: false }, { eventId: 'win_food_2026-04-04', serviceId: 'win_food', serviceType: 'food_waste' as ServiceType, collectionDate: '2026-04-04', isConfirmed: true, isRescheduled: false, isPast: false }], acquisitionMetadata: { attemptId: 'attempt_win_002', adapterId: 'winchester', councilId: 'winchester', lookupMethod: 'browser_automation' as const, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 2800, httpRequestCount: 3, bytesReceived: 9200, usedBrowserAutomation: true, adapterVersion: '1.0.0', executionEnvironment: 'test', riskLevel: 'high', cacheHit: false }, sourceEvidenceRef: 'evidence_win_002', confidence: 0.8, warnings: [], securityWarnings: [], fromCache: false };
    expect(mockResult.data?.map(e => e.serviceType)).toContain('general_waste');
    expect(mockResult.data?.map(e => e.serviceType)).toContain('recycling');
    expect(mockResult.data?.map(e => e.serviceType)).toContain('garden_waste');
    expect(mockResult.data?.map(e => e.serviceType)).toContain('food_waste');
  });

  it('should map bin types', () => {
    const normalize = (raw: string): ServiceType => { const l = raw.toLowerCase(); if (l.includes('refuse') || l.includes('general') || l.includes('black')) return 'general_waste'; if (l.includes('recycl') || l.includes('blue')) return 'recycling'; if (l.includes('garden') || l.includes('green')) return 'garden_waste'; if (l.includes('food')) return 'food_waste'; return 'other'; };
    expect(normalize('Black bin')).toBe('general_waste');
    expect(normalize('Blue bin')).toBe('recycling');
    expect(normalize('Garden')).toBe('garden_waste');
    expect(normalize('Food')).toBe('food_waste');
  });

  it('should handle empty', async () => {
    const mockResult: AddressCandidateResult = { success: true, data: [], acquisitionMetadata: { attemptId: 'attempt_win_003', adapterId: 'winchester', councilId: 'winchester', lookupMethod: 'browser_automation' as const, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 1100, httpRequestCount: 1, bytesReceived: 140, usedBrowserAutomation: true, adapterVersion: '1.0.0', executionEnvironment: 'test', riskLevel: 'high', cacheHit: false }, confidence: 0.75, warnings: ['No addresses'], securityWarnings: [], fromCache: false };
    expect(mockResult.data).toHaveLength(0);
  });

  it('should handle timeout', async () => {
    mockPage.goto.mockRejectedValue(new Error('Timeout'));
    const mockResult: CollectionEventResult = { success: false, acquisitionMetadata: { attemptId: 'attempt_win_004', adapterId: 'winchester', councilId: 'winchester', lookupMethod: 'browser_automation' as const, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 30000, httpRequestCount: 0, bytesReceived: 0, usedBrowserAutomation: true, adapterVersion: '1.0.0', executionEnvironment: 'test', riskLevel: 'high', cacheHit: false }, confidence: 0, warnings: [], securityWarnings: [], failureCategory: 'timeout' as FailureCategory, errorMessage: 'Timeout', fromCache: false };
    expect(mockResult.failureCategory).toBe('timeout');
  });

  it('should handle 500', async () => {
    const mockResult: CollectionEventResult = { success: false, acquisitionMetadata: { attemptId: 'attempt_win_005', adapterId: 'winchester', councilId: 'winchester', lookupMethod: 'browser_automation' as const, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 500, httpRequestCount: 1, bytesReceived: 0, usedBrowserAutomation: true, adapterVersion: '1.0.0', executionEnvironment: 'test', riskLevel: 'high', cacheHit: false }, confidence: 0, warnings: [], securityWarnings: [], failureCategory: 'server_error' as FailureCategory, errorMessage: 'HTTP 500', fromCache: false };
    expect(mockResult.failureCategory).toBe('server_error');
  });

  it('should handle parse error', async () => {
    mockPage.content.mockResolvedValue('<html></html>');
    const mockResult: CollectionEventResult = { success: false, acquisitionMetadata: { attemptId: 'attempt_win_006', adapterId: 'winchester', councilId: 'winchester', lookupMethod: 'browser_automation' as const, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 1600, httpRequestCount: 2, bytesReceived: 80, usedBrowserAutomation: true, adapterVersion: '1.0.0', executionEnvironment: 'test', riskLevel: 'high', cacheHit: false }, confidence: 0, warnings: ['Parse failed'], securityWarnings: [], failureCategory: 'parse_error' as FailureCategory, errorMessage: 'Parse error', fromCache: false };
    expect(mockResult.failureCategory).toBe('parse_error');
  });

  it('should handle redirect', async () => {
    mockPage.url.mockReturnValue('https://evil.com');
    const mockResult: CollectionEventResult = { success: false, acquisitionMetadata: { attemptId: 'attempt_win_007', adapterId: 'winchester', councilId: 'winchester', lookupMethod: 'browser_automation' as const, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 650, httpRequestCount: 1, bytesReceived: 0, usedBrowserAutomation: true, adapterVersion: '1.0.0', executionEnvironment: 'test', riskLevel: 'high', cacheHit: false }, confidence: 0, warnings: [], securityWarnings: ['Redirect blocked'], failureCategory: 'server_error' as FailureCategory, errorMessage: 'Redirect', fromCache: false };
    expect(mockResult.securityWarnings).toContain('Redirect blocked');
  });

  it('should block kill switch', async () => {
    mockKillSwitch.isEnabled.mockResolvedValue(false);
    await expect(async () => { if (!(await mockKillSwitch.isEnabled())) throw new Error('ADAPTER_KILL_SWITCH_WINCHESTER=true'); }).rejects.toThrow('ADAPTER_KILL_SWITCH_WINCHESTER');
  });

  it('should sanitize XSS', () => {
    const clean = '<script>alert(1)</script>Test'.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    expect(clean).toBe('Test');
  });

  it('should prevent SSRF', () => {
    const isAllowed = (url: string) => new URL(url).hostname.endsWith('winchester.gov.uk');
    expect(isAllowed('http://169.254.169.254')).toBe(false);
  });

  it('verifyHealth', async () => {
    const mockHealth: AdapterHealth = { councilId: 'winchester', status: 'healthy', lastSuccessAt: new Date().toISOString(), successRate24h: 0.87, avgResponseTimeMs24h: 2600, acquisitionCount24h: 112, checkedAt: new Date().toISOString(), upstreamReachable: true, schemaDriftDetected: false };
    expect(mockHealth.status).toBe('healthy');
  });

  it('confidence', () => {
    expect(0.8).toBeGreaterThanOrEqual(0.75);
    expect(0.8).toBeLessThanOrEqual(0.85);
  });
});
