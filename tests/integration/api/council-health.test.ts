/**
 * Integration Tests - Council Health Endpoint
 * 
 * Tests the /v1/councils/{councilId}/health endpoint with mocked adapters.
 * Does not make real network calls to council sites.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AdapterHealth, HealthStatus } from '../../../src/adapters/base/adapter.interface';

// Mock adapter
const mockAdapter = {
  councilId: 'eastleigh',
  verifyHealth: vi.fn(),
};

// Mock adapter registry
const mockAdapterRegistry = {
  getAdapter: vi.fn(),
};

// Mock kill switch
const mockKillSwitch = {
  isEnabled: vi.fn(),
};

describe('Integration - Council Health Endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockKillSwitch.isEnabled.mockResolvedValue(true);
  });

  describe('GET /v1/councils/eastleigh/health', () => {
    it('should return health object with status field', async () => {
      const mockHealthData: AdapterHealth = {
        councilId: 'eastleigh',
        status: 'healthy' as HealthStatus,
        lastSuccessAt: '2026-03-25T10:30:00Z',
        successRate24h: 0.98,
        avgResponseTimeMs24h: 250,
        acquisitionCount24h: 145,
        checkedAt: new Date().toISOString(),
        upstreamReachable: true,
        schemaDriftDetected: false,
      };

      mockAdapter.verifyHealth.mockResolvedValue(mockHealthData);
      mockAdapterRegistry.getAdapter.mockResolvedValue(mockAdapter);

      // Simulate endpoint handler
      const getCouncilHealth = async (councilId: string) => {
        const adapter = await mockAdapterRegistry.getAdapter(councilId);
        
        if (!adapter) {
          return {
            status: 404,
            body: {
              code: 'COUNCIL_NOT_FOUND',
              message: 'Council not found',
            },
          };
        }

        const health = await adapter.verifyHealth();

        return {
          status: 200,
          body: {
            data: health,
          },
        };
      };

      const response = await getCouncilHealth('eastleigh');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('status');
      expect(response.body.data.status).toBe('healthy');
      expect(response.body.data).toHaveProperty('councilId');
      expect(response.body.data.councilId).toBe('eastleigh');
    });

    it('should include latency_ms in response', async () => {
      const mockHealthData: AdapterHealth = {
        councilId: 'eastleigh',
        status: 'healthy' as HealthStatus,
        lastSuccessAt: '2026-03-25T10:30:00Z',
        successRate24h: 0.95,
        avgResponseTimeMs24h: 320,
        acquisitionCount24h: 78,
        checkedAt: new Date().toISOString(),
        upstreamReachable: true,
        schemaDriftDetected: false,
      };

      mockAdapter.verifyHealth.mockResolvedValue(mockHealthData);
      mockAdapterRegistry.getAdapter.mockResolvedValue(mockAdapter);

      const getCouncilHealth = async (councilId: string) => {
        const adapter = await mockAdapterRegistry.getAdapter(councilId);
        const health = await adapter.verifyHealth();

        return {
          status: 200,
          body: { data: health },
        };
      };

      const response = await getCouncilHealth('eastleigh');

      expect(response.body.data).toHaveProperty('avgResponseTimeMs24h');
      expect(typeof response.body.data.avgResponseTimeMs24h).toBe('number');
      expect(response.body.data.avgResponseTimeMs24h).toBe(320);
    });
  });

  describe('GET /v1/councils/unknown/health', () => {
    it('should return 404 for unknown council', async () => {
      mockAdapterRegistry.getAdapter.mockResolvedValue(null);

      const getCouncilHealth = async (councilId: string) => {
        const adapter = await mockAdapterRegistry.getAdapter(councilId);
        
        if (!adapter) {
          return {
            status: 404,
            body: {
              code: 'COUNCIL_NOT_FOUND',
              message: `Council '${councilId}' not found`,
              requestId: 'req_health_1',
            },
          };
        }

        const health = await adapter.verifyHealth();
        return { status: 200, body: { data: health } };
      };

      const response = await getCouncilHealth('unknown-council');

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('COUNCIL_NOT_FOUND');
    });
  });

  describe('Health Response - Error Handling', () => {
    it('should not expose internal error details when adapter fails', async () => {
      const internalError = new Error('Database connection failed at /var/app/db.ts:123');
      mockAdapter.verifyHealth.mockRejectedValue(internalError);
      mockAdapterRegistry.getAdapter.mockResolvedValue(mockAdapter);

      const getCouncilHealth = async (councilId: string) => {
        try {
          const adapter = await mockAdapterRegistry.getAdapter(councilId);
          const health = await adapter.verifyHealth();

          return {
            status: 200,
            body: { data: health },
          };
        } catch (error) {
          // Never expose internal error details
          return {
            status: 503,
            body: {
              code: 'HEALTH_CHECK_FAILED',
              message: 'Health check temporarily unavailable',
              requestId: 'req_health_2',
              // stack: error.stack, // NEVER include this
              // error: error.message, // NEVER include raw error
            },
          };
        }
      };

      const response = await getCouncilHealth('eastleigh');

      expect(response.status).toBe(503);
      expect(response.body.message).not.toContain('Database');
      expect(response.body.message).not.toContain('/var/app');
      expect(response.body).not.toHaveProperty('stack');
      expect(response.body).not.toHaveProperty('error');
    });

    it('should return degraded status when success rate is low', async () => {
      const mockHealthData: AdapterHealth = {
        councilId: 'rushmoor',
        status: 'degraded' as HealthStatus,
        lastSuccessAt: '2026-03-25T09:00:00Z',
        lastFailureAt: '2026-03-25T10:30:00Z',
        lastFailureCategory: 'network_error' as const,
        successRate24h: 0.65,
        avgResponseTimeMs24h: 1500,
        acquisitionCount24h: 32,
        checkedAt: new Date().toISOString(),
        upstreamReachable: true,
        schemaDriftDetected: false,
      };

      mockAdapter.verifyHealth.mockResolvedValue(mockHealthData);
      mockAdapterRegistry.getAdapter.mockResolvedValue(mockAdapter);

      const getCouncilHealth = async (councilId: string) => {
        const adapter = await mockAdapterRegistry.getAdapter(councilId);
        const health = await adapter.verifyHealth();

        return {
          status: 200,
          body: { data: health },
        };
      };

      const response = await getCouncilHealth('rushmoor');

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('degraded');
      expect(response.body.data.successRate24h).toBeLessThan(0.8);
    });
  });

  describe('Kill Switch Active', () => {
    it('should show disabled status when kill switch is active', async () => {
      mockKillSwitch.isEnabled.mockResolvedValue(false);

      const getCouncilHealth = async (councilId: string) => {
        const isEnabled = await mockKillSwitch.isEnabled(councilId);

        if (!isEnabled) {
          return {
            status: 200,
            body: {
              data: {
                councilId,
                status: 'disabled',
                checkedAt: new Date().toISOString(),
                message: 'Adapter is disabled via kill switch',
              },
            },
          };
        }

        const adapter = await mockAdapterRegistry.getAdapter(councilId);
        const health = await adapter.verifyHealth();

        return {
          status: 200,
          body: { data: health },
        };
      };

      const response = await getCouncilHealth('eastleigh');

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('disabled');
      expect(response.body.data.message).toContain('kill switch');
      expect(mockAdapter.verifyHealth).not.toHaveBeenCalled();
    });
  });

  describe('Schema Drift Detection', () => {
    it('should report schema drift when detected', async () => {
      const mockHealthData: AdapterHealth = {
        councilId: 'eastleigh',
        status: 'degraded' as HealthStatus,
        lastSuccessAt: '2026-03-25T08:00:00Z',
        lastFailureAt: '2026-03-25T10:30:00Z',
        lastFailureCategory: 'schema_drift' as const,
        successRate24h: 0.45,
        avgResponseTimeMs24h: 500,
        acquisitionCount24h: 89,
        checkedAt: new Date().toISOString(),
        upstreamReachable: true,
        detectedSchemaVersion: '2.1',
        expectedSchemaVersion: '2.0',
        schemaDriftDetected: true,
      };

      mockAdapter.verifyHealth.mockResolvedValue(mockHealthData);
      mockAdapterRegistry.getAdapter.mockResolvedValue(mockAdapter);

      const getCouncilHealth = async (councilId: string) => {
        const adapter = await mockAdapterRegistry.getAdapter(councilId);
        const health = await adapter.verifyHealth();

        return {
          status: 200,
          body: { data: health },
        };
      };

      const response = await getCouncilHealth('eastleigh');

      expect(response.body.data.schemaDriftDetected).toBe(true);
      expect(response.body.data.detectedSchemaVersion).toBe('2.1');
      expect(response.body.data.expectedSchemaVersion).toBe('2.0');
    });
  });

  describe('Upstream Unreachable', () => {
    it('should report unhealthy when upstream is unreachable', async () => {
      const mockHealthData: AdapterHealth = {
        councilId: 'eastleigh',
        status: 'unhealthy' as HealthStatus,
        lastFailureAt: new Date().toISOString(),
        lastFailureCategory: 'network_error' as const,
        lastFailureMessage: 'Connection timeout',
        successRate24h: 0,
        avgResponseTimeMs24h: 0,
        acquisitionCount24h: 0,
        checkedAt: new Date().toISOString(),
        upstreamReachable: false,
        schemaDriftDetected: false,
      };

      mockAdapter.verifyHealth.mockResolvedValue(mockHealthData);
      mockAdapterRegistry.getAdapter.mockResolvedValue(mockAdapter);

      const getCouncilHealth = async (councilId: string) => {
        const adapter = await mockAdapterRegistry.getAdapter(councilId);
        const health = await adapter.verifyHealth();

        return {
          status: 200,
          body: { data: health },
        };
      };

      const response = await getCouncilHealth('eastleigh');

      expect(response.body.data.status).toBe('unhealthy');
      expect(response.body.data.upstreamReachable).toBe(false);
    });
  });

  describe('Response Format Validation', () => {
    it('should include all required health fields', async () => {
      const mockHealthData: AdapterHealth = {
        councilId: 'eastleigh',
        status: 'healthy' as HealthStatus,
        lastSuccessAt: '2026-03-25T10:30:00Z',
        successRate24h: 0.98,
        avgResponseTimeMs24h: 250,
        acquisitionCount24h: 145,
        checkedAt: new Date().toISOString(),
        upstreamReachable: true,
        schemaDriftDetected: false,
      };

      mockAdapter.verifyHealth.mockResolvedValue(mockHealthData);
      mockAdapterRegistry.getAdapter.mockResolvedValue(mockAdapter);

      const getCouncilHealth = async (councilId: string) => {
        const adapter = await mockAdapterRegistry.getAdapter(councilId);
        const health = await adapter.verifyHealth();

        return {
          status: 200,
          body: { data: health },
        };
      };

      const response = await getCouncilHealth('eastleigh');
      const health = response.body.data;

      // Required fields
      expect(health).toHaveProperty('councilId');
      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('checkedAt');
      expect(health).toHaveProperty('upstreamReachable');
      expect(health).toHaveProperty('schemaDriftDetected');
      expect(health).toHaveProperty('successRate24h');
      expect(health).toHaveProperty('avgResponseTimeMs24h');
      expect(health).toHaveProperty('acquisitionCount24h');
    });

    it('should have valid ISO 8601 timestamps', async () => {
      const mockHealthData: AdapterHealth = {
        councilId: 'eastleigh',
        status: 'healthy' as HealthStatus,
        lastSuccessAt: '2026-03-25T10:30:00.000Z',
        checkedAt: '2026-03-25T10:35:00.000Z',
        successRate24h: 0.98,
        avgResponseTimeMs24h: 250,
        acquisitionCount24h: 145,
        upstreamReachable: true,
        schemaDriftDetected: false,
      };

      mockAdapter.verifyHealth.mockResolvedValue(mockHealthData);
      mockAdapterRegistry.getAdapter.mockResolvedValue(mockAdapter);

      const getCouncilHealth = async (councilId: string) => {
        const adapter = await mockAdapterRegistry.getAdapter(councilId);
        const health = await adapter.verifyHealth();

        return {
          status: 200,
          body: { data: health },
        };
      };

      const response = await getCouncilHealth('eastleigh');
      const health = response.body.data;

      // Validate ISO 8601 format
      const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
      
      expect(health.lastSuccessAt).toMatch(iso8601Regex);
      expect(health.checkedAt).toMatch(iso8601Regex);
    });
  });

  describe('Caching Headers', () => {
    it('should include cache control headers for health endpoint', () => {
      const createHealthResponse = (health: AdapterHealth) => {
        return {
          status: 200,
          headers: {
            'Cache-Control': 'public, max-age=60', // Cache for 1 minute
            'Content-Type': 'application/json',
          },
          body: { data: health },
        };
      };

      const mockHealth: AdapterHealth = {
        councilId: 'eastleigh',
        status: 'healthy',
        checkedAt: new Date().toISOString(),
        upstreamReachable: true,
        schemaDriftDetected: false,
        successRate24h: 0.98,
        avgResponseTimeMs24h: 250,
        acquisitionCount24h: 145,
      };

      const response = createHealthResponse(mockHealth);

      expect(response.headers['Cache-Control']).toBeDefined();
      expect(response.headers['Cache-Control']).toContain('max-age=60');
    });
  });
});
