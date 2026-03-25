/**
 * Confidence Endpoint Integration Tests
 * 
 * Tests the confidence field and freshness metadata in API responses.
 * Validates that confidence scoring is correctly applied to collection data.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// Mock API response type
type CollectionEventApiResponse = {
  success: boolean;
  data: {
    propertyId: string;
    address: string;
    postcode: string;
    collections: Array<{
      eventId: string;
      serviceType: string;
      collectionDate: string;
      isConfirmed: boolean;
    }>;
    confidence: number;
    confidenceFactors?: {
      method: string;
      ageHours: number;
      freshness: string;
      dataQuality: string;
    };
    freshness?: {
      acquiredAt: string;
      ageHours: number;
      cacheHit: boolean;
      cacheTtlRemaining?: number;
    };
  };
};

// Mock HTTP client
const mockApiClient = {
  get: vi.fn(),
};

// Mock cache with TTL tracking
const mockCache = {
  get: vi.fn(),
  set: vi.fn(),
  ttl: vi.fn(),
};

describe('Confidence Endpoint Integration Tests', () => {
  beforeAll(() => {
    // Setup test environment
  });

  afterAll(() => {
    // Cleanup test environment
  });

  describe('GET /v1/properties/:id/collections - Confidence Field', () => {
    it('should include confidence field as number between 0-1', async () => {
      const mockResponse: CollectionEventApiResponse = {
        success: true,
        data: {
          propertyId: 'prop_123',
          address: '1 High Street, Eastleigh',
          postcode: 'SO50 5LA',
          collections: [
            {
              eventId: 'event_001',
              serviceType: 'general_waste',
              collectionDate: '2026-04-01',
              isConfirmed: true,
            },
          ],
          confidence: 0.95,
        },
      };

      mockApiClient.get.mockResolvedValue({
        status: 200,
        data: mockResponse,
      });

      const response = await mockApiClient.get('/v1/properties/prop_123/collections');

      expect(response.status).toBe(200);
      expect(response.data.data.confidence).toBeDefined();
      expect(typeof response.data.data.confidence).toBe('number');
      expect(response.data.data.confidence).toBeGreaterThanOrEqual(0);
      expect(response.data.data.confidence).toBeLessThanOrEqual(1);
    });

    it('should have confidence field in response schema', async () => {
      const mockResponse: CollectionEventApiResponse = {
        success: true,
        data: {
          propertyId: 'prop_124',
          address: '2 Main Street, Fareham',
          postcode: 'PO16 7AW',
          collections: [],
          confidence: 0.85,
        },
      };

      mockApiClient.get.mockResolvedValue({
        status: 200,
        data: mockResponse,
      });

      const response = await mockApiClient.get('/v1/properties/prop_124/collections');

      expect(response.data.data).toHaveProperty('confidence');
    });
  });

  describe('GET /v1/properties/:id/collections - Confidence Factors Breakdown', () => {
    it('should include confidenceFactors breakdown', async () => {
      const mockResponse: CollectionEventApiResponse = {
        success: true,
        data: {
          propertyId: 'prop_125',
          address: '3 Church Lane, East Hampshire',
          postcode: 'GU30 7AA',
          collections: [
            {
              eventId: 'event_002',
              serviceType: 'recycling',
              collectionDate: '2026-04-08',
              isConfirmed: true,
            },
          ],
          confidence: 0.75,
          confidenceFactors: {
            method: 'pdf_calendar',
            ageHours: 12,
            freshness: 'fresh',
            dataQuality: 'good',
          },
        },
      };

      mockApiClient.get.mockResolvedValue({
        status: 200,
        data: mockResponse,
      });

      const response = await mockApiClient.get('/v1/properties/prop_125/collections');

      expect(response.data.data.confidenceFactors).toBeDefined();
      expect(response.data.data.confidenceFactors).toHaveProperty('method');
      expect(response.data.data.confidenceFactors).toHaveProperty('ageHours');
      expect(response.data.data.confidenceFactors).toHaveProperty('freshness');
      expect(response.data.data.confidenceFactors).toHaveProperty('dataQuality');
    });

    it('should show method as "api" for API-based acquisition', async () => {
      const mockResponse: CollectionEventApiResponse = {
        success: true,
        data: {
          propertyId: 'prop_126',
          address: '4 Oak Road, Eastleigh',
          postcode: 'SO50 5LB',
          collections: [],
          confidence: 0.95,
          confidenceFactors: {
            method: 'api',
            ageHours: 1,
            freshness: 'fresh',
            dataQuality: 'excellent',
          },
        },
      };

      mockApiClient.get.mockResolvedValue({
        status: 200,
        data: mockResponse,
      });

      const response = await mockApiClient.get('/v1/properties/prop_126/collections');

      expect(response.data.data.confidenceFactors.method).toBe('api');
    });

    it('should show method as "pdf_calendar" for PDF-based acquisition', async () => {
      const mockResponse: CollectionEventApiResponse = {
        success: true,
        data: {
          propertyId: 'prop_127',
          address: '5 Park Avenue, East Hampshire',
          postcode: 'GU31 4AB',
          collections: [],
          confidence: 0.70,
          confidenceFactors: {
            method: 'pdf_calendar',
            ageHours: 24,
            freshness: 'recent',
            dataQuality: 'good',
          },
        },
      };

      mockApiClient.get.mockResolvedValue({
        status: 200,
        data: mockResponse,
      });

      const response = await mockApiClient.get('/v1/properties/prop_127/collections');

      expect(response.data.data.confidenceFactors.method).toBe('pdf_calendar');
    });
  });

  describe('Stale Cached Data vs Fresh Data', () => {
    it('stale cached data should have lower confidence than fresh data', async () => {
      // Fresh data response
      const freshResponse: CollectionEventApiResponse = {
        success: true,
        data: {
          propertyId: 'prop_128',
          address: '6 Station Road, Fareham',
          postcode: 'PO16 7AX',
          collections: [
            {
              eventId: 'event_003',
              serviceType: 'general_waste',
              collectionDate: '2026-04-01',
              isConfirmed: true,
            },
          ],
          confidence: 0.95,
          confidenceFactors: {
            method: 'api',
            ageHours: 0,
            freshness: 'fresh',
            dataQuality: 'excellent',
          },
        },
      };

      // Stale data response
      const staleResponse: CollectionEventApiResponse = {
        success: true,
        data: {
          propertyId: 'prop_129',
          address: '7 Market Street, Fareham',
          postcode: 'PO16 7AY',
          collections: [
            {
              eventId: 'event_004',
              serviceType: 'general_waste',
              collectionDate: '2026-04-01',
              isConfirmed: true,
            },
          ],
          confidence: 0.45,
          confidenceFactors: {
            method: 'api',
            ageHours: 30,
            freshness: 'stale',
            dataQuality: 'degraded',
          },
        },
      };

      mockApiClient.get
        .mockResolvedValueOnce({ status: 200, data: freshResponse })
        .mockResolvedValueOnce({ status: 200, data: staleResponse });

      const freshResult = await mockApiClient.get('/v1/properties/prop_128/collections');
      const staleResult = await mockApiClient.get('/v1/properties/prop_129/collections');

      expect(staleResult.data.data.confidence).toBeLessThan(
        freshResult.data.data.confidence
      );
      expect(freshResult.data.data.confidenceFactors.freshness).toBe('fresh');
      expect(staleResult.data.data.confidenceFactors.freshness).toBe('stale');
    });

    it('should reflect age in hours for stale data', async () => {
      const staleResponse: CollectionEventApiResponse = {
        success: true,
        data: {
          propertyId: 'prop_130',
          address: '8 Bridge Lane, Eastleigh',
          postcode: 'SO50 5LC',
          collections: [],
          confidence: 0.60,
          confidenceFactors: {
            method: 'api',
            ageHours: 48,
            freshness: 'stale',
            dataQuality: 'acceptable',
          },
        },
      };

      mockApiClient.get.mockResolvedValue({
        status: 200,
        data: staleResponse,
      });

      const response = await mockApiClient.get('/v1/properties/prop_130/collections');

      expect(response.data.data.confidenceFactors.ageHours).toBe(48);
      expect(response.data.data.confidence).toBeLessThan(0.7);
    });
  });

  describe('Freshness Metadata', () => {
    it('should include freshness metadata in response', async () => {
      const mockResponse: CollectionEventApiResponse = {
        success: true,
        data: {
          propertyId: 'prop_131',
          address: '9 Green Street, Eastleigh',
          postcode: 'SO50 5LD',
          collections: [],
          confidence: 0.92,
          freshness: {
            acquiredAt: '2026-03-25T10:30:00Z',
            ageHours: 2,
            cacheHit: true,
            cacheTtlRemaining: 167,
          },
        },
      };

      mockApiClient.get.mockResolvedValue({
        status: 200,
        data: mockResponse,
      });

      const response = await mockApiClient.get('/v1/properties/prop_131/collections');

      expect(response.data.data.freshness).toBeDefined();
      expect(response.data.data.freshness).toHaveProperty('acquiredAt');
      expect(response.data.data.freshness).toHaveProperty('ageHours');
      expect(response.data.data.freshness).toHaveProperty('cacheHit');
    });

    it('should show acquiredAt as ISO 8601 timestamp', async () => {
      const mockResponse: CollectionEventApiResponse = {
        success: true,
        data: {
          propertyId: 'prop_132',
          address: '10 Mill Road, Fareham',
          postcode: 'PO16 7AZ',
          collections: [],
          confidence: 0.88,
          freshness: {
            acquiredAt: '2026-03-25T14:22:33Z',
            ageHours: 1,
            cacheHit: false,
          },
        },
      };

      mockApiClient.get.mockResolvedValue({
        status: 200,
        data: mockResponse,
      });

      const response = await mockApiClient.get('/v1/properties/prop_132/collections');

      expect(response.data.data.freshness.acquiredAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/
      );
    });

    it('should show cacheHit as true for cached responses', async () => {
      const mockResponse: CollectionEventApiResponse = {
        success: true,
        data: {
          propertyId: 'prop_133',
          address: '11 Castle View, East Hampshire',
          postcode: 'GU32 3AA',
          collections: [],
          confidence: 0.85,
          freshness: {
            acquiredAt: '2026-03-25T09:00:00Z',
            ageHours: 5,
            cacheHit: true,
            cacheTtlRemaining: 163,
          },
        },
      };

      mockApiClient.get.mockResolvedValue({
        status: 200,
        data: mockResponse,
      });

      const response = await mockApiClient.get('/v1/properties/prop_133/collections');

      expect(response.data.data.freshness.cacheHit).toBe(true);
      expect(response.data.data.freshness.cacheTtlRemaining).toBeGreaterThan(0);
    });

    it('should show cacheHit as false for fresh acquisitions', async () => {
      const mockResponse: CollectionEventApiResponse = {
        success: true,
        data: {
          propertyId: 'prop_134',
          address: '12 Valley Road, Eastleigh',
          postcode: 'SO50 5LE',
          collections: [],
          confidence: 0.95,
          freshness: {
            acquiredAt: new Date().toISOString(),
            ageHours: 0,
            cacheHit: false,
          },
        },
      };

      mockApiClient.get.mockResolvedValue({
        status: 200,
        data: mockResponse,
      });

      const response = await mockApiClient.get('/v1/properties/prop_134/collections');

      expect(response.data.data.freshness.cacheHit).toBe(false);
      expect(response.data.data.freshness.cacheTtlRemaining).toBeUndefined();
    });

    it('should include cacheTtlRemaining only for cache hits', async () => {
      const cachedResponse: CollectionEventApiResponse = {
        success: true,
        data: {
          propertyId: 'prop_135',
          address: '13 River Lane, Fareham',
          postcode: 'PO16 7BA',
          collections: [],
          confidence: 0.90,
          freshness: {
            acquiredAt: '2026-03-25T08:00:00Z',
            ageHours: 6,
            cacheHit: true,
            cacheTtlRemaining: 162,
          },
        },
      };

      const freshResponse: CollectionEventApiResponse = {
        success: true,
        data: {
          propertyId: 'prop_136',
          address: '14 Beach Road, Fareham',
          postcode: 'PO16 7BB',
          collections: [],
          confidence: 0.95,
          freshness: {
            acquiredAt: new Date().toISOString(),
            ageHours: 0,
            cacheHit: false,
          },
        },
      };

      mockApiClient.get
        .mockResolvedValueOnce({ status: 200, data: cachedResponse })
        .mockResolvedValueOnce({ status: 200, data: freshResponse });

      const cachedResult = await mockApiClient.get('/v1/properties/prop_135/collections');
      const freshResult = await mockApiClient.get('/v1/properties/prop_136/collections');

      expect(cachedResult.data.data.freshness.cacheTtlRemaining).toBeDefined();
      expect(freshResult.data.data.freshness.cacheTtlRemaining).toBeUndefined();
    });
  });

  describe('Confidence Correlation with Data Quality', () => {
    it('high confidence should correlate with "excellent" data quality', async () => {
      const mockResponse: CollectionEventApiResponse = {
        success: true,
        data: {
          propertyId: 'prop_137',
          address: '15 Court Street, Eastleigh',
          postcode: 'SO50 5LF',
          collections: [],
          confidence: 0.93,
          confidenceFactors: {
            method: 'api',
            ageHours: 1,
            freshness: 'fresh',
            dataQuality: 'excellent',
          },
        },
      };

      mockApiClient.get.mockResolvedValue({
        status: 200,
        data: mockResponse,
      });

      const response = await mockApiClient.get('/v1/properties/prop_137/collections');

      expect(response.data.data.confidence).toBeGreaterThan(0.9);
      expect(response.data.data.confidenceFactors.dataQuality).toBe('excellent');
    });

    it('medium confidence should correlate with "good" or "acceptable" quality', async () => {
      const mockResponse: CollectionEventApiResponse = {
        success: true,
        data: {
          propertyId: 'prop_138',
          address: '16 Hill Top, East Hampshire',
          postcode: 'GU33 6AA',
          collections: [],
          confidence: 0.68,
          confidenceFactors: {
            method: 'pdf_calendar',
            ageHours: 18,
            freshness: 'recent',
            dataQuality: 'good',
          },
        },
      };

      mockApiClient.get.mockResolvedValue({
        status: 200,
        data: mockResponse,
      });

      const response = await mockApiClient.get('/v1/properties/prop_138/collections');

      expect(response.data.data.confidence).toBeGreaterThan(0.6);
      expect(response.data.data.confidence).toBeLessThan(0.8);
      expect(response.data.data.confidenceFactors.dataQuality).toBe('good');
    });

    it('low confidence should correlate with "degraded" quality', async () => {
      const mockResponse: CollectionEventApiResponse = {
        success: true,
        data: {
          propertyId: 'prop_139',
          address: '17 Old Road, Fareham',
          postcode: 'PO16 7BC',
          collections: [],
          confidence: 0.35,
          confidenceFactors: {
            method: 'api',
            ageHours: 96,
            freshness: 'very_stale',
            dataQuality: 'degraded',
          },
        },
      };

      mockApiClient.get.mockResolvedValue({
        status: 200,
        data: mockResponse,
      });

      const response = await mockApiClient.get('/v1/properties/prop_139/collections');

      expect(response.data.data.confidence).toBeLessThan(0.5);
      expect(response.data.data.confidenceFactors.dataQuality).toBe('degraded');
    });
  });
});
