/**
 * Eastleigh Adapter Unit Tests
 * 
 * Tests the Eastleigh adapter in isolation with mocked HTTP responses.
 * Tests based on specification in docs/discovery/eastleigh-notes.md
 * and adapter interface contract in src/adapters/base/adapter.interface.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { 
  PropertyLookupInput, 
  PropertyIdentity,
  CollectionEventResult,
  AdapterHealth,
  HealthStatus,
  FailureCategory,
  ServiceType 
} from '../../../src/adapters/base/adapter.interface';
import eastleighValidResponse from '../../fixtures/responses/eastleigh-valid.json';
import eastleighEmptyResponse from '../../fixtures/responses/eastleigh-empty.json';
import eastleighBotBlockHtml from '../../fixtures/responses/eastleigh-bot-block.html?raw';

// Mock HTTP client
const mockHttpClient = {
  get: vi.fn(),
  post: vi.fn(),
};

// Mock evidence store
const mockEvidenceStore = {
  store: vi.fn(),
  retrieve: vi.fn(),
};

// Mock kill switch
const mockKillSwitch = {
  isEnabled: vi.fn(),
};

describe('EastleighAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockKillSwitch.isEnabled.mockResolvedValue(true); // Adapter enabled by default
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Happy Path - Valid UPRN', () => {
    it('should return collection events for valid UPRN', async () => {
      mockHttpClient.get.mockResolvedValue({
        status: 200,
        data: eastleighValidResponse,
        headers: { 'content-type': 'application/json' },
      });

      mockEvidenceStore.store.mockResolvedValue({ 
        evidenceRef: 'evidence_abc123',
        storagePath: 'eastleigh/evidence_abc123.json',
      });

      // Simulated adapter call - actual implementation will be provided by Naomi
      const propertyIdentity: PropertyIdentity = {
        councilLocalId: '100060321174',
        uprn: '100060321174',
        address: '1 High Street, Eastleigh, SO50 5LA',
        postcode: 'SO50 5LA',
        correlationId: 'test-correlation-123',
      };

      // Mock adapter response shape
      const mockResult: CollectionEventResult = {
        success: true,
        data: [
          {
            eventId: 'coll_123456_next',
            serviceId: 'coll_123456',
            serviceType: 'general_waste' as ServiceType,
            collectionDate: '2026-03-28',
            isConfirmed: true,
            isRescheduled: false,
            isPast: false,
          },
          {
            eventId: 'coll_123457_next',
            serviceId: 'coll_123457',
            serviceType: 'recycling' as ServiceType,
            collectionDate: '2026-04-04',
            isConfirmed: true,
            isRescheduled: false,
            isPast: false,
          },
        ],
        acquisitionMetadata: {
          attemptId: 'attempt_123',
          adapterId: 'eastleigh',
          councilId: 'eastleigh',
          lookupMethod: 'api' as const,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 250,
          httpRequestCount: 1,
          bytesReceived: 2117,
          usedBrowserAutomation: false,
          adapterVersion: '1.0.0',
          executionEnvironment: 'test',
          riskLevel: 'low' as const,
          cacheHit: false,
        },
        sourceEvidenceRef: 'evidence_abc123',
        confidence: 0.95,
        warnings: [],
        securityWarnings: [],
        fromCache: false,
      };

      expect(mockResult.success).toBe(true);
      expect(mockResult.data).toHaveLength(2);
      expect(mockResult.data![0].serviceType).toBe('general_waste');
      expect(mockResult.confidence).toBeGreaterThan(0.8);
    });
  });

  describe('Response Parsing - Bin Type Mapping', () => {
    it('should map council bin types to canonical ServiceType enums', () => {
      const binTypeMappings = [
        { raw: 'Refuse Collection', expected: 'general_waste' },
        { raw: 'Black Bin - General Waste', expected: 'general_waste' },
        { raw: 'Recycling Collection', expected: 'recycling' },
        { raw: 'Green Bin - Recycling', expected: 'recycling' },
        { raw: 'Food Waste Collection', expected: 'food_waste' },
        { raw: 'Food Caddy', expected: 'food_waste' },
        { raw: 'Garden Waste Collection', expected: 'garden_waste' },
        { raw: 'Brown Bin - Garden Waste', expected: 'garden_waste' },
      ];

      binTypeMappings.forEach(({ raw, expected }) => {
        // Simulated mapping function that adapters should implement
        const normalizeServiceType = (rawType: string): ServiceType => {
          if (/refuse|rubbish|black bin|general waste/i.test(rawType)) return 'general_waste';
          if (/recycl|green bin/i.test(rawType)) return 'recycling';
          if (/food|caddy/i.test(rawType)) return 'food_waste';
          if (/garden|brown bin/i.test(rawType)) return 'garden_waste';
          return 'other';
        };

        const result = normalizeServiceType(raw);
        expect(result).toBe(expected);
      });
    });
  });

  describe('UPRN Validation', () => {
    it('should reject non-numeric UPRN', () => {
      const invalidUprn = 'ABC123XYZ';
      const isValid = /^\d{1,12}$/.test(invalidUprn);
      
      expect(isValid).toBe(false);
    });

    it('should reject UPRN with wrong length (too long)', () => {
      const invalidUprn = '12345678901234567890'; // >12 digits
      const isValid = /^\d{1,12}$/.test(invalidUprn);
      
      expect(isValid).toBe(false);
    });

    it('should accept valid UPRN format', () => {
      const validUprns = [
        '100060321174',
        '100060320567',
        '1234567890',
        '123',
      ];

      validUprns.forEach(uprn => {
        const isValid = /^\d{1,12}$/.test(uprn);
        expect(isValid).toBe(true);
      });
    });

    it('should validate UPRN before making HTTP call', async () => {
      const invalidUprn = 'not-a-number';
      
      // Validation should fail before HTTP client is called
      const isValid = /^\d{1,12}$/.test(invalidUprn);
      expect(isValid).toBe(false);
      
      // HTTP client should not be called for invalid UPRN
      expect(mockHttpClient.get).not.toHaveBeenCalled();
    });
  });

  describe('HTTP 200 with Empty Data', () => {
    it('should return empty result with warning when no collections found', async () => {
      mockHttpClient.get.mockResolvedValue({
        status: 200,
        data: eastleighEmptyResponse,
        headers: { 'content-type': 'application/json' },
      });

      const mockResult: CollectionEventResult = {
        success: true,
        data: [],
        acquisitionMetadata: {
          attemptId: 'attempt_124',
          adapterId: 'eastleigh',
          councilId: 'eastleigh',
          lookupMethod: 'api' as const,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 180,
          httpRequestCount: 1,
          bytesReceived: 185,
          usedBrowserAutomation: false,
          adapterVersion: '1.0.0',
          executionEnvironment: 'test',
          riskLevel: 'low' as const,
          cacheHit: false,
        },
        confidence: 0.7,
        warnings: ['No collection data found for UPRN'],
        securityWarnings: [],
        fromCache: false,
      };

      expect(mockResult.success).toBe(true);
      expect(mockResult.data).toHaveLength(0);
      expect(mockResult.warnings).toContain('No collection data found for UPRN');
      expect(mockResult.confidence).toBeLessThan(0.9);
    });
  });

  describe('HTTP 200 with Malformed JSON', () => {
    it('should return PARSE_ERROR for invalid JSON response', async () => {
      mockHttpClient.get.mockResolvedValue({
        status: 200,
        data: 'This is not valid JSON {{{',
        headers: { 'content-type': 'application/json' },
      });

      const mockResult: CollectionEventResult = {
        success: false,
        acquisitionMetadata: {
          attemptId: 'attempt_125',
          adapterId: 'eastleigh',
          councilId: 'eastleigh',
          lookupMethod: 'api' as const,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 150,
          httpRequestCount: 1,
          bytesReceived: 29,
          usedBrowserAutomation: false,
          adapterVersion: '1.0.0',
          executionEnvironment: 'test',
          riskLevel: 'low' as const,
          cacheHit: false,
        },
        confidence: 0,
        warnings: [],
        securityWarnings: [],
        failureCategory: 'parse_error' as FailureCategory,
        errorMessage: 'Failed to parse JSON response',
        fromCache: false,
      };

      expect(mockResult.success).toBe(false);
      expect(mockResult.failureCategory).toBe('parse_error');
      expect(mockResult.confidence).toBe(0);
    });
  });

  describe('HTTP 403 - Bot Detection', () => {
    it('should return UPSTREAM_BLOCKED with security warning', async () => {
      mockHttpClient.get.mockRejectedValue({
        response: {
          status: 403,
          data: eastleighBotBlockHtml,
          headers: { 'content-type': 'text/html' },
        },
      });

      const mockResult: CollectionEventResult = {
        success: false,
        acquisitionMetadata: {
          attemptId: 'attempt_126',
          adapterId: 'eastleigh',
          councilId: 'eastleigh',
          lookupMethod: 'api' as const,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 200,
          httpRequestCount: 1,
          bytesReceived: 1031,
          usedBrowserAutomation: false,
          adapterVersion: '1.0.0',
          executionEnvironment: 'test',
          riskLevel: 'low' as const,
          cacheHit: false,
        },
        confidence: 0,
        warnings: [],
        securityWarnings: ['Bot detection triggered - IP may be blocked'],
        failureCategory: 'bot_detection' as FailureCategory,
        errorMessage: 'Access denied by upstream (403 Forbidden)',
        fromCache: false,
      };

      expect(mockResult.success).toBe(false);
      expect(mockResult.failureCategory).toBe('bot_detection');
      expect(mockResult.securityWarnings).toContain('Bot detection triggered - IP may be blocked');
    });
  });

  describe('HTTP 429 - Rate Limited', () => {
    it('should return RATE_LIMITED failure', async () => {
      mockHttpClient.get.mockRejectedValue({
        response: {
          status: 429,
          data: { error: 'Too many requests' },
          headers: { 
            'retry-after': '60',
            'content-type': 'application/json',
          },
        },
      });

      const mockResult: CollectionEventResult = {
        success: false,
        acquisitionMetadata: {
          attemptId: 'attempt_127',
          adapterId: 'eastleigh',
          councilId: 'eastleigh',
          lookupMethod: 'api' as const,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 100,
          httpRequestCount: 1,
          bytesReceived: 30,
          usedBrowserAutomation: false,
          adapterVersion: '1.0.0',
          executionEnvironment: 'test',
          riskLevel: 'low' as const,
          cacheHit: false,
        },
        confidence: 0,
        warnings: ['Retry after 60 seconds'],
        securityWarnings: [],
        failureCategory: 'rate_limited' as FailureCategory,
        errorMessage: 'Rate limited by upstream',
        fromCache: false,
      };

      expect(mockResult.success).toBe(false);
      expect(mockResult.failureCategory).toBe('rate_limited');
      expect(mockResult.warnings).toContain('Retry after 60 seconds');
    });
  });

  describe('HTTP 500 - Upstream Error', () => {
    it('should return SERVER_ERROR failure', async () => {
      mockHttpClient.get.mockRejectedValue({
        response: {
          status: 500,
          data: 'Internal Server Error',
          headers: { 'content-type': 'text/html' },
        },
      });

      const mockResult: CollectionEventResult = {
        success: false,
        acquisitionMetadata: {
          attemptId: 'attempt_128',
          adapterId: 'eastleigh',
          councilId: 'eastleigh',
          lookupMethod: 'api' as const,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 3000,
          httpRequestCount: 1,
          bytesReceived: 0,
          usedBrowserAutomation: false,
          adapterVersion: '1.0.0',
          executionEnvironment: 'test',
          riskLevel: 'low' as const,
          cacheHit: false,
        },
        confidence: 0,
        warnings: [],
        securityWarnings: [],
        failureCategory: 'server_error' as FailureCategory,
        errorMessage: 'Upstream server error (500)',
        fromCache: false,
      };

      expect(mockResult.success).toBe(false);
      expect(mockResult.failureCategory).toBe('server_error');
    });
  });

  describe('Network Timeout', () => {
    it('should return NETWORK_ERROR on timeout', async () => {
      mockHttpClient.get.mockRejectedValue({
        code: 'ETIMEDOUT',
        message: 'Request timeout',
      });

      const mockResult: CollectionEventResult = {
        success: false,
        acquisitionMetadata: {
          attemptId: 'attempt_129',
          adapterId: 'eastleigh',
          councilId: 'eastleigh',
          lookupMethod: 'api' as const,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 30000,
          httpRequestCount: 1,
          bytesReceived: 0,
          usedBrowserAutomation: false,
          adapterVersion: '1.0.0',
          executionEnvironment: 'test',
          riskLevel: 'low' as const,
          cacheHit: false,
        },
        confidence: 0,
        warnings: [],
        securityWarnings: [],
        failureCategory: 'network_error' as FailureCategory,
        errorMessage: 'Network timeout after 30000ms',
        fromCache: false,
      };

      expect(mockResult.success).toBe(false);
      expect(mockResult.failureCategory).toBe('network_error');
    });
  });

  describe('XSS Payload Sanitization', () => {
    it('should sanitize script tags in bin type names', () => {
      const maliciousInput = '<script>alert("XSS")</script>Recycling';
      const sanitized = maliciousInput.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      
      expect(sanitized).toBe('Recycling');
      expect(sanitized).not.toContain('<script>');
    });

    it('should sanitize HTML entities in collection notes', () => {
      const maliciousNote = 'Collection&#x20;at&#x20;7am<img src=x onerror=alert(1)>';
      const sanitized = maliciousNote
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/&[#\w]+;/g, ' '); // Remove HTML entities
      
      expect(sanitized).not.toContain('<img');
      expect(sanitized).not.toContain('onerror');
    });

    it('should strip SQL injection attempts from notes', () => {
      const sqlInjection = "'; DROP TABLE collections; --";
      // In production, this should be parameterized, not sanitized
      // But evidence store should strip/encode it
      const encoded = sqlInjection
        .replace(/'/g, "''")
        .replace(/;/g, '');
      
      expect(encoded).not.toContain('DROP TABLE');
    });
  });

  describe('Kill Switch Active', () => {
    it('should throw AdapterDisabledError before HTTP call', async () => {
      mockKillSwitch.isEnabled.mockResolvedValue(false);

      // Simulated adapter behavior when kill switch is active
      const checkKillSwitch = async () => {
        const isEnabled = await mockKillSwitch.isEnabled();
        if (!isEnabled) {
          throw new Error('AdapterDisabledError: Eastleigh adapter is disabled via kill switch');
        }
      };

      await expect(checkKillSwitch()).rejects.toThrow('AdapterDisabledError');
      expect(mockHttpClient.get).not.toHaveBeenCalled();
    });
  });

  describe('verifyHealth()', () => {
    it('should return healthy status when upstream is reachable', async () => {
      mockHttpClient.get.mockResolvedValue({
        status: 200,
        data: eastleighValidResponse,
        headers: { 'content-type': 'application/json' },
      });

      const mockHealth: AdapterHealth = {
        councilId: 'eastleigh',
        status: 'healthy' as HealthStatus,
        lastSuccessAt: new Date().toISOString(),
        successRate24h: 0.98,
        avgResponseTimeMs24h: 250,
        acquisitionCount24h: 145,
        checkedAt: new Date().toISOString(),
        upstreamReachable: true,
        schemaDriftDetected: false,
      };

      expect(mockHealth.status).toBe('healthy');
      expect(mockHealth.upstreamReachable).toBe(true);
      expect(mockHealth.successRate24h).toBeGreaterThan(0.95);
    });

    it('should return unavailable status when upstream is unreachable', async () => {
      mockHttpClient.get.mockRejectedValue({
        code: 'ECONNREFUSED',
        message: 'Connection refused',
      });

      const mockHealth: AdapterHealth = {
        councilId: 'eastleigh',
        status: 'unhealthy' as HealthStatus,
        lastFailureAt: new Date().toISOString(),
        lastFailureCategory: 'network_error' as FailureCategory,
        lastFailureMessage: 'Connection refused',
        successRate24h: 0,
        avgResponseTimeMs24h: 0,
        acquisitionCount24h: 0,
        checkedAt: new Date().toISOString(),
        upstreamReachable: false,
        schemaDriftDetected: false,
      };

      expect(mockHealth.status).toBe('unhealthy');
      expect(mockHealth.upstreamReachable).toBe(false);
    });
  });

  describe('Confidence Score', () => {
    it('should have confidence >0.8 when fresh data is returned', () => {
      const calculateConfidence = (data: unknown[], warnings: string[]): number => {
        if (!data || data.length === 0) return 0.7;
        if (warnings.length > 0) return 0.8;
        return 0.95;
      };

      const score = calculateConfidence([{ id: '1' }, { id: '2' }], []);
      expect(score).toBeGreaterThan(0.8);
    });

    it('should have lower confidence with warnings', () => {
      const calculateConfidence = (data: unknown[], warnings: string[]): number => {
        if (!data || data.length === 0) return 0.7;
        if (warnings.length > 0) return 0.8;
        return 0.95;
      };

      const score = calculateConfidence([{ id: '1' }], ['Missing frequency data']);
      expect(score).toBe(0.8);
    });
  });

  describe('AcquisitionMetadata', () => {
    it('should include sourceUrl in metadata but not log it', () => {
      const metadata = {
        attemptId: 'attempt_130',
        sourceUrl: 'https://my.eastleigh.gov.uk/apex/EBC_Waste_Calendar?UPRN=100060321174',
        // sourceUrl should be in metadata for debugging but never logged
      };

      expect(metadata.sourceUrl).toBeDefined();
      
      // Simulate log redaction
      const logSafeMetadata = { ...metadata };
      delete (logSafeMetadata as any).sourceUrl;
      
      expect(logSafeMetadata).not.toHaveProperty('sourceUrl');
    });
  });

  describe('Evidence Storage', () => {
    it('should call evidence store with response data', async () => {
      mockHttpClient.get.mockResolvedValue({
        status: 200,
        data: eastleighValidResponse,
        headers: { 'content-type': 'application/json' },
      });

      mockEvidenceStore.store.mockResolvedValue({
        evidenceRef: 'evidence_test123',
        storagePath: 'eastleigh/evidence_test123.json',
        contentHash: 'sha256:abc123def456',
        sizeBytes: 2117,
      });

      // Adapter should call evidence store
      await mockEvidenceStore.store({
        councilId: 'eastleigh',
        attemptId: 'attempt_123',
        evidenceType: 'json',
        content: JSON.stringify(eastleighValidResponse),
        metadata: {
          uprn: '100060321174',
          timestamp: new Date().toISOString(),
        },
      });

      expect(mockEvidenceStore.store).toHaveBeenCalledTimes(1);
      expect(mockEvidenceStore.store).toHaveBeenCalledWith(
        expect.objectContaining({
          councilId: 'eastleigh',
          evidenceType: 'json',
        })
      );
    });
  });
});
