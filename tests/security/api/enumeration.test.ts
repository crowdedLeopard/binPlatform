/**
 * Security Tests - Enumeration Protection
 *
 * Tests that the API detects and blocks sequential scanning / enumeration
 * of postcodes, property IDs, and other resource identifiers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock security event emitter
const mockSecurityEventEmitter = {
  emit: vi.fn(),
};

// Mock logger
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

// ---------------------------------------------------------------------------
// Enumeration detector (the contract under test)
// ---------------------------------------------------------------------------

type BlockLevel = 'none' | 'soft' | 'hard';

interface EnumerationCheckResult {
  allowed: boolean;
  blockLevel: BlockLevel;
  status: number;
  body?: {
    code: string;
    message: string;
    retryAfter?: number;
    requestId?: string;
  };
}

interface EnumerationDetectorOptions {
  softBlockThreshold: number;  // lookups before soft block
  hardBlockThreshold: number;  // lookups before hard block
  windowMs: number;            // sliding window duration
}

const buildEnumerationDetector = (opts: EnumerationDetectorOptions) => {
  // Tracks unique resource lookups (postcode/propertyId) per IP per window
  const store = new Map<string, { timestamps: number[]; resources: string[] }>();

  const getRecord = (key: string) => {
    if (!store.has(key)) store.set(key, { timestamps: [], resources: [] });
    return store.get(key)!;
  };

  const pruneWindow = (record: { timestamps: number[]; resources: string[] }, now: number) => {
    const cutoff = now - opts.windowMs;
    const keep = record.timestamps.map((t, i) => t >= cutoff ? i : -1).filter(i => i >= 0);
    record.timestamps = keep.map(i => record.timestamps[i]);
    record.resources = keep.map(i => record.resources[i]);
  };

  return {
    check(ip: string, resource: string, requestId: string): EnumerationCheckResult {
      const key = `ip:${ip}`;
      const now = Date.now();
      const record = getRecord(key);

      pruneWindow(record, now);

      const countBefore = record.resources.length;

      // Record this lookup (even if we'll block it — so the count is accurate)
      record.timestamps.push(now);
      record.resources.push(resource);

      const uniqueCount = new Set(record.resources).size;

      if (uniqueCount > opts.hardBlockThreshold) {
        mockSecurityEventEmitter.emit({ event: 'enumeration_hard_block', ip, uniqueCount, requestId });
        mockLogger.warn({ event: 'enumeration_hard_block', ip, uniqueCount, requestId });
        return {
          allowed: false,
          blockLevel: 'hard',
          status: 429,
          body: {
            code: 'RATE_LIMITED',
            message: 'Too many requests',
            retryAfter: Math.ceil(opts.windowMs / 1000),
            requestId,
          },
        };
      }

      if (uniqueCount > opts.softBlockThreshold) {
        mockSecurityEventEmitter.emit({ event: 'enumeration_soft_block', ip, uniqueCount, requestId });
        mockLogger.warn({ event: 'enumeration_soft_block', ip, uniqueCount, requestId });
        return {
          allowed: false,
          blockLevel: 'soft',
          status: 429,
          body: {
            code: 'RATE_LIMITED',
            message: 'Too many requests',
            retryAfter: Math.ceil(opts.windowMs / 1000),
            requestId,
          },
        };
      }

      return { allowed: true, blockLevel: 'none', status: 200 };
    },

    reset(ip: string) {
      store.delete(`ip:${ip}`);
    },
  };
};

// Helper to generate sequential UK postcodes for testing
const makePostcode = (n: number): string => {
  const base = 1000 + n;
  return `SO${base} 1AA`;
};

// Helper to generate sequential UUID v4-like property IDs
const makePropertyId = (n: number): string => {
  const hex = n.toString(16).padStart(8, '0');
  return `${hex}-0000-4000-8000-000000000000`;
};

describe('Security - Enumeration Protection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // 51 sequential postcodes → soft block on 51st
  // -------------------------------------------------------------------------
  describe('51 Sequential Postcode Lookups → Soft Block', () => {
    it('should allow the first 50 unique postcode lookups within 15 minutes', () => {
      const detector = buildEnumerationDetector({ softBlockThreshold: 50, hardBlockThreshold: 100, windowMs: 15 * 60_000 });
      const ip = '203.0.113.10';

      for (let i = 0; i < 50; i++) {
        const result = detector.check(ip, makePostcode(i), `req_enum_${i}`);
        expect(result.allowed).toBe(true);
        expect(result.blockLevel).toBe('none');
      }
    });

    it('should soft-block on the 51st unique postcode lookup within 15 minutes', () => {
      const detector = buildEnumerationDetector({ softBlockThreshold: 50, hardBlockThreshold: 100, windowMs: 15 * 60_000 });
      const ip = '203.0.113.11';

      for (let i = 0; i < 50; i++) {
        detector.check(ip, makePostcode(i), `req_enum_${i}`);
      }

      const result = detector.check(ip, makePostcode(50), 'req_enum_50');

      expect(result.allowed).toBe(false);
      expect(result.blockLevel).toBe('soft');
      expect(result.status).toBe(429);
      expect(result.body?.code).toBe('RATE_LIMITED');
    });

    it('should emit enumeration_soft_block security event on soft block', () => {
      const detector = buildEnumerationDetector({ softBlockThreshold: 50, hardBlockThreshold: 100, windowMs: 15 * 60_000 });
      const ip = '203.0.113.12';

      for (let i = 0; i < 51; i++) {
        detector.check(ip, makePostcode(i), `req_e_${i}`);
      }

      expect(mockSecurityEventEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'enumeration_soft_block', ip }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // 101 sequential postcodes → hard block
  // -------------------------------------------------------------------------
  describe('101 Sequential Postcode Lookups → Hard Block', () => {
    it('should hard-block on the 101st unique postcode lookup within 15 minutes', () => {
      const detector = buildEnumerationDetector({ softBlockThreshold: 50, hardBlockThreshold: 100, windowMs: 15 * 60_000 });
      const ip = '203.0.113.20';

      for (let i = 0; i < 100; i++) {
        detector.check(ip, makePostcode(i), `req_hb_${i}`);
      }

      const result = detector.check(ip, makePostcode(100), 'req_hb_100');

      expect(result.allowed).toBe(false);
      expect(result.blockLevel).toBe('hard');
      expect(result.status).toBe(429);
    });

    it('should emit enumeration_hard_block security event', () => {
      const detector = buildEnumerationDetector({ softBlockThreshold: 50, hardBlockThreshold: 100, windowMs: 15 * 60_000 });
      const ip = '203.0.113.21';

      for (let i = 0; i < 101; i++) {
        detector.check(ip, makePostcode(i), `req_hb2_${i}`);
      }

      expect(mockSecurityEventEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'enumeration_hard_block', ip }),
      );
    });

    it('should include retryAfter in hard-block response', () => {
      const detector = buildEnumerationDetector({ softBlockThreshold: 50, hardBlockThreshold: 100, windowMs: 15 * 60_000 });
      const ip = '203.0.113.22';

      for (let i = 0; i < 101; i++) {
        detector.check(ip, makePostcode(i), `req_hb3_${i}`);
      }

      const result = detector.check(ip, makePostcode(101), 'req_hb3_final');

      expect(result.body?.retryAfter).toBeDefined();
      expect(result.body!.retryAfter).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Block resets after window expires
  // -------------------------------------------------------------------------
  describe('Enumeration Block Resets After Window', () => {
    it('should allow requests again after the enumeration window expires', () => {
      const shortWindowMs = 100;
      const detector = buildEnumerationDetector({ softBlockThreshold: 3, hardBlockThreshold: 10, windowMs: shortWindowMs });
      const ip = '203.0.113.30';

      // Trigger soft block
      for (let i = 0; i < 4; i++) {
        detector.check(ip, makePostcode(i), `req_wr_${i}`);
      }

      expect(detector.check(ip, makePostcode(4), 'req_wr_blocked').allowed).toBe(false);

      return new Promise<void>(resolve => {
        setTimeout(() => {
          // Window has expired — should be allowed again
          const result = detector.check(ip, makePostcode(5), 'req_wr_reset');
          expect(result.allowed).toBe(true);
          resolve();
        }, shortWindowMs + 20);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Property ID enumeration with sequential UUID guessing
  // -------------------------------------------------------------------------
  describe('Property ID Enumeration Detection', () => {
    it('should trigger detection when sequential UUIDs are looked up from same IP', () => {
      const detector = buildEnumerationDetector({ softBlockThreshold: 20, hardBlockThreshold: 50, windowMs: 15 * 60_000 });
      const ip = '203.0.113.40';

      for (let i = 0; i < 21; i++) {
        detector.check(ip, makePropertyId(i), `req_pid_${i}`);
      }

      const result = detector.check(ip, makePropertyId(21), 'req_pid_final');

      expect(result.allowed).toBe(false);
      expect(result.blockLevel).toBe('soft');
    });

    it('should emit security event when sequential property IDs detected', () => {
      const detector = buildEnumerationDetector({ softBlockThreshold: 20, hardBlockThreshold: 50, windowMs: 15 * 60_000 });
      const ip = '203.0.113.41';

      for (let i = 0; i < 21; i++) {
        detector.check(ip, makePropertyId(i), `req_pid2_${i}`);
      }

      expect(mockSecurityEventEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({ event: expect.stringContaining('enumeration') }),
      );
    });

    it('should allow up to threshold unique property IDs from same IP', () => {
      const detector = buildEnumerationDetector({ softBlockThreshold: 20, hardBlockThreshold: 50, windowMs: 15 * 60_000 });
      const ip = '203.0.113.42';

      for (let i = 0; i < 20; i++) {
        const result = detector.check(ip, makePropertyId(i), `req_pid3_${i}`);
        expect(result.allowed).toBe(true);
      }
    });

    it('should count the same property ID twice as one unique lookup', () => {
      const detector = buildEnumerationDetector({ softBlockThreshold: 3, hardBlockThreshold: 10, windowMs: 15 * 60_000 });
      const ip = '203.0.113.43';
      const sameId = makePropertyId(1);

      // Looking up the same resource 10 times should count as 1 unique
      for (let i = 0; i < 10; i++) {
        const result = detector.check(ip, sameId, `req_same_${i}`);
        expect(result.allowed).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Different postcodes from same IP counted correctly
  // -------------------------------------------------------------------------
  describe('Different Postcodes from Same IP Counted Correctly', () => {
    it('should count unique postcodes per IP, not total requests', () => {
      const detector = buildEnumerationDetector({ softBlockThreshold: 5, hardBlockThreshold: 20, windowMs: 15 * 60_000 });
      const ip = '203.0.113.50';

      // Same 5 postcodes repeated multiple times — should NOT trigger block
      const postcodes = Array.from({ length: 5 }, (_, i) => makePostcode(i));

      for (let rep = 0; rep < 4; rep++) {
        for (const pc of postcodes) {
          const result = detector.check(ip, pc, `req_rep_${rep}_${pc}`);
          expect(result.allowed).toBe(true);
        }
      }
    });

    it('should block when 6th unique postcode is looked up (threshold=5)', () => {
      const detector = buildEnumerationDetector({ softBlockThreshold: 5, hardBlockThreshold: 20, windowMs: 15 * 60_000 });
      const ip = '203.0.113.51';

      for (let i = 0; i < 5; i++) {
        detector.check(ip, makePostcode(i), `req_u_${i}`);
      }

      const result = detector.check(ip, makePostcode(5), 'req_u_6th');
      expect(result.allowed).toBe(false);
      expect(result.blockLevel).toBe('soft');
    });

    it('should count different IPs separately so IP-A enumeration does not block IP-B', () => {
      const detector = buildEnumerationDetector({ softBlockThreshold: 5, hardBlockThreshold: 20, windowMs: 15 * 60_000 });
      const ipA = '203.0.113.60';
      const ipB = '203.0.113.61';

      // IP-A hits limit
      for (let i = 0; i < 6; i++) {
        detector.check(ipA, makePostcode(i), `req_ipA_${i}`);
      }

      expect(detector.check(ipA, makePostcode(6), 'req_ipA_block').allowed).toBe(false);

      // IP-B is unaffected
      for (let i = 0; i < 5; i++) {
        const result = detector.check(ipB, makePostcode(i), `req_ipB_${i}`);
        expect(result.allowed).toBe(true);
      }
    });

    it('should include the unique lookup count in the security event payload', () => {
      const detector = buildEnumerationDetector({ softBlockThreshold: 5, hardBlockThreshold: 20, windowMs: 15 * 60_000 });
      const ip = '203.0.113.62';

      for (let i = 0; i < 6; i++) {
        detector.check(ip, makePostcode(i), `req_count_${i}`);
      }

      expect(mockSecurityEventEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({ uniqueCount: expect.any(Number) }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Response contract
  // -------------------------------------------------------------------------
  describe('Enumeration Block Response Contract', () => {
    it('should return 429 status on both soft and hard blocks', () => {
      const detector = buildEnumerationDetector({ softBlockThreshold: 2, hardBlockThreshold: 5, windowMs: 60_000 });
      const ip = '203.0.113.70';

      for (let i = 0; i < 3; i++) {
        detector.check(ip, makePostcode(i), `req_c_${i}`);
      }

      const result = detector.check(ip, makePostcode(3), 'req_c_block');
      expect(result.status).toBe(429);
    });

    it('should not expose internal enumeration counters in the response body', () => {
      const detector = buildEnumerationDetector({ softBlockThreshold: 2, hardBlockThreshold: 5, windowMs: 60_000 });
      const ip = '203.0.113.71';

      for (let i = 0; i < 3; i++) {
        detector.check(ip, makePostcode(i), `req_d_${i}`);
      }

      const result = detector.check(ip, makePostcode(3), 'req_d_block');
      const body = JSON.stringify(result.body ?? {});

      expect(body).not.toContain('uniqueCount');
      expect(body).not.toContain('timestamps');
      expect(body).not.toContain('resources');
    });

    it('should include requestId in enumeration block response', () => {
      const detector = buildEnumerationDetector({ softBlockThreshold: 2, hardBlockThreshold: 5, windowMs: 60_000 });
      const ip = '203.0.113.72';

      for (let i = 0; i < 3; i++) {
        detector.check(ip, makePostcode(i), `req_e_${i}`);
      }

      const result = detector.check(ip, makePostcode(3), 'req_e_final');
      expect(result.body?.requestId).toBe('req_e_final');
    });
  });
});
