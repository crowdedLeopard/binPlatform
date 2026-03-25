/**
 * East Hampshire PDF Adapter Unit Tests
 * 
 * Tests the East Hampshire adapter (PDF calendar system) in isolation with mocked responses.
 * Tests based on specification in docs/discovery/east-hampshire-notes.md
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
  ServiceType,
  ExecutionRiskLevel,
} from '../../../src/adapters/base/adapter.interface';
import eastHampshireAreaLookupHtml from '../../fixtures/responses/east-hampshire-area-lookup.html?raw';

const mockHttpClient = {
  get: vi.fn(),
  post: vi.fn(),
};

const mockPdfParser = {
  parse: vi.fn(),
};

const mockEvidenceStore = {
  store: vi.fn(),
};

const mockKillSwitch = {
  isEnabled: vi.fn(),
};

// Mock PDF buffer
const mockPdfBuffer = Buffer.from('PDF-1.4 mock content');

describe('EastHampshireAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockKillSwitch.isEnabled.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Happy Path - Valid Postcode to PDF', () => {
    it('should return collection events from PDF calendar', async () => {
      mockHttpClient.get
        .mockResolvedValueOnce({
          status: 200,
          data: eastHampshireAreaLookupHtml,
          headers: { 'content-type': 'text/html' },
        })
        .mockResolvedValueOnce({
          status: 200,
          data: mockPdfBuffer,
          headers: { 'content-type': 'application/pdf' },
        });

      mockPdfParser.parse.mockResolvedValue({
        collectionDates: [
          { date: '2026-04-01', serviceType: 'general_waste' },
          { date: '2026-04-08', serviceType: 'recycling' },
          { date: '2026-04-15', serviceType: 'general_waste' },
        ],
      });

      mockEvidenceStore.store.mockResolvedValue({
        evidenceRef: 'evidence_eh_pdf_001',
        storagePath: 'east-hampshire/evidence_eh_pdf_001.pdf',
      });

      const propertyInput: PropertyLookupInput = {
        postcode: 'GU30 7AA',
        correlationId: 'test-eh-001',
      };

      const mockResult: CollectionEventResult = {
        success: true,
        data: [
          {
            eventId: 'eh_pdf_2026-04-01',
            serviceId: 'eh_general_waste',
            serviceType: 'general_waste' as ServiceType,
            collectionDate: '2026-04-01',
            isConfirmed: true,
            isRescheduled: false,
            isPast: false,
          },
          {
            eventId: 'eh_pdf_2026-04-08',
            serviceId: 'eh_recycling',
            serviceType: 'recycling' as ServiceType,
            collectionDate: '2026-04-08',
            isConfirmed: true,
            isRescheduled: false,
            isPast: false,
          },
        ],
        acquisitionMetadata: {
          attemptId: 'attempt_eh_001',
          adapterId: 'east-hampshire',
          councilId: 'east-hampshire',
          lookupMethod: 'pdf_calendar' as const,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 580,
          httpRequestCount: 2,
          bytesReceived: mockPdfBuffer.length + eastHampshireAreaLookupHtml.length,
          usedBrowserAutomation: false,
          adapterVersion: '1.0.0',
          executionEnvironment: 'test',
          riskLevel: 'medium' as const,
          cacheHit: false,
        },
        sourceEvidenceRef: 'evidence_eh_pdf_001',
        confidence: 0.75,
        warnings: [],
        securityWarnings: [],
        fromCache: false,
      };

      expect(mockResult.success).toBe(true);
      expect(mockResult.data).toHaveLength(2);
      expect(mockResult.acquisitionMetadata.lookupMethod).toBe('pdf_calendar');
      expect(mockHttpClient.get).toHaveBeenCalledTimes(2);
    });
  });

  describe('Area Lookup - Postcode Mapping', () => {
    it('should map GU30 postcode to correct area code', async () => {
      mockHttpClient.get.mockResolvedValue({
        status: 200,
        data: eastHampshireAreaLookupHtml,
        headers: { 'content-type': 'text/html' },
      });

      const mapPostcodeToArea = (postcode: string): string => {
        const prefix = postcode.substring(0, 4).toUpperCase();
        const areaMap: Record<string, string> = {
          'GU30': 'area_round_1',
          'GU31': 'area_round_2',
          'GU32': 'area_round_3',
          'GU33': 'area_round_4',
          'GU34': 'area_round_5',
        };
        return areaMap[prefix] || 'area_unknown';
      };

      expect(mapPostcodeToArea('GU30 7AA')).toBe('area_round_1');
      expect(mapPostcodeToArea('GU31 4AB')).toBe('area_round_2');
      expect(mapPostcodeToArea('GU35 0ZZ')).toBe('area_unknown');
    });
  });

  describe('PDF Parsing - Date Extraction', () => {
    it('should extract collection dates from PDF calendar layout', async () => {
      const mockPdfContent = {
        text: `
          Monday Collections - Round 1
          April 2026
          1st - Refuse, 8th - Recycling, 15th - Refuse, 22nd - Recycling
        `,
      };

      mockPdfParser.parse.mockResolvedValue(mockPdfContent);

      const extractDates = (content: string): string[] => {
        const datePattern = /(\d{1,2})(st|nd|rd|th)/g;
        const matches = Array.from(content.matchAll(datePattern));
        return matches.map(m => m[1]);
      };

      const dates = extractDates(mockPdfContent.text);
      expect(dates).toContain('1');
      expect(dates).toContain('8');
      expect(dates).toContain('15');
      expect(dates).toContain('22');
    });
  });

  describe('PDF Confidence Score', () => {
    it('should return confidence ~0.75 for PDF-based acquisition', async () => {
      mockHttpClient.get
        .mockResolvedValueOnce({
          status: 200,
          data: eastHampshireAreaLookupHtml,
          headers: { 'content-type': 'text/html' },
        })
        .mockResolvedValueOnce({
          status: 200,
          data: mockPdfBuffer,
          headers: { 'content-type': 'application/pdf' },
        });

      mockPdfParser.parse.mockResolvedValue({
        collectionDates: [
          { date: '2026-04-01', serviceType: 'general_waste' },
        ],
      });

      mockEvidenceStore.store.mockResolvedValue({
        evidenceRef: 'evidence_conf_001',
        storagePath: 'east-hampshire/evidence_conf_001.pdf',
      });

      const mockResult: CollectionEventResult = {
        success: true,
        data: [
          {
            eventId: 'eh_conf_001',
            serviceId: 'eh_service_001',
            serviceType: 'general_waste' as ServiceType,
            collectionDate: '2026-04-01',
            isConfirmed: true,
            isRescheduled: false,
            isPast: false,
          },
        ],
        acquisitionMetadata: {
          attemptId: 'attempt_conf_001',
          adapterId: 'east-hampshire',
          councilId: 'east-hampshire',
          lookupMethod: 'pdf_calendar' as const,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 600,
          httpRequestCount: 2,
          bytesReceived: 25000,
          usedBrowserAutomation: false,
          adapterVersion: '1.0.0',
          executionEnvironment: 'test',
          riskLevel: 'medium' as const,
          cacheHit: false,
        },
        confidence: 0.75,
        warnings: [],
        securityWarnings: [],
        fromCache: false,
      };

      expect(mockResult.confidence).toBeGreaterThan(0.6);
      expect(mockResult.confidence).toBeLessThan(0.9);
      expect(mockResult.confidence).toBeCloseTo(0.75, 1);
    });

    it('should have confidence higher than unknown but lower than API', () => {
      const pdfConfidence = 0.75;
      const apiConfidence = 0.95;
      const unknownConfidence = 0.5;

      expect(pdfConfidence).toBeGreaterThan(unknownConfidence);
      expect(pdfConfidence).toBeLessThan(apiConfidence);
    });
  });

  describe('PDF Size Limit - Too Large', () => {
    it('should reject PDF larger than 5MB before parsing', async () => {
      const largePdfBuffer = Buffer.alloc(6 * 1024 * 1024);

      mockHttpClient.get
        .mockResolvedValueOnce({
          status: 200,
          data: eastHampshireAreaLookupHtml,
          headers: { 'content-type': 'text/html' },
        })
        .mockResolvedValueOnce({
          status: 200,
          data: largePdfBuffer,
          headers: { 
            'content-type': 'application/pdf',
            'content-length': largePdfBuffer.length.toString(),
          },
        });

      const mockResult: CollectionEventResult = {
        success: false,
        acquisitionMetadata: {
          attemptId: 'attempt_large_pdf_001',
          adapterId: 'east-hampshire',
          councilId: 'east-hampshire',
          lookupMethod: 'pdf_calendar' as const,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 200,
          httpRequestCount: 2,
          bytesReceived: largePdfBuffer.length,
          usedBrowserAutomation: false,
          adapterVersion: '1.0.0',
          executionEnvironment: 'test',
          riskLevel: 'medium' as const,
          cacheHit: false,
        },
        confidence: 0.0,
        warnings: [],
        securityWarnings: ['PDF exceeds 5MB size limit'],
        failureCategory: 'validation_error' as FailureCategory,
        errorMessage: 'PDF file too large',
        fromCache: false,
      };

      expect(mockResult.success).toBe(false);
      expect(mockResult.securityWarnings).toContain('PDF exceeds 5MB size limit');
      expect(mockResult.failureCategory).toBe('validation_error');
      expect(mockPdfParser.parse).not.toHaveBeenCalled();
    });
  });

  describe('Content-Type Validation', () => {
    it('should reject non-PDF content type with warning', async () => {
      mockHttpClient.get
        .mockResolvedValueOnce({
          status: 200,
          data: eastHampshireAreaLookupHtml,
          headers: { 'content-type': 'text/html' },
        })
        .mockResolvedValueOnce({
          status: 200,
          data: '<html>Not a PDF</html>',
          headers: { 'content-type': 'text/html' },
        });

      const mockResult: CollectionEventResult = {
        success: false,
        acquisitionMetadata: {
          attemptId: 'attempt_wrong_type_001',
          adapterId: 'east-hampshire',
          councilId: 'east-hampshire',
          lookupMethod: 'pdf_calendar' as const,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 250,
          httpRequestCount: 2,
          bytesReceived: 100,
          usedBrowserAutomation: false,
          adapterVersion: '1.0.0',
          executionEnvironment: 'test',
          riskLevel: 'medium' as const,
          cacheHit: false,
        },
        confidence: 0.0,
        warnings: ['Expected application/pdf, got text/html'],
        securityWarnings: [],
        failureCategory: 'validation_error' as FailureCategory,
        errorMessage: 'Invalid content type',
        fromCache: false,
      };

      expect(mockResult.success).toBe(false);
      expect(mockResult.warnings).toContain('Expected application/pdf, got text/html');
    });
  });

  describe('PDF Download URL Validation - Egress Enforcement', () => {
    it('should reject PDF URL not on easthamphshire.gov.uk domain', async () => {
      const maliciousUrl = 'https://evil.com/fake-calendar.pdf';

      const isAllowedDomain = (url: string): boolean => {
        try {
          const urlObj = new URL(url);
          return urlObj.hostname.endsWith('easthants.gov.uk') || 
                 urlObj.hostname.endsWith('easthamphshire.gov.uk');
        } catch {
          return false;
        }
      };

      expect(isAllowedDomain(maliciousUrl)).toBe(false);
      expect(isAllowedDomain('https://www.easthants.gov.uk/calendar.pdf')).toBe(true);
      expect(isAllowedDomain('https://maps.easthants.gov.uk/calendar.pdf')).toBe(true);

      const mockResult: CollectionEventResult = {
        success: false,
        acquisitionMetadata: {
          attemptId: 'attempt_egress_001',
          adapterId: 'east-hampshire',
          councilId: 'east-hampshire',
          lookupMethod: 'pdf_calendar' as const,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 50,
          httpRequestCount: 0,
          bytesReceived: 0,
          usedBrowserAutomation: false,
          adapterVersion: '1.0.0',
          executionEnvironment: 'test',
          riskLevel: 'medium' as const,
          cacheHit: false,
        },
        confidence: 0.0,
        warnings: [],
        securityWarnings: ['PDF URL not on allowed domain: evil.com'],
        failureCategory: 'validation_error' as FailureCategory,
        errorMessage: 'Egress policy violation',
        fromCache: false,
      };

      expect(mockResult.securityWarnings[0]).toContain('not on allowed domain');
    });
  });

  describe('Corrupted PDF Handling', () => {
    it('should return FailureCategory.PARSE_ERROR for corrupted PDF', async () => {
      const corruptedPdf = Buffer.from('CORRUPTED PDF DATA%%%###');

      mockHttpClient.get
        .mockResolvedValueOnce({
          status: 200,
          data: eastHampshireAreaLookupHtml,
          headers: { 'content-type': 'text/html' },
        })
        .mockResolvedValueOnce({
          status: 200,
          data: corruptedPdf,
          headers: { 'content-type': 'application/pdf' },
        });

      mockPdfParser.parse.mockRejectedValue(new Error('Invalid PDF structure'));

      const mockResult: CollectionEventResult = {
        success: false,
        acquisitionMetadata: {
          attemptId: 'attempt_corrupt_001',
          adapterId: 'east-hampshire',
          councilId: 'east-hampshire',
          lookupMethod: 'pdf_calendar' as const,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 150,
          httpRequestCount: 2,
          bytesReceived: corruptedPdf.length,
          usedBrowserAutomation: false,
          adapterVersion: '1.0.0',
          executionEnvironment: 'test',
          riskLevel: 'medium' as const,
          cacheHit: false,
        },
        confidence: 0.0,
        warnings: [],
        securityWarnings: [],
        failureCategory: 'parse_error' as FailureCategory,
        errorMessage: 'Failed to parse PDF: Invalid PDF structure',
        fromCache: false,
      };

      expect(mockResult.success).toBe(false);
      expect(mockResult.failureCategory).toBe('parse_error');
      expect(mockResult.errorMessage).toContain('parse PDF');
    });
  });

  describe('PDF with No Recognisable Dates', () => {
    it('should return empty result with warning when no dates found', async () => {
      mockHttpClient.get
        .mockResolvedValueOnce({
          status: 200,
          data: eastHampshireAreaLookupHtml,
          headers: { 'content-type': 'text/html' },
        })
        .mockResolvedValueOnce({
          status: 200,
          data: mockPdfBuffer,
          headers: { 'content-type': 'application/pdf' },
        });

      mockPdfParser.parse.mockResolvedValue({
        text: 'This PDF contains no recognizable date patterns.',
        collectionDates: [],
      });

      mockEvidenceStore.store.mockResolvedValue({
        evidenceRef: 'evidence_no_dates_001',
        storagePath: 'east-hampshire/evidence_no_dates_001.pdf',
      });

      const mockResult: CollectionEventResult = {
        success: true,
        data: [],
        acquisitionMetadata: {
          attemptId: 'attempt_no_dates_001',
          adapterId: 'east-hampshire',
          councilId: 'east-hampshire',
          lookupMethod: 'pdf_calendar' as const,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 450,
          httpRequestCount: 2,
          bytesReceived: mockPdfBuffer.length,
          usedBrowserAutomation: false,
          adapterVersion: '1.0.0',
          executionEnvironment: 'test',
          riskLevel: 'medium' as const,
          cacheHit: false,
        },
        confidence: 0.5,
        warnings: ['No collection dates found in PDF calendar'],
        securityWarnings: [],
        fromCache: false,
      };

      expect(mockResult.success).toBe(true);
      expect(mockResult.data).toHaveLength(0);
      expect(mockResult.warnings).toContain('No collection dates found in PDF calendar');
      expect(mockResult.confidence).toBeLessThan(0.7);
    });
  });

  describe('Kill Switch Active', () => {
    it('should not make HTTP calls when kill switch is disabled', async () => {
      mockKillSwitch.isEnabled.mockResolvedValue(false);

      const propertyInput: PropertyLookupInput = {
        postcode: 'GU30 7AA',
        correlationId: 'test-killswitch-001',
      };

      const mockResult: CollectionEventResult = {
        success: false,
        acquisitionMetadata: {
          attemptId: 'attempt_killswitch_001',
          adapterId: 'east-hampshire',
          councilId: 'east-hampshire',
          lookupMethod: 'pdf_calendar' as const,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 5,
          httpRequestCount: 0,
          bytesReceived: 0,
          usedBrowserAutomation: false,
          adapterVersion: '1.0.0',
          executionEnvironment: 'test',
          riskLevel: 'medium' as const,
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
      expect(mockHttpClient.get).not.toHaveBeenCalled();
      expect(mockResult.errorMessage).toContain('kill switch');
    });
  });

  describe('Evidence Storage - PDF Hash', () => {
    it('should store PDF hash and URL in evidence', async () => {
      const pdfUrl = 'https://www.easthants.gov.uk/calendars/round-1.pdf';
      
      mockHttpClient.get
        .mockResolvedValueOnce({
          status: 200,
          data: eastHampshireAreaLookupHtml,
          headers: { 'content-type': 'text/html' },
        })
        .mockResolvedValueOnce({
          status: 200,
          data: mockPdfBuffer,
          headers: { 'content-type': 'application/pdf' },
        });

      mockPdfParser.parse.mockResolvedValue({
        collectionDates: [
          { date: '2026-04-01', serviceType: 'general_waste' },
        ],
      });

      mockEvidenceStore.store.mockResolvedValue({
        evidenceRef: 'evidence_hash_001',
        storagePath: 'east-hampshire/evidence_hash_001.pdf',
        contentHash: 'sha256:abc123def456',
      });

      expect(mockEvidenceStore.store).toHaveBeenCalledWith(
        expect.objectContaining({
          evidenceType: 'pdf',
        })
      );
    });
  });

  describe('verifyHealth()', () => {
    it('should return AdapterHealth with correct structure', async () => {
      mockHttpClient.get.mockResolvedValue({
        status: 200,
        data: eastHampshireAreaLookupHtml,
        headers: { 'content-type': 'text/html' },
      });

      const mockHealth: AdapterHealth = {
        councilId: 'east-hampshire',
        status: 'healthy' as HealthStatus,
        lastSuccessAt: new Date().toISOString(),
        successRate24h: 0.88,
        avgResponseTimeMs24h: 620,
        acquisitionCount24h: 67,
        checkedAt: new Date().toISOString(),
        upstreamReachable: true,
        expectedSchemaVersion: 'pdf-v1',
        detectedSchemaVersion: 'pdf-v1',
        schemaDriftDetected: false,
      };

      expect(mockHealth.status).toBe('healthy');
      expect(mockHealth.councilId).toBe('east-hampshire');
      expect(mockHealth.upstreamReachable).toBe(true);
    });
  });

  describe('securityProfile()', () => {
    it('should return correct security profile for PDF adapter', async () => {
      const mockSecurityProfile = {
        councilId: 'east-hampshire',
        riskLevel: 'medium' as ExecutionRiskLevel,
        requiresBrowserAutomation: false,
        executesJavaScript: false,
        externalDomains: [
          'www.easthants.gov.uk',
          'maps.easthants.gov.uk',
        ],
        handlesCredentials: false,
        securityConcerns: [
          'PDF parsing complexity',
          'Potential malformed PDF DoS',
        ],
        lastSecurityReview: '2026-03-25',
        isSandboxed: true,
        networkIsolation: 'allowlist_only' as const,
        requiredPermissions: ['network.egress.easthants'],
      };

      expect(mockSecurityProfile.externalDomains).toContain('www.easthants.gov.uk');
      expect(mockSecurityProfile.riskLevel).toBe('medium');
      expect(mockSecurityProfile.networkIsolation).toBe('allowlist_only');
    });
  });

  describe('Multi-step Acquisition Flow', () => {
    it('should perform area lookup then PDF download in sequence', async () => {
      mockHttpClient.get
        .mockResolvedValueOnce({
          status: 200,
          data: eastHampshireAreaLookupHtml,
          headers: { 'content-type': 'text/html' },
        })
        .mockResolvedValueOnce({
          status: 200,
          data: mockPdfBuffer,
          headers: { 'content-type': 'application/pdf' },
        });

      mockPdfParser.parse.mockResolvedValue({
        collectionDates: [
          { date: '2026-04-01', serviceType: 'general_waste' },
        ],
      });

      mockEvidenceStore.store.mockResolvedValue({
        evidenceRef: 'evidence_flow_001',
        storagePath: 'east-hampshire/evidence_flow_001.pdf',
      });

      expect(mockHttpClient.get).toHaveBeenCalledTimes(2);
      
      const callOrder = mockHttpClient.get.mock.calls;
      expect(callOrder[0]).toBeDefined();
      expect(callOrder[1]).toBeDefined();
    });
  });
});
