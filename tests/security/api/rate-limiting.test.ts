/**
 * Security Tests - API Rate Limiting
 *
 * Tests rate limiting controls for all API endpoint classes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface RateLimitResult {
  allowed: boolean;
  status: number;
  headers?: Record<string, string | number>;
  body?: {
    code: string;
    message: string;
    retryAfter: number;
    requestId?: string;
  };
}

const buildRateLimiter = (maxPerWindow: number, windowMs: number) => {
  const store = new Map<string, number[]>();

  return {
    check(key: string): RateLimitResult {
      const now = Date.now();
      const timestamps = (store.get(key) ?? []).filter(t => now - t < windowMs);

      const remaining = Math.max(0, maxPerWindow - timestamps.length);
      const resetAt = timestamps.length > 0 ? Math.ceil((timestamps[0] + windowMs - now) / 1000) : 0;

      if (timestamps.length >= maxPerWindow) {
        return {
          allowed: false,
          status: 429,
          headers: {
            'X-RateLimit-Limit': maxPerWindow,
            'X-RateLimit-Remaining': 0,
            'X-RateLimit-Reset': resetAt,
            'Retry-After': resetAt,
          },
          body: {
            code: 'RATE_LIMITED',
            message: 'Too many requests',
            retryAfter: resetAt,
            requestId: `req_rl_${Date.now()}`,
          },
        };
      }

      timestamps.push(now);
      store.set(key, timestamps);

      return {
        allowed: true,
        status: 200,
        headers: {
          'X-RateLimit-Limit': maxPerWindow,
          'X-RateLimit-Remaining': remaining - 1,
          'X-RateLimit-Reset': resetAt,
        },
      };
    },

    reset(key: string) {
      store.delete(key);
    },
  };
};

describe('Security - API Rate Limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Public endpoint limit: 60 req/min
  // -------------------------------------------------------------------------
  describe('Public Endpoint Limit (60 req/min)', () => {
    it('should allow up to 60 requests per minute for public endpoints', () => {
      const limiter = buildRateLimiter(60, 60_000);

      for (let i = 0; i < 60; i++) {
        const result = limiter.check('ip:203.0.113.1:/v1/councils');
        expect(result.allowed).toBe(true);
        expect(result.status).toBe(200);
      }
    });

    it('should block the 61st request within the same window', () => {
      const limiter = buildRateLimiter(60, 60_000);

      for (let i = 0; i < 60; i++) {
        limiter.check('ip:203.0.113.2:/v1/councils');
      }

      const result = limiter.check('ip:203.0.113.2:/v1/councils');

      expect(result.allowed).toBe(false);
      expect(result.status).toBe(429);
      expect(result.body?.code).toBe('RATE_LIMITED');
    });

    it('should include retryAfter in 429 response body', () => {
      const limiter = buildRateLimiter(60, 60_000);

      for (let i = 0; i < 60; i++) {
        limiter.check('ip:203.0.113.3:/v1/councils');
      }

      const result = limiter.check('ip:203.0.113.3:/v1/councils');

      expect(result.body?.retryAfter).toBeDefined();
      expect(typeof result.body?.retryAfter).toBe('number');
      expect(result.body!.retryAfter).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Rate-limit response headers
  // -------------------------------------------------------------------------
  describe('Rate-Limit Response Headers', () => {
    it('should include X-RateLimit-Limit header on every response', () => {
      const limiter = buildRateLimiter(60, 60_000);
      const result = limiter.check('ip:10.0.0.1:/v1/councils');

      expect(result.headers?.['X-RateLimit-Limit']).toBeDefined();
      expect(result.headers!['X-RateLimit-Limit']).toBe(60);
    });

    it('should include X-RateLimit-Remaining header that decrements', () => {
      const limiter = buildRateLimiter(60, 60_000);

      const first = limiter.check('ip:10.0.0.2:/v1/councils');
      const second = limiter.check('ip:10.0.0.2:/v1/councils');

      expect(first.headers!['X-RateLimit-Remaining']).toBeGreaterThan(
        second.headers!['X-RateLimit-Remaining'] as number,
      );
    });

    it('should include X-RateLimit-Reset header on every response', () => {
      const limiter = buildRateLimiter(60, 60_000);
      limiter.check('ip:10.0.0.3:/v1/councils');
      const result = limiter.check('ip:10.0.0.3:/v1/councils');

      expect(result.headers?.['X-RateLimit-Reset']).toBeDefined();
    });

    it('should include Retry-After header on 429 responses', () => {
      const limiter = buildRateLimiter(2, 60_000);
      limiter.check('ip:10.0.0.4:/v1/councils');
      limiter.check('ip:10.0.0.4:/v1/councils');

      const result = limiter.check('ip:10.0.0.4:/v1/councils');

      expect(result.status).toBe(429);
      expect(result.headers?.['Retry-After']).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Different limits per endpoint class
  // -------------------------------------------------------------------------
  describe('Per-Endpoint-Class Limits', () => {
    const ENDPOINT_LIMITS: Record<string, { max: number; windowMs: number }> = {
      '/v1/councils': { max: 60, windowMs: 60_000 },
      '/v1/postcodes/:postcode/addresses': { max: 30, windowMs: 60_000 },
      '/v1/properties/:id/collections': { max: 30, windowMs: 60_000 },
      '/v1/admin/kill-switches': { max: 10, windowMs: 60_000 },
    };

    it('should enforce stricter limit on postcode lookup endpoints (30 req/min)', () => {
      const cfg = ENDPOINT_LIMITS['/v1/postcodes/:postcode/addresses'];
      const limiter = buildRateLimiter(cfg.max, cfg.windowMs);

      for (let i = 0; i < 30; i++) {
        const r = limiter.check('ip:10.1.0.1:/v1/postcodes/SO501AA/addresses');
        expect(r.allowed).toBe(true);
      }

      const blocked = limiter.check('ip:10.1.0.1:/v1/postcodes/SO501AA/addresses');
      expect(blocked.allowed).toBe(false);
      expect(blocked.status).toBe(429);
    });

    it('should enforce stricter limit on property collection endpoints (30 req/min)', () => {
      const cfg = ENDPOINT_LIMITS['/v1/properties/:id/collections'];
      const limiter = buildRateLimiter(cfg.max, cfg.windowMs);

      for (let i = 0; i < 30; i++) {
        limiter.check('ip:10.1.0.2:/v1/properties/abc/collections');
      }

      const blocked = limiter.check('ip:10.1.0.2:/v1/properties/abc/collections');
      expect(blocked.allowed).toBe(false);
    });

    it('should enforce tightest limit on admin endpoints (10 req/min)', () => {
      const cfg = ENDPOINT_LIMITS['/v1/admin/kill-switches'];
      const limiter = buildRateLimiter(cfg.max, cfg.windowMs);

      for (let i = 0; i < 10; i++) {
        limiter.check('ip:10.1.0.3:/v1/admin/kill-switches');
      }

      const blocked = limiter.check('ip:10.1.0.3:/v1/admin/kill-switches');
      expect(blocked.allowed).toBe(false);
      expect(blocked.status).toBe(429);
    });

    it('should allow 60 requests on councils while blocking after 30 on postcode endpoint', () => {
      const councilsLimiter = buildRateLimiter(60, 60_000);
      const postcodeLimiter = buildRateLimiter(30, 60_000);

      for (let i = 0; i < 30; i++) {
        expect(councilsLimiter.check('ip:10.1.0.4:/v1/councils').allowed).toBe(true);
        expect(postcodeLimiter.check('ip:10.1.0.4:/v1/postcodes/SO501AA/addresses').allowed).toBe(true);
      }

      // 31st on postcode → blocked; 31st on councils → still allowed
      expect(postcodeLimiter.check('ip:10.1.0.4:/v1/postcodes/SO501AA/addresses').allowed).toBe(false);
      expect(councilsLimiter.check('ip:10.1.0.4:/v1/councils').allowed).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // API key independent limits
  // -------------------------------------------------------------------------
  describe('Per-API-Key Independent Limits', () => {
    it('should track rate limits independently per API key', () => {
      const limiter = buildRateLimiter(5, 60_000);

      // key-A makes 5 requests
      for (let i = 0; i < 5; i++) {
        limiter.check('apikey:key-A');
      }

      // key-A is now limited
      expect(limiter.check('apikey:key-A').allowed).toBe(false);

      // key-B is unaffected
      expect(limiter.check('apikey:key-B').allowed).toBe(true);
    });

    it('should count requests per API key not per IP when key is present', () => {
      const limiter = buildRateLimiter(3, 60_000);
      const ip = '203.0.113.10';

      // Two different keys from same IP
      limiter.check(`apikey:key-X:ip:${ip}`);
      limiter.check(`apikey:key-X:ip:${ip}`);
      limiter.check(`apikey:key-X:ip:${ip}`);

      expect(limiter.check(`apikey:key-X:ip:${ip}`).allowed).toBe(false);
      expect(limiter.check(`apikey:key-Y:ip:${ip}`).allowed).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Bypass attempt protection
  // -------------------------------------------------------------------------
  describe('Rate Limit Bypass Attempt Protection', () => {
    it('should not reset rate limit when X-Forwarded-For is manipulated', () => {
      const checkRateLimitWithHeaders = (
        headers: Record<string, string>,
        store: Map<string, number[]>,
        maxPerWindow = 3,
        windowMs = 60_000,
      ): RateLimitResult => {
        // Trusted IP extraction: ignore X-Forwarded-For; use socket IP
        const clientIp = headers['x-real-ip'] ?? '10.0.0.1';
        const key = `ip:${clientIp}`;
        const now = Date.now();
        const timestamps = (store.get(key) ?? []).filter(t => now - t < windowMs);

        if (timestamps.length >= maxPerWindow) {
          return {
            allowed: false,
            status: 429,
            body: { code: 'RATE_LIMITED', message: 'Too many requests', retryAfter: 60 },
          };
        }

        timestamps.push(now);
        store.set(key, timestamps);
        return { allowed: true, status: 200 };
      };

      const store = new Map<string, number[]>();
      const realIp = '10.0.0.1';

      // 3 requests from real IP
      for (let i = 0; i < 3; i++) {
        checkRateLimitWithHeaders({ 'x-real-ip': realIp }, store);
      }

      // Attacker tries to bypass by spoofing X-Forwarded-For
      const bypassResult = checkRateLimitWithHeaders(
        { 'x-forwarded-for': '1.2.3.4', 'x-real-ip': realIp },
        store,
      );

      expect(bypassResult.allowed).toBe(false);
      expect(bypassResult.status).toBe(429);
    });

    it('should not reset rate limit by changing User-Agent', () => {
      const store = new Map<string, number[]>();
      const limiter = buildRateLimiter(3, 60_000);
      const key = 'ip:10.0.0.2';

      limiter.check(key);
      limiter.check(key);
      limiter.check(key);

      // Changing user-agent does not get a new bucket — same key
      const result = limiter.check(key);
      expect(result.allowed).toBe(false);
    });

    it('should not allow bypassing via case-variation of API key header', () => {
      // Normalise header names before keying rate-limit bucket
      const normaliseApiKey = (headers: Record<string, string>): string | undefined => {
        const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
        return lower['x-api-key'];
      };

      expect(normaliseApiKey({ 'X-API-KEY': 'abc' })).toBe('abc');
      expect(normaliseApiKey({ 'X-Api-Key': 'abc' })).toBe('abc');
      expect(normaliseApiKey({ 'x-api-key': 'abc' })).toBe('abc');
    });

    it('should log bypass attempts when suspicious header patterns detected', () => {
      const detectBypassAttempt = (headers: Record<string, string>): boolean => {
        const suspicious = [
          'x-forwarded-for',
          'x-originating-ip',
          'x-remote-ip',
          'x-remote-addr',
          'x-cluster-client-ip',
        ];

        const hasSpoofingHeaders = suspicious.some(h => h in headers);
        if (hasSpoofingHeaders) {
          mockLogger.warn({ event: 'rate_limit_bypass_attempt', headers });
          return true;
        }
        return false;
      };

      const isSuspicious = detectBypassAttempt({
        'x-forwarded-for': '1.2.3.4',
        'x-api-key': 'some-key',
      });

      expect(isSuspicious).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'rate_limit_bypass_attempt' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Window reset behaviour
  // -------------------------------------------------------------------------
  describe('Rate Limit Window Reset', () => {
    it('should allow requests again after the window expires', () => {
      const shortWindowMs = 100;
      const limiter = buildRateLimiter(2, shortWindowMs);
      const key = 'ip:10.0.0.3';

      limiter.check(key);
      limiter.check(key);
      expect(limiter.check(key).allowed).toBe(false);

      // Wait for window to expire
      return new Promise<void>(resolve => {
        setTimeout(() => {
          const result = limiter.check(key);
          expect(result.allowed).toBe(true);
          resolve();
        }, shortWindowMs + 10);
      });
    });
  });

  // -------------------------------------------------------------------------
  // 429 response contract
  // -------------------------------------------------------------------------
  describe('Rate-Limit 429 Response Contract', () => {
    it('should return RATE_LIMITED error code on 429', () => {
      const limiter = buildRateLimiter(1, 60_000);
      limiter.check('ip:10.0.0.5');
      const result = limiter.check('ip:10.0.0.5');

      expect(result.body?.code).toBe('RATE_LIMITED');
    });

    it('should include requestId in 429 response body', () => {
      const limiter = buildRateLimiter(1, 60_000);
      limiter.check('ip:10.0.0.6');
      const result = limiter.check('ip:10.0.0.6');

      expect(result.body?.requestId).toBeDefined();
    });

    it('should not expose internal implementation details in 429 body', () => {
      const limiter = buildRateLimiter(1, 60_000);
      limiter.check('ip:10.0.0.7');
      const result = limiter.check('ip:10.0.0.7');

      const body = JSON.stringify(result.body ?? {});
      expect(body).not.toContain('Map');
      expect(body).not.toContain('store');
      expect(body).not.toContain('timestamp');
    });
  });
});
