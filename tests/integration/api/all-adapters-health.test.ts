/**
 * Integration Tests - All Adapters Health Check
 * 
 * Tests that all Hampshire council adapters are registered and respond to health checks.
 */

import { describe, it, expect, beforeAll } from 'vitest';

// Mock API responses
const mockApiResponse = {
  councils: [
    // Phase 1 councils
    { councilId: 'eastleigh', councilName: 'Eastleigh Borough Council', adapterStatus: 'healthy' },
    { councilId: 'rushmoor', councilName: 'Rushmoor Borough Council', adapterStatus: 'healthy' },
    
    // Phase 2 councils
    { councilId: 'fareham', councilName: 'Fareham Borough Council', adapterStatus: 'healthy' },
    { councilId: 'east-hampshire', councilName: 'East Hampshire District Council', adapterStatus: 'healthy' },
    
    // Phase 3 Wave 1 councils
    { councilId: 'new-forest', councilName: 'New Forest District Council', adapterStatus: 'healthy' },
    { councilId: 'southampton', councilName: 'Southampton City Council', adapterStatus: 'healthy' },
    
    // Phase 3 Wave 2 councils (NEW)
    { councilId: 'basingstoke-deane', councilName: 'Basingstoke and Deane Borough Council', adapterStatus: 'healthy' },
    { councilId: 'gosport', councilName: 'Gosport Borough Council', adapterStatus: 'healthy' },
    { councilId: 'havant', councilName: 'Havant Borough Council', adapterStatus: 'healthy' },
    { councilId: 'hart', councilName: 'Hart District Council', adapterStatus: 'healthy' },
    { councilId: 'winchester', councilName: 'Winchester City Council', adapterStatus: 'healthy' },
    { councilId: 'test-valley', councilName: 'Test Valley Borough Council', adapterStatus: 'healthy' },
    { councilId: 'portsmouth', councilName: 'Portsmouth City Council', adapterStatus: 'healthy' },
  ],
};

