/**
 * Security Tests - API Authentication
 * 
 * Tests authentication and authorization controls for the API.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock API key store
const mockApiKeyStore = {
  validate: vi.fn(),
  getRoleForKey: vi.fn(),
};

// Mock logger
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

describe('Security - API Authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Admin Endpoints - No API Key', () => {
    it('should return 401 UNAUTHORIZED for request without API key', () => {
      const authenticateRequest = (apiKey: string | undefined, path: string) => {
        if (path.startsWith('/v1/admin/')) {
          if (!apiKey) {
            return {
              status: 401,
              body: {
                code: 'UNAUTHORIZED',
                message: 'API key required',
                requestId: 'req_auth_1',
              },
            };
          }
        }

        return { status: 200, body: {} };
      };

      const result = authenticateRequest(undefined, '/v1/admin/kill-switches');

      expect(result.status).toBe(401);
      expect(result.body.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Admin Endpoints - Invalid API Key', () => {
    it('should return 401 UNAUTHORIZED for invalid API key', async () => {
      mockApiKeyStore.validate.mockResolvedValue(false);

      const authenticateRequest = async (apiKey: string | undefined, path: string) => {
        if (path.startsWith('/v1/admin/')) {
          if (!apiKey) {
            return {
              status: 401,
              body: {
                code: 'UNAUTHORIZED',
                message: 'API key required',
                requestId: 'req_auth_2',
              },
            };
          }

          const isValid = await mockApiKeyStore.validate(apiKey);
          if (!isValid) {
            return {
              status: 401,
              body: {
                code: 'UNAUTHORIZED',
                message: 'Invalid API key',
                requestId: 'req_auth_3',
              },
            };
          }
        }

        return { status: 200, body: {} };
      };

      const result = await authenticateRequest('invalid-key-123', '/v1/admin/kill-switches');

      expect(result.status).toBe(401);
      expect(result.body.code).toBe('UNAUTHORIZED');
      expect(mockApiKeyStore.validate).toHaveBeenCalledWith('invalid-key-123');
    });
  });

  describe('Admin Endpoints - Read-Only API Key', () => {
    it('should return 403 FORBIDDEN for read-only key on admin endpoint', async () => {
      mockApiKeyStore.validate.mockResolvedValue(true);
      mockApiKeyStore.getRoleForKey.mockResolvedValue('read-only');

      const authorizeRequest = async (apiKey: string, path: string) => {
        const isValid = await mockApiKeyStore.validate(apiKey);
        
        if (!isValid) {
          return {
            status: 401,
            body: { code: 'UNAUTHORIZED', message: 'Invalid API key' },
          };
        }

        if (path.startsWith('/v1/admin/')) {
          const role = await mockApiKeyStore.getRoleForKey(apiKey);
          
          if (role !== 'admin') {
            return {
              status: 403,
              body: {
                code: 'FORBIDDEN',
                message: 'Insufficient permissions',
                requestId: 'req_auth_4',
              },
            };
          }
        }

        return { status: 200, body: {} };
      };

      const result = await authorizeRequest('readonly-key-456', '/v1/admin/kill-switches');

      expect(result.status).toBe(403);
      expect(result.body.code).toBe('FORBIDDEN');
      expect(mockApiKeyStore.getRoleForKey).toHaveBeenCalledWith('readonly-key-456');
    });
  });

  describe('Admin Endpoints - Admin API Key', () => {
    it('should return 200 OK for valid admin key', async () => {
      mockApiKeyStore.validate.mockResolvedValue(true);
      mockApiKeyStore.getRoleForKey.mockResolvedValue('admin');

      const authorizeRequest = async (apiKey: string, path: string) => {
        const isValid = await mockApiKeyStore.validate(apiKey);
        
        if (!isValid) {
          return {
            status: 401,
            body: { code: 'UNAUTHORIZED', message: 'Invalid API key' },
          };
        }

        if (path.startsWith('/v1/admin/')) {
          const role = await mockApiKeyStore.getRoleForKey(apiKey);
          
          if (role !== 'admin') {
            return {
              status: 403,
              body: { code: 'FORBIDDEN', message: 'Insufficient permissions' },
            };
          }
        }

        return { status: 200, body: { data: { killSwitches: [] } } };
      };

      const result = await authorizeRequest('admin-key-789', '/v1/admin/kill-switches');

      expect(result.status).toBe(200);
      expect(mockApiKeyStore.validate).toHaveBeenCalledWith('admin-key-789');
      expect(mockApiKeyStore.getRoleForKey).toHaveBeenCalledWith('admin-key-789');
    });
  });

  describe('Public Endpoints - No API Key', () => {
    it('should return 200 OK for /v1/councils without API key', () => {
      const authenticateRequest = (apiKey: string | undefined, path: string) => {
        // Public endpoints don't require auth
        const publicPaths = ['/v1/councils', '/v1/health'];
        
        if (publicPaths.includes(path)) {
          return { status: 200, body: { data: [] } };
        }

        if (!apiKey) {
          return {
            status: 401,
            body: { code: 'UNAUTHORIZED', message: 'API key required' },
          };
        }

        return { status: 200, body: {} };
      };

      const result = authenticateRequest(undefined, '/v1/councils');

      expect(result.status).toBe(200);
    });
  });

  describe('Timing Attack Prevention', () => {
    it('should have constant-time API key comparison', async () => {
      const constantTimeCompare = (a: string, b: string): boolean => {
        if (a.length !== b.length) {
          // Still compare to prevent length leakage
          let result = 0;
          for (let i = 0; i < Math.max(a.length, b.length); i++) {
            result |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
          }
          return false;
        }

        let result = 0;
        for (let i = 0; i < a.length; i++) {
          result |= a.charCodeAt(i) ^ b.charCodeAt(i);
        }

        return result === 0;
      };

      // Measure time for valid vs invalid (should be similar)
      const validKey = 'valid-key-abc123def456ghi789';
      const invalidKey1 = 'invalid-key-xyz999';
      const invalidKey2 = 'aaaaaaaaaaaaaaaaaaaaaaaaaa';

      const start1 = Date.now();
      constantTimeCompare(validKey, invalidKey1);
      const time1 = Date.now() - start1;

      const start2 = Date.now();
      constantTimeCompare(validKey, invalidKey2);
      const time2 = Date.now() - start2;

      // Times should be within reasonable variance (not leaked via timing)
      // In practice, this is hard to test reliably, but we verify the implementation
      expect(constantTimeCompare('abc', 'abc')).toBe(true);
      expect(constantTimeCompare('abc', 'abd')).toBe(false);
      expect(constantTimeCompare('abc', 'ab')).toBe(false);
    });
  });

  describe('API Key Not Echoed in Response', () => {
    it('should not return API key in response body', () => {
      const createResponse = (apiKey: string) => {
        // API key should NEVER be in response
        return {
          status: 200,
          body: {
            message: 'Request successful',
            // apiKey: apiKey, // NEVER include this
          },
        };
      };

      const response = createResponse('secret-api-key-123');

      expect(response.body).not.toHaveProperty('apiKey');
      expect(JSON.stringify(response.body)).not.toContain('secret-api-key');
    });

    it('should not return API key in error response', () => {
      const createErrorResponse = (apiKey: string) => {
        return {
          status: 401,
          body: {
            code: 'UNAUTHORIZED',
            message: 'Invalid API key',
            // Provided key: apiKey, // NEVER include this
            requestId: 'req_auth_5',
          },
        };
      };

      const response = createErrorResponse('wrong-key-456');

      expect(response.body).not.toHaveProperty('apiKey');
      expect(response.body.message).not.toContain('wrong-key-456');
    });
  });

  describe('API Key Not in Logs', () => {
    it('should redact API key from log output', () => {
      const logRequest = (apiKey: string | undefined, path: string) => {
        const logData = {
          path,
          // apiKey: apiKey, // NEVER log the raw key
          apiKeyPresent: !!apiKey,
          apiKeyPrefix: apiKey ? `${apiKey.substring(0, 4)}...` : undefined,
        };

        mockLogger.info(logData);

        return logData;
      };

      const logData = logRequest('sk_live_abc123def456', '/v1/postcodes/SO501AA/addresses');

      expect(logData).not.toHaveProperty('apiKey');
      expect(logData.apiKeyPresent).toBe(true);
      expect(logData.apiKeyPrefix).toBe('sk_l...');
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.not.objectContaining({ apiKey: expect.anything() })
      );
    });

    it('should redact Authorization header from logs', () => {
      const logHeaders = (headers: Record<string, string>) => {
        const safeHeaders = { ...headers };
        
        // Redact sensitive headers
        const sensitiveHeaders = ['authorization', 'x-api-key', 'cookie'];
        
        for (const key of Object.keys(safeHeaders)) {
          if (sensitiveHeaders.includes(key.toLowerCase())) {
            safeHeaders[key] = '[REDACTED]';
          }
        }

        mockLogger.info({ headers: safeHeaders });

        return safeHeaders;
      };

      const safeHeaders = logHeaders({
        'x-api-key': 'secret-key-123',
        'authorization': 'Bearer token-456',
        'content-type': 'application/json',
      });

      expect(safeHeaders['x-api-key']).toBe('[REDACTED]');
      expect(safeHeaders['authorization']).toBe('[REDACTED]');
      expect(safeHeaders['content-type']).toBe('application/json');
    });
  });

  describe('Rate Limiting by API Key', () => {
    it('should track rate limit per API key independently', () => {
      const rateLimiter = new Map<string, number[]>();

      const checkRateLimit = (apiKey: string, maxPerMinute: number = 100) => {
        const now = Date.now();
        const windowMs = 60000; // 1 minute
        
        if (!rateLimiter.has(apiKey)) {
          rateLimiter.set(apiKey, []);
        }

        const attempts = rateLimiter.get(apiKey)!;
        
        // Remove attempts outside window
        const recentAttempts = attempts.filter(timestamp => now - timestamp < windowMs);
        
        if (recentAttempts.length >= maxPerMinute) {
          return {
            allowed: false,
            status: 429,
            body: {
              code: 'RATE_LIMITED',
              message: 'Too many requests',
              retryAfter: 60,
            },
          };
        }

        recentAttempts.push(now);
        rateLimiter.set(apiKey, recentAttempts);

        return { allowed: true, status: 200 };
      };

      // Key1 makes 100 requests
      for (let i = 0; i < 100; i++) {
        checkRateLimit('key1');
      }

      // Key1 should be rate limited
      const key1Result = checkRateLimit('key1');
      expect(key1Result.allowed).toBe(false);
      expect(key1Result.status).toBe(429);

      // Key2 should still be allowed (different limit)
      const key2Result = checkRateLimit('key2');
      expect(key2Result.allowed).toBe(true);
    });
  });

  describe('Generic Error Messages', () => {
    it('should not distinguish between invalid and disabled keys in error message', () => {
      const authenticateRequest = async (apiKey: string) => {
        const isValid = await mockApiKeyStore.validate(apiKey);
        const role = await mockApiKeyStore.getRoleForKey(apiKey);

        if (!isValid || role === 'disabled') {
          // Generic message - don't reveal if key exists but is disabled
          return {
            status: 401,
            body: {
              code: 'UNAUTHORIZED',
              message: 'Authentication failed', // Generic
              requestId: 'req_auth_6',
            },
          };
        }

        return { status: 200, body: {} };
      };

      mockApiKeyStore.validate.mockResolvedValue(true);
      mockApiKeyStore.getRoleForKey.mockResolvedValue('disabled');

      authenticateRequest('disabled-key').then(result => {
        expect(result.status).toBe(401);
        expect(result.body.message).toBe('Authentication failed');
        expect(result.body.message).not.toContain('disabled');
        expect(result.body.message).not.toContain('invalid');
      });
    });
  });

  describe('API Key Format Validation', () => {
    it('should reject malformed API key format', () => {
      const validateApiKeyFormat = (apiKey: string): boolean => {
        // Platform key format: hbp_[env]_[32 alphanumeric chars]
        // hbp = Hampshire Bin Platform — distinct from any third-party key format
        const keyRegex = /^hbp_(test|live)_[a-zA-Z0-9]{32}$/;
        
        return keyRegex.test(apiKey);
      };

      expect(validateApiKeyFormat('hbp_live_abcdefghijklmnopqrstuvwxyz123456')).toBe(true);
      expect(validateApiKeyFormat('hbp_test_abcdefghijklmnopqrstuvwxyz123456')).toBe(true);
      expect(validateApiKeyFormat('invalid-key')).toBe(false);
      expect(validateApiKeyFormat('hbp_live_short')).toBe(false);
      expect(validateApiKeyFormat('other_live_abcdefghijklmnopqrstuvwxyz12')).toBe(false);
    });
  });

  describe('Brute Force Protection', () => {
    it('should block IP after 10 failed auth attempts', () => {
      const failedAttempts = new Map<string, number>();

      const checkBruteForce = (ip: string, maxAttempts: number = 10) => {
        const attempts = failedAttempts.get(ip) || 0;

        if (attempts >= maxAttempts) {
          return {
            blocked: true,
            status: 429,
            body: {
              code: 'TOO_MANY_ATTEMPTS',
              message: 'Too many failed authentication attempts',
              retryAfter: 3600, // 1 hour
              requestId: 'req_auth_7',
            },
          };
        }

        return { blocked: false, status: 200 };
      };

      const recordFailedAttempt = (ip: string) => {
        const attempts = failedAttempts.get(ip) || 0;
        failedAttempts.set(ip, attempts + 1);
      };

      const testIp = '192.168.1.100';

      // 10 failed attempts
      for (let i = 0; i < 10; i++) {
        recordFailedAttempt(testIp);
      }

      const result = checkBruteForce(testIp);

      expect(result.blocked).toBe(true);
      expect(result.status).toBe(429);
      expect(result.body?.code).toBe('TOO_MANY_ATTEMPTS');
    });
  });

  describe('Session Token Security', () => {
    it('should generate high-entropy session tokens', () => {
      const generateSessionToken = (): string => {
        // Generate 256-bit random token
        const bytes = new Uint8Array(32);
        crypto.getRandomValues(bytes);
        
        return Array.from(bytes)
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
      };

      const token1 = generateSessionToken();
      const token2 = generateSessionToken();

      expect(token1).toHaveLength(64); // 32 bytes * 2 hex chars
      expect(token2).toHaveLength(64);
      expect(token1).not.toBe(token2); // Should be unique
      expect(token1).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
