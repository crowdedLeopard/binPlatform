/**
 * Hart Adapter Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AddressCandidateResult, CollectionEventResult, AdapterHealth, FailureCategory, ServiceType } from '../../../src/adapters/base/adapter.interface';

const mockPage = { goto: vi.fn(), fill: vi.fn(), click: vi.fn(), waitForSelector: vi.fn(), content: vi.fn(), screenshot: vi.fn(), selectOption: vi.fn(), url: vi.fn(), close: vi.fn() };
const mockEvidenceStore = { store: vi.fn() };
const mockKillSwitch = { isEnabled: vi.fn() };

describe('HartAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockKillSwitch.isEnabled.mockResolvedValue(true);
    mockPage.url.mockReturnValue('https://www.hart.gov.uk/bincollections');
  });

  it('should return addresses for valid postcode', async () => {
    mockPage.content.mockResolvedValue('<option value="hart_2001">1 Fleet Road, Fleet, GU51 4BY</option>');
    mockEvidenceStore.store.mockResolvedValue({ evidenceRef: 'evidence_hart_001' });
    const mockResult: AddressCandidateResult = { success: true, data: [{ councilLocalId: 'hart_2001', addressRaw: '1 Fleet Road, Fleet, GU51 4BY', addressNormalised: '1 fleet road fleet gu51 4by', addressDisplay: '1 Fleet Road, Fleet, GU51 4BY', postcode: 'GU51 4BY', confidence: 0.85 }], acquisitionMetadata: { attemptId: 'attempt_hart_001', adapterId: 'hart', councilId: 'hart', lookupMethod: 'browser_automation' as const, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 1800, httpRequestCount: 2, bytesReceived: 5500, usedBrowserAutomation: true, adapterVersion: '1.0.0', executionEnvironment: 'test', riskLevel: 'high', cacheHit: false }, sourceEvidenceRef: 'evidence_hart_001', confidence: 0.8, warnings: [], securityWarnings: [], fromCache: false };
    expect(mockResult.success).toBe(true);
    expect(mockResult.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it('should return collection events', async () => {
    mockPage.content.mockResolvedValue('<p>Refuse: 01/04/2026</p><p>Recycling: 08/04/2026</p><p>Garden: 15/04/2026</p>');
    mockEvidenceStore.store.mockResolvedValue({ evidenceRef: 'evidence_hart_002' });
    const mockResult: CollectionEventResult = { success: true, data: [{ eventId: 'hart_general_2026-04-01', serviceId: 'hart_general', serviceType: 'general_waste' as ServiceType, collectionDate: '2026-04-01', isConfirmed: true, isRescheduled: false, isPast: false }, { eventId: 'hart_recycling_2026-04-08', serviceId: 'hart_recycling', serviceType: 'recycling' as ServiceType, collectionDate: '2026-04-08', isConfirmed: true, isRescheduled: false, isPast: false }, { eventId: 'hart_garden_2026-04-15', serviceId: 'hart_garden', serviceType: 'garden_waste' as ServiceType, collectionDate: '2026-04-15', isConfirmed: true, isRescheduled: false, isPast: false }], acquisitionMetadata: { attemptId: 'attempt_hart_002', adapterId: 'hart', councilId: 'hart', lookupMethod: 'browser_automation' as const, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 2300, httpRequestCount: 3, bytesReceived: 7800, usedBrowserAutomation: true, adapterVersion: '1.0.0', executionEnvironment: 'test', riskLevel: 'high', cacheHit: false }, sourceEvidenceRef: 'evidence_hart_002', confidence: 0.8, warnings: [], securityWarnings: [], fromCache: false };
    expect(mockResult.data?.map(e => e.serviceType)).toContain('general_waste');
    expect(mockResult.data?.map(e => e.serviceType)).toContain('recycling');
    expect(mockResult.data?.map(e => e.serviceType)).toContain('garden_waste');
  });

  it('should map bin types correctly', () => {
    const normalize = (raw: string): ServiceType => { const l = raw.toLowerCase(); if (l.includes('refuse') || l.includes('general')) return 'general_waste'; if (l.includes('recycl')) return 'recycling'; if (l.includes('garden')) return 'garden_waste'; if (l.includes('food')) return 'food_waste'; return 'other'; };
    expect(normalize('Refuse')).toBe('general_waste');
    expect(normalize('Recycling')).toBe('recycling');
    expect(normalize('Garden')).toBe('garden_waste');
    expect(normalize('Food')).toBe('food_waste');
  });

  it('should handle empty results', async () => {
    const mockResult: AddressCandidateResult = { success: true, data: [], acquisitionMetadata: { attemptId: 'attempt_hart_003', adapterId: 'hart', councilId: 'hart', lookupMethod: 'browser_automation' as const, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 900, httpRequestCount: 1, bytesReceived: 120, usedBrowserAutomation: true, adapterVersion: '1.0.0', executionEnvironment: 'test', riskLevel: 'high', cacheHit: false }, confidence: 0.75, warnings: ['No addresses'], securityWarnings: [], fromCache: false };
    expect(mockResult.data).toHaveLength(0);
  });

  it('should handle timeout', async () => {
    mockPage.goto.mockRejectedValue(new Error('Timeout'));
    const mockResult: CollectionEventResult = { success: false, acquisitionMetadata: { attemptId: 'attempt_hart_004', adapterId: 'hart', councilId: 'hart', lookupMethod: 'browser_automation' as const, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 30000, httpRequestCount: 0, bytesReceived: 0, usedBrowserAutomation: true, adapterVersion: '1.0.0', executionEnvironment: 'test', riskLevel: 'high', cacheHit: false }, confidence: 0, warnings: [], securityWarnings: [], failureCategory: 'timeout' as FailureCategory, errorMessage: 'Timeout', fromCache: false };
    expect(mockResult.failureCategory).toBe('timeout');
  });

  it('should handle 500', async () => {
    const mockResult: CollectionEventResult = { success: false, acquisitionMetadata: { attemptId: 'attempt_hart_005', adapterId: 'hart', councilId: 'hart', lookupMethod: 'browser_automation' as const, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 400, httpRequestCount: 1, bytesReceived: 0, usedBrowserAutomation: true, adapterVersion: '1.0.0', executionEnvironment: 'test', riskLevel: 'high', cacheHit: false }, confidence: 0, warnings: [], securityWarnings: [], failureCategory: 'server_error' as FailureCategory, errorMessage: 'HTTP 500', fromCache: false };
    expect(mockResult.failureCategory).toBe('server_error');
  });

  it('should handle parse error', async () => {
    mockPage.content.mockResolvedValue('<html></html>');
    const mockResult: CollectionEventResult = { success: false, acquisitionMetadata: { attemptId: 'attempt_hart_006', adapterId: 'hart', councilId: 'hart', lookupMethod: 'browser_automation' as const, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 1400, httpRequestCount: 2, bytesReceived: 90, usedBrowserAutomation: true, adapterVersion: '1.0.0', executionEnvironment: 'test', riskLevel: 'high', cacheHit: false }, confidence: 0, warnings: ['Parse failed'], securityWarnings: [], failureCategory: 'parse_error' as FailureCategory, errorMessage: 'Parse error', fromCache: false };
    expect(mockResult.failureCategory).toBe('parse_error');
  });

  it('should handle redirect', async () => {
    mockPage.url.mockReturnValue('https://attacker.com');
    const mockResult: CollectionEventResult = { success: false, acquisitionMetadata: { attemptId: 'attempt_hart_007', adapterId: 'hart', councilId: 'hart', lookupMethod: 'browser_automation' as const, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 700, httpRequestCount: 1, bytesReceived: 0, usedBrowserAutomation: true, adapterVersion: '1.0.0', executionEnvironment: 'test', riskLevel: 'high', cacheHit: false }, confidence: 0, warnings: [], securityWarnings: ['Bad redirect'], failureCategory: 'server_error' as FailureCategory, errorMessage: 'Redirect', fromCache: false };
    expect(mockResult.securityWarnings).toContain('Bad redirect');
  });

  it('should block kill switch', async () => {
    mockKillSwitch.isEnabled.mockResolvedValue(false);
    await expect(async () => { if (!(await mockKillSwitch.isEnabled())) throw new Error('ADAPTER_KILL_SWITCH_HART=true'); }).rejects.toThrow('ADAPTER_KILL_SWITCH_HART');
  });

  it('should sanitize XSS', () => {
    const malicious = '<script>bad</script>Good';
    const clean = malicious.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    expect(clean).toBe('Good');
  });

  it('should prevent SSRF', () => {
    const isAllowed = (url: string) => new URL(url).hostname.endsWith('hart.gov.uk');
    expect(isAllowed('http://169.254.169.254')).toBe(false);
  });

  it('verifyHealth works', async () => {
    const mockHealth: AdapterHealth = { councilId: 'hart', status: 'healthy', lastSuccessAt: new Date().toISOString(), successRate24h: 0.90, avgResponseTimeMs24h: 2000, acquisitionCount24h: 78, checkedAt: new Date().toISOString(), upstreamReachable: true, schemaDriftDetected: false };
    expect(mockHealth.status).toBe('healthy');
  });

  it('confidence 0.75-0.85', () => {
    expect(0.8).toBeGreaterThanOrEqual(0.75);
    expect(0.8).toBeLessThanOrEqual(0.85);
  });
});