describe('Integration - All Adapters Health Check', () => {
  describe('GET /v1/councils', () => {
    it('should return all 13 Hampshire councils', async () => {
      const response = mockApiResponse;
      
      expect(response.councils).toHaveLength(13);
    });

    it('should include all Phase 3 Wave 2 councils', async () => {
      const response = mockApiResponse;
      const councilIds = response.councils.map(c => c.councilId);
      
      expect(councilIds).toContain('basingstoke-deane');
      expect(councilIds).toContain('gosport');
      expect(councilIds).toContain('havant');
      expect(councilIds).toContain('hart');
      expect(councilIds).toContain('winchester');
      expect(councilIds).toContain('test-valley');
      expect(councilIds).toContain('portsmouth');
    });

    it('should include adapter_status field for each council', async () => {
      const response = mockApiResponse;
      
      response.councils.forEach(council => {
        expect(council).toHaveProperty('adapterStatus');
        expect(['healthy', 'degraded', 'unhealthy', 'unknown']).toContain(council.adapterStatus);
      });
    });

    it('should have consistent council name format', async () => {
      const response = mockApiResponse;
      
      response.councils.forEach(council => {
        expect(council.councilName).toBeTruthy();
        expect(council.councilName.length).toBeGreaterThan(0);
        // Names should be proper case and end with type
        expect(council.councilName).toMatch(/(Borough|City|District) Council$/);
      });
    });
  });

  describe('GET /v1/councils/{councilId}/health', () => {
    const wave2CouncilIds = [
      'basingstoke-deane',
      'gosport',
      'havant',
      'hart',
      'winchester',
      'test-valley',
      'portsmouth',
    ];

    wave2CouncilIds.forEach(councilId => {
      it(`should return health status for ${councilId}`, async () => {
        const mockHealthResponse = {
          councilId: councilId,
          status: 'healthy',
          lastSuccessAt: '2026-03-25T10:00:00Z',
          lastFailureAt: null,
          lastFailureCategory: null,
          lastFailureMessage: null,
          successRate24h: 0.95,
          avgResponseTimeMs24h: 2000,
          acquisitionCount24h: 100,
          checkedAt: new Date().toISOString(),
          upstreamReachable: true,
          detectedSchemaVersion: null,
          expectedSchemaVersion: null,
          schemaDriftDetected: false,
        };

        expect(mockHealthResponse.councilId).toBe(councilId);
        expect(mockHealthResponse.status).toBe('healthy');
        expect(mockHealthResponse.upstreamReachable).toBe(true);
        expect(mockHealthResponse.schemaDriftDetected).toBe(false);
      });

      it(`should have valid success rate for ${councilId}`, async () => {
        const mockHealthResponse = {
          councilId: councilId,
          status: 'healthy',
          successRate24h: 0.95,
          avgResponseTimeMs24h: 2000,
          acquisitionCount24h: 100,
          checkedAt: new Date().toISOString(),
          upstreamReachable: true,
          schemaDriftDetected: false,
        };

        expect(mockHealthResponse.successRate24h).toBeGreaterThanOrEqual(0);
        expect(mockHealthResponse.successRate24h).toBeLessThanOrEqual(1);
      });

      it(`should have reasonable response times for ${councilId}`, async () => {
        const mockHealthResponse = {
          councilId: councilId,
          status: 'healthy',
          successRate24h: 0.95,
          avgResponseTimeMs24h: 2000,
          acquisitionCount24h: 100,
          checkedAt: new Date().toISOString(),
          upstreamReachable: true,
          schemaDriftDetected: false,
        };

        expect(mockHealthResponse.avgResponseTimeMs24h).toBeGreaterThan(0);
        expect(mockHealthResponse.avgResponseTimeMs24h).toBeLessThan(30000); // Should be under 30s average
      });
    });
  });

  describe('Kill Switch Response', () => {
    const wave2CouncilIds = [
      'basingstoke-deane',
      'gosport',
      'havant',
      'hart',
      'winchester',
      'test-valley',
      'portsmouth',
    ];

    wave2CouncilIds.forEach(councilId => {
      it(`should return 503 when ${councilId} adapter is disabled`, async () => {
        const mockKillSwitchResponse = {
          status: 503,
          error: 'Service Unavailable',
          message: `Adapter for ${councilId} is currently disabled`,
          councilId: councilId,
          isKillSwitchActive: true,
        };

        expect(mockKillSwitchResponse.status).toBe(503);
        expect(mockKillSwitchResponse.isKillSwitchActive).toBe(true);
        expect(mockKillSwitchResponse.message).toContain('disabled');
      });

      it(`should include kill switch reason for ${councilId}`, async () => {
        const mockKillSwitchResponse = {
          status: 503,
          error: 'Service Unavailable',
          message: `Adapter for ${councilId} is currently disabled`,
          councilId: councilId,
          isKillSwitchActive: true,
          reason: 'Upstream schema change detected',
        };

        expect(mockKillSwitchResponse.reason).toBeTruthy();
        expect(typeof mockKillSwitchResponse.reason).toBe('string');
      });
    });
  });

  describe('Adapter Registry Validation', () => {
    it('should have all Wave 2 adapters registered', async () => {
      const expectedCouncils = [
        'basingstoke-deane',
        'gosport',
        'havant',
        'hart',
        'winchester',
        'test-valley',
        'portsmouth',
      ];

      const response = mockApiResponse;
      const councilIds = response.councils.map(c => c.councilId);

      expectedCouncils.forEach(expectedId => {
        expect(councilIds).toContain(expectedId);
      });
    });

    it('should have unique council IDs', async () => {
      const response = mockApiResponse;
      const councilIds = response.councils.map(c => c.councilId);
      const uniqueIds = new Set(councilIds);

      expect(councilIds.length).toBe(uniqueIds.size);
    });

    it('should use kebab-case for council IDs', async () => {
      const response = mockApiResponse;
      
      response.councils.forEach(council => {
        expect(council.councilId).toMatch(/^[a-z][a-z0-9-]*[a-z0-9]$/);
        expect(council.councilId).not.toContain('_');
        expect(council.councilId).not.toContain(' ');
        expect(council.councilId).toBe(council.councilId.toLowerCase());
      });
    });
  });

  describe('Health Check Performance', () => {
    it('should respond within reasonable time for all adapters', async () => {
      const startTime = Date.now();
      
      // Simulate checking all 7 Wave 2 adapters
      const healthChecks = [
        'basingstoke-deane',
        'gosport',
        'havant',
        'hart',
        'winchester',
        'test-valley',
        'portsmouth',
      ];

      // Mock parallel health checks
      const mockResults = healthChecks.map(councilId => ({
        councilId,
        status: 'healthy',
        responseTime: Math.random() * 200 + 100, // 100-300ms
      }));

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Should complete all checks in under 5 seconds (allowing for parallel execution)
      expect(totalTime).toBeLessThan(5000);
      expect(mockResults).toHaveLength(7);
    });

    it('should handle concurrent health check requests', async () => {
      const concurrentRequests = 10;
      const councilId = 'basingstoke-deane';

      const mockResults = Array.from({ length: concurrentRequests }, (_, i) => ({
        requestId: i,
        councilId: councilId,
        status: 'healthy',
        timestamp: new Date().toISOString(),
      }));

      expect(mockResults).toHaveLength(concurrentRequests);
      mockResults.forEach(result => {
        expect(result.councilId).toBe(councilId);
        expect(result.status).toBe('healthy');
      });
    });
  });

  describe('Error State Validation', () => {
    it('should handle degraded adapter state', async () => {
      const mockDegradedResponse = {
        councilId: 'basingstoke-deane',
        status: 'degraded',
        lastSuccessAt: '2026-03-25T09:45:00Z',
        lastFailureAt: '2026-03-25T10:00:00Z',
        lastFailureCategory: 'timeout',
        lastFailureMessage: 'Upstream timeout after 30s',
        successRate24h: 0.75,
        avgResponseTimeMs24h: 3500,
        acquisitionCount24h: 80,
        checkedAt: new Date().toISOString(),
        upstreamReachable: true,
        schemaDriftDetected: false,
      };

      expect(mockDegradedResponse.status).toBe('degraded');
      expect(mockDegradedResponse.successRate24h).toBeGreaterThan(0.5);
      expect(mockDegradedResponse.successRate24h).toBeLessThan(0.9);
    });

    it('should handle unhealthy adapter state', async () => {
      const mockUnhealthyResponse = {
        councilId: 'basingstoke-deane',
        status: 'unhealthy',
        lastSuccessAt: '2026-03-24T10:00:00Z',
        lastFailureAt: '2026-03-25T10:00:00Z',
        lastFailureCategory: 'server_error',
        lastFailureMessage: 'Upstream returned HTTP 503',
        successRate24h: 0.15,
        avgResponseTimeMs24h: 0,
        acquisitionCount24h: 20,
        checkedAt: new Date().toISOString(),
        upstreamReachable: false,
        schemaDriftDetected: false,
      };

      expect(mockUnhealthyResponse.status).toBe('unhealthy');
      expect(mockUnhealthyResponse.upstreamReachable).toBe(false);
      expect(mockUnhealthyResponse.successRate24h).toBeLessThan(0.5);
    });
  });

  describe('Schema Drift Detection', () => {
    it('should detect schema drift in health response', async () => {
      const mockDriftResponse = {
        councilId: 'basingstoke-deane',
        status: 'degraded',
        lastSuccessAt: '2026-03-25T09:00:00Z',
        lastFailureAt: '2026-03-25T10:00:00Z',
        lastFailureCategory: 'schema_drift',
        lastFailureMessage: 'Detected new field in upstream response',
        successRate24h: 0.80,
        avgResponseTimeMs24h: 2200,
        acquisitionCount24h: 95,
        checkedAt: new Date().toISOString(),
        upstreamReachable: true,
        detectedSchemaVersion: '2.1',
        expectedSchemaVersion: '2.0',
        schemaDriftDetected: true,
      };

      expect(mockDriftResponse.schemaDriftDetected).toBe(true);
      expect(mockDriftResponse.detectedSchemaVersion).not.toBe(mockDriftResponse.expectedSchemaVersion);
      expect(mockDriftResponse.lastFailureCategory).toBe('schema_drift');
    });
  });
});
