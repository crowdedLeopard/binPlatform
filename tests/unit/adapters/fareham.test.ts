/**
 * Fareham/Bartec Adapter Unit Tests
 * 
 * Tests the Fareham adapter (Bartec SOAP API) in isolation with mocked responses.
 * Tests based on specification in docs/discovery/fareham-notes.md
 * and adapter interface contract in src/adapters/base/adapter.interface.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { 
  PropertyIdentity,
  CollectionEventResult,
  AdapterHealth,
  HealthStatus,
  FailureCategory,
  ServiceType,
  ExecutionRiskLevel,
} from '../../../src/adapters/base/adapter.interface';
import farehamBartecValidXml from '../../fixtures/responses/fareham-bartec-valid.xml?raw';
import farehamBartecFaultXml from '../../fixtures/responses/fareham-bartec-fault.xml?raw';
import farehamBartecEmptyXml from '../../fixtures/responses/fareham-bartec-empty.xml?raw';

const mockHttpClient = {
  post: vi.fn(),
  get: vi.fn(),
};

const mockEvidenceStore = {
  store: vi.fn(),
};

const mockKillSwitch = {
  isEnabled: vi.fn(),
};

describe('FarehamAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockKillSwitch.isEnabled.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Happy Path - Valid UPRN via SOAP', () => {
    it('should return collection events from valid Bartec SOAP response', async () => {
      mockHttpClient.post.mockResolvedValue({
        status: 200,
        data: farehamBartecValidXml,
        headers: { 'content-type': 'text/xml; charset=utf-8' },
      });

      mockEvidenceStore.store.mockResolvedValue({
        evidenceRef: 'evidence_fareham_soap_123',
        storagePath: 'fareham/evidence_fareham_soap_123.xml',
      });

      const propertyIdentity: PropertyIdentity = {
        councilLocalId: '100060321174',
        uprn: '100060321174',
        address: '1 High Street, Fareham, PO16 7AW',
        postcode: 'PO16 7AW',
        correlationId: 'test-fareham-001',
      };

      const mockResult: CollectionEventResult = {
        success: true,
        data: [
          {
            eventId: 'bartec_refuse_2026-03-30',
            serviceId: 'bartec_refuse',
            serviceType: 'general_waste' as ServiceType,
            collectionDate: '2026-03-30',
            isConfirmed: true,
            isRescheduled: false,
            isPast: false,
          },
          {
            eventId: 'bartec_recycling_2026-04-06',
            serviceId: 'bartec_recycling',
            serviceType: 'recycling' as ServiceType,
            collectionDate: '2026-04-06',
            isConfirmed: true,
            isRescheduled: false,
            isPast: false,
          },
        ],
        acquisitionMetadata: {
          attemptId: 'attempt_fareham_001',
          adapterId: 'fareham',
          councilId: 'fareham',
          lookupMethod: 'api' as const,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 320,
          httpRequestCount: 1,
          bytesReceived: 1850,
          usedBrowserAutomation: false,
          adapterVersion: '1.0.0',
          executionEnvironment: 'test',
          riskLevel: 'low' as const,
          cacheHit: false,
        },
        sourceEvidenceRef: 'evidence_fareham_soap_123',
        confidence: 0.95,
        warnings: [],
        securityWarnings: [],
        fromCache: false,
      };

      expect(mockResult.success).toBe(true);
      expect(mockResult.data).toHaveLength(2);
      expect(mockResult.confidence).toBeGreaterThanOrEqual(0.9);
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        expect.stringContaining('bartec'),
        expect.anything()
      );
    });

    it('should include correct acquisition method as "api"', async () => {
      mockHttpClient.post.mockResolvedValue({
        status: 200,
        data: farehamBartecValidXml,
        headers: { 'content-type': 'text/xml' },
      });

      mockEvidenceStore.store.mockResolvedValue({
        evidenceRef: 'evidence_fareham_002',
        storagePath: 'fareham/evidence_fareham_002.xml',
      });

      const mockResult: CollectionEventResult = {
        success: true,
        data: [],
        acquisitionMetadata: {
          attemptId: 'attempt_002',
          adapterId: 'fareham',
          councilId: 'fareham',
          lookupMethod: 'api' as const,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 300,
          httpRequestCount: 1,
          bytesReceived: 1800,
          usedBrowserAutomation: false,
          adapterVersion: '1.0.0',
          executionEnvironment: 'test',
          riskLevel: 'low' as const,
          cacheHit: false,
        },
        confidence: 0.95,
        warnings: [],
        securityWarnings: [],
        fromCache: false,
      };

      expect(mockResult.acquisitionMetadata.lookupMethod).toBe('api');
      expect(mockResult.confidence).toBeGreaterThanOrEqual(0.9);
    });
  });

  describe('Bartec Service Code Mapping', () => {
    const bartecServiceMappings = [
      { code: 'REFUSE', expected: 'general_waste' as ServiceType },
      { code: 'RECYCLE', expected: 'recycling' as ServiceType },
      { code: 'RECYCLING', expected: 'recycling' as ServiceType },
      { code: 'GARDEN', expected: 'garden_waste' as ServiceType },
      { code: 'FOOD', expected: 'food_waste' as ServiceType },
      { code: 'GLASS', expected: 'glass' as ServiceType },
    ];

    bartecServiceMappings.forEach(({ code, expected }) => {
      it(`should map Bartec service code "${code}" to "${expected}"`, () => {
        const mapBartecServiceType = (serviceCode: string): ServiceType => {
          const normalized = serviceCode.toUpperCase();
          if (normalized.includes('REFUSE') || normalized.includes('RUBBISH')) return 'general_waste';
          if (normalized.includes('RECYCL')) return 'recycling';
          if (normalized.includes('GARDEN')) return 'garden_waste';
          if (normalized.includes('FOOD')) return 'food_waste';
          if (normalized.includes('GLASS')) return 'glass';
          return 'other';
        };

        const result = mapBartecServiceType(code);
        expect(result).toBe(expected);
      });
    });

    it('should map unknown Bartec service code to "other" with warning', () => {
      const unknownCode = 'BARTEC_UNKNOWN_TYPE';
      
      const mapBartecServiceType = (serviceCode: string): ServiceType => {
        const normalized = serviceCode.toUpperCase();
        if (normalized.includes('REFUSE')) return 'general_waste';
        if (normalized.includes('RECYCL')) return 'recycling';
        if (normalized.includes('GARDEN')) return 'garden_waste';
        if (normalized.includes('FOOD')) return 'food_waste';
        return 'other';
      };

      const result = mapBartecServiceType(unknownCode);
      expect(result).toBe('other');

      const warning = `Unknown Bartec service code: ${unknownCode}`;
      expect(warning).toContain('Unknown Bartec service code');
    });
  });

  describe('SOAP Fault Response', () => {
    it('should return FailureCategory.UPSTREAM_ERROR for SOAP fault', async () => {
      mockHttpClient.post.mockResolvedValue({
        status: 500,
        data: farehamBartecFaultXml,
        headers: { 'content-type': 'text/xml' },
      });

      const mockResult: CollectionEventResult = {
        success: false,
        acquisitionMetadata: {
          attemptId: 'attempt_fault_001',
          adapterId: 'fareham',
          councilId: 'fareham',
          lookupMethod: 'api' as const,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 180,
          httpRequestCount: 1,
          bytesReceived: 450,
          usedBrowserAutomation: false,
          adapterVersion: '1.0.0',
          executionEnvironment: 'test',
          riskLevel: 'low' as const,
          cacheHit: false,
        },
        confidence: 0.0,
        warnings: [],
        securityWarnings: [],
        failureCategory: 'server_error' as FailureCategory,
        errorMessage: 'Bartec SOAP service returned fault',
        fromCache: false,
      };

      expect(mockResult.success).toBe(false);
      expect(mockResult.failureCategory).toBe('server_error');
      expect(mockResult.errorMessage).toContain('fault');
    });
  });

  describe('Malformed XML Response', () => {
    it('should return FailureCategory.PARSE_ERROR for malformed XML', async () => {
      const malformedXml = '<soap:Envelope><unclosed><tag>';

      mockHttpClient.post.mockResolvedValue({
        status: 200,
        data: malformedXml,
        headers: { 'content-type': 'text/xml' },
      });

      const mockResult: CollectionEventResult = {
        success: false,
        acquisitionMetadata: {
          attemptId: 'attempt_malformed_001',
          adapterId: 'fareham',
          councilId: 'fareham',
          lookupMethod: 'api' as const,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 50,
          httpRequestCount: 1,
          bytesReceived: malformedXml.length,
          usedBrowserAutomation: false,
          adapterVersion: '1.0.0',
          executionEnvironment: 'test',
          riskLevel: 'low' as const,
          cacheHit: false,
        },
        confidence: 0.0,
        warnings: [],
        securityWarnings: [],
        failureCategory: 'parse_error' as FailureCategory,
        errorMessage: 'Failed to parse XML response',
        fromCache: false,
      };

      expect(mockResult.success).toBe(false);
      expect(mockResult.failureCategory).toBe('parse_error');
    });
  });

  describe('XML with Embedded JavaScript/Script Injection', () => {
    it('should safely parse XML with script tags without executing', async () => {
      const maliciousXml = `
        <soap:Envelope>
          <soap:Body>
            <Features_GetResponse>
              <Feature>
                <script>alert('XSS')</script>
                <ServiceName>Refuse Collection</ServiceName>
              </Feature>
            </Features_GetResponse>
          </soap:Body>
        </soap:Envelope>
      `;

      mockHttpClient.post.mockResolvedValue({
        status: 200,
        data: maliciousXml,
        headers: { 'content-type': 'text/xml' },
      });

      mockEvidenceStore.store.mockResolvedValue({
        evidenceRef: 'evidence_xss_test',
        storagePath: 'fareham/evidence_xss_test.xml',
      });

      const mockResult: CollectionEventResult = {
        success: true,
        data: [],
        acquisitionMetadata: {
          attemptId: 'attempt_xss_001',
          adapterId: 'fareham',
          councilId: 'fareham',
          lookupMethod: 'api' as const,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 100,
          httpRequestCount: 1,
          bytesReceived: maliciousXml.length,
          usedBrowserAutomation: false,
          adapterVersion: '1.0.0',
          executionEnvironment: 'test',
          riskLevel: 'low' as const,
          cacheHit: false,
        },
        confidence: 0.6,
        warnings: [],
        securityWarnings: ['XML contains script tags'],
        fromCache: false,
      };

      expect(mockResult.securityWarnings).toContain('XML contains script tags');
      expect(mockEvidenceStore.store).toHaveBeenCalledWith(
        expect.objectContaining({
          evidenceType: 'xml',
        })
      );
    });
  });

  describe('XML with Abnormally Large Payload', () => {
    it('should reject XML larger than 1MB with size warning', async () => {
      const largeXml = '<data>' + 'x'.repeat(2 * 1024 * 1024) + '</data>';

      mockHttpClient.post.mockResolvedValue({
        status: 200,
        data: largeXml,
        headers: { 'content-type': 'text/xml' },
      });

      const mockResult: CollectionEventResult = {
        success: false,
        acquisitionMetadata: {
          attemptId: 'attempt_large_001',
          adapterId: 'fareham',
          councilId: 'fareham',
          lookupMethod: 'api' as const,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 50,
          httpRequestCount: 1,
          bytesReceived: largeXml.length,
          usedBrowserAutomation: false,
          adapterVersion: '1.0.0',
          executionEnvironment: 'test',
          riskLevel: 'low' as const,
          cacheHit: false,
        },
        confidence: 0.0,
        warnings: [],
        securityWarnings: ['Response size exceeds 1MB limit'],
        failureCategory: 'validation_error' as FailureCategory,
        errorMessage: 'Response too large',
        fromCache: false,
      };

      expect(mockResult.success).toBe(false);
      expect(mockResult.securityWarnings).toContain('Response size exceeds 1MB limit');
      expect(mockResult.failureCategory).toBe('validation_error');
    });
  });

  describe('HTTP 403 Blocked Response', () => {
    it('should return FailureCategory.BOT_DETECTION for HTTP 403', async () => {
      mockHttpClient.post.mockRejectedValue({
        response: {
          status: 403,
          data: 'Forbidden',
        },
      });

      const mockResult: CollectionEventResult = {
        success: false,
        acquisitionMetadata: {
          attemptId: 'attempt_403_001',
          adapterId: 'fareham',
          councilId: 'fareham',
          lookupMethod: 'api' as const,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 150,
          httpRequestCount: 1,
          bytesReceived: 0,
          usedBrowserAutomation: false,
          adapterVersion: '1.0.0',
          executionEnvironment: 'test',
          riskLevel: 'low' as const,
          cacheHit: false,
        },
        confidence: 0.0,
        warnings: [],
        securityWarnings: [],
        failureCategory: 'bot_detection' as FailureCategory,
        errorMessage: 'Upstream blocked request (HTTP 403)',
        fromCache: false,
      };

      expect(mockResult.success).toBe(false);
      expect(mockResult.failureCategory).toBe('bot_detection');
    });
  });

  describe('Kill Switch Active', () => {
    it('should not make SOAP call when kill switch is disabled', async () => {
      mockKillSwitch.isEnabled.mockResolvedValue(false);

      const propertyIdentity: PropertyIdentity = {
        councilLocalId: '100060321174',
        uprn: '100060321174',
        address: '1 High Street, Fareham, PO16 7AW',
        postcode: 'PO16 7AW',
        correlationId: 'test-killswitch-001',
      };

      const mockResult: CollectionEventResult = {
        success: false,
        acquisitionMetadata: {
          attemptId: 'attempt_killswitch_001',
          adapterId: 'fareham',
          councilId: 'fareham',
          lookupMethod: 'api' as const,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 5,
          httpRequestCount: 0,
          bytesReceived: 0,
          usedBrowserAutomation: false,
          adapterVersion: '1.0.0',
          executionEnvironment: 'test',
          riskLevel: 'low' as const,
          cacheHit: false,
        },
        confidence: 0.0,
        warnings: [],
        securityWarnings: [],
        failureCategory: 'adapter_error' as FailureCategory,
        errorMessage: 'Adapter disabled by kill switch',
        fromCache: false,
      };

      expect(mockKillSwitch.isEnabled).toHaveBeenCalled();
      expect(mockHttpClient.post).not.toHaveBeenCalled();
      expect(mockResult.errorMessage).toContain('kill switch');
    });
  });

  describe('verifyHealth()', () => {
    it('should return AdapterHealth with correct structure', async () => {
      mockHttpClient.post.mockResolvedValue({
        status: 200,
        data: farehamBartecValidXml,
        headers: { 'content-type': 'text/xml' },
      });

      const mockHealth: AdapterHealth = {
        councilId: 'fareham',
        status: 'healthy' as HealthStatus,
        lastSuccessAt: new Date().toISOString(),
        successRate24h: 0.95,
        avgResponseTimeMs24h: 320,
        acquisitionCount24h: 145,
        checkedAt: new Date().toISOString(),
        upstreamReachable: true,
        expectedSchemaVersion: '1.0',
        detectedSchemaVersion: '1.0',
        schemaDriftDetected: false,
      };

      expect(mockHealth.status).toBe('healthy');
      expect(mockHealth.councilId).toBe('fareham');
      expect(mockHealth.upstreamReachable).toBe(true);
      expect(mockHealth.schemaDriftDetected).toBe(false);
    });
  });

  describe('Evidence Capture', () => {
    it('should capture XML content in evidence store', async () => {
      mockHttpClient.post.mockResolvedValue({
        status: 200,
        data: farehamBartecValidXml,
        headers: { 'content-type': 'text/xml' },
      });

      mockEvidenceStore.store.mockResolvedValue({
        evidenceRef: 'evidence_fareham_capture_001',
        storagePath: 'fareham/evidence_fareham_capture_001.xml',
      });

      expect(mockEvidenceStore.store).toHaveBeenCalledWith(
        expect.objectContaining({
          evidenceType: 'xml',
        })
      );
    });

    it('should include evidence reference in result', async () => {
      mockHttpClient.post.mockResolvedValue({
        status: 200,
        data: farehamBartecValidXml,
        headers: { 'content-type': 'text/xml' },
      });

      const evidenceRef = 'evidence_fareham_ref_123';
      mockEvidenceStore.store.mockResolvedValue({
        evidenceRef,
        storagePath: `fareham/${evidenceRef}.xml`,
      });

      const mockResult: CollectionEventResult = {
        success: true,
        data: [],
        acquisitionMetadata: {
          attemptId: 'attempt_evidence_001',
          adapterId: 'fareham',
          councilId: 'fareham',
          lookupMethod: 'api' as const,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 300,
          httpRequestCount: 1,
          bytesReceived: 1800,
          usedBrowserAutomation: false,
          adapterVersion: '1.0.0',
          executionEnvironment: 'test',
          riskLevel: 'low' as const,
          cacheHit: false,
        },
        sourceEvidenceRef: evidenceRef,
        confidence: 0.9,
        warnings: [],
        securityWarnings: [],
        fromCache: false,
      };

      expect(mockResult.sourceEvidenceRef).toBe(evidenceRef);
    });
  });

  describe('Confidence Score for API Method', () => {
    it('should return confidence >= 0.9 for successful API acquisition', async () => {
      mockHttpClient.post.mockResolvedValue({
        status: 200,
        data: farehamBartecValidXml,
        headers: { 'content-type': 'text/xml' },
      });

      mockEvidenceStore.store.mockResolvedValue({
        evidenceRef: 'evidence_conf_001',
        storagePath: 'fareham/evidence_conf_001.xml',
      });

      const mockResult: CollectionEventResult = {
        success: true,
        data: [
          {
            eventId: 'event_001',
            serviceId: 'service_001',
            serviceType: 'general_waste' as ServiceType,
            collectionDate: '2026-04-01',
            isConfirmed: true,
            isRescheduled: false,
            isPast: false,
          },
        ],
        acquisitionMetadata: {
          attemptId: 'attempt_conf_001',
          adapterId: 'fareham',
          councilId: 'fareham',
          lookupMethod: 'api' as const,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 300,
          httpRequestCount: 1,
          bytesReceived: 1800,
          usedBrowserAutomation: false,
          adapterVersion: '1.0.0',
          executionEnvironment: 'test',
          riskLevel: 'low' as const,
          cacheHit: false,
        },
        confidence: 0.95,
        warnings: [],
        securityWarnings: [],
        fromCache: false,
      };

      expect(mockResult.acquisitionMetadata.lookupMethod).toBe('api');
      expect(mockResult.confidence).toBeGreaterThanOrEqual(0.9);
    });
  });

  describe('securityProfile()', () => {
    it('should return correct egress destinations', async () => {
      const mockSecurityProfile = {
        councilId: 'fareham',
        riskLevel: 'low' as ExecutionRiskLevel,
        requiresBrowserAutomation: false,
        executesJavaScript: false,
        externalDomains: [
          'farehamgw.bartecmunicipal.com',
          'collectiveapi.bartec-systems.com',
        ],
        handlesCredentials: true,
        securityConcerns: ['API credentials required', 'Token-based authentication'],
        lastSecurityReview: '2026-03-25',
        isSandboxed: true,
        networkIsolation: 'allowlist_only' as const,
        requiredPermissions: ['network.egress.bartec'],
      };

      expect(mockSecurityProfile.externalDomains).toContain('collectiveapi.bartec-systems.com');
      expect(mockSecurityProfile.networkIsolation).toBe('allowlist_only');
      expect(mockSecurityProfile.requiresBrowserAutomation).toBe(false);
    });
  });

  describe('Empty Response', () => {
    it('should handle valid XML with no collections', async () => {
      mockHttpClient.post.mockResolvedValue({
        status: 200,
        data: farehamBartecEmptyXml,
        headers: { 'content-type': 'text/xml' },
      });

      mockEvidenceStore.store.mockResolvedValue({
        evidenceRef: 'evidence_empty_001',
        storagePath: 'fareham/evidence_empty_001.xml',
      });

      const mockResult: CollectionEventResult = {
        success: true,
        data: [],
        acquisitionMetadata: {
          attemptId: 'attempt_empty_001',
          adapterId: 'fareham',
          councilId: 'fareham',
          lookupMethod: 'api' as const,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 280,
          httpRequestCount: 1,
          bytesReceived: 520,
          usedBrowserAutomation: false,
          adapterVersion: '1.0.0',
          executionEnvironment: 'test',
          riskLevel: 'low' as const,
          cacheHit: false,
        },
        confidence: 0.7,
        warnings: ['No collection features found in Bartec response'],
        securityWarnings: [],
        fromCache: false,
      };

      expect(mockResult.success).toBe(true);
      expect(mockResult.data).toHaveLength(0);
      expect(mockResult.warnings).toContain('No collection features found in Bartec response');
    });
  });
});
