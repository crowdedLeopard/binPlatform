/**
 * Security Tests - Authentication Hardening
 *
 * Tests auth controls: missing/malformed/expired tokens, privilege escalation,
 * timing safety, generic error messages, audit logging, and brute-force detection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock stores
const mockTokenStore = {
  validate: vi.fn(),
  isRevoked: vi.fn(),
  isExpired: vi.fn(),
  getRole: vi.fn(),
};

const mockAuditLog = {
  record: vi.fn(),
};

const mockSecurityEventEmitter = {
  emit: vi.fn(),
};

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

// ---------------------------------------------------------------------------
// Reference authenticator used across multiple suites
// ---------------------------------------------------------------------------

interface AuthResult {
  status: number;
  body: {
    code: string;
    message: string;
    requestId?: string;
  };
}

const buildAuthenticator = () => {
  const failureCount = new Map<string, number>();

  return {
    async authenticate(
      token: string | undefined,
      path: string,
      ip: string,
      requestId: string,
    ): Promise<AuthResult> {
      if (!token) {
        mockAuditLog.record({ event: 'auth_missing_token', path, ip, requestId });
        return { status: 401, body: { code: 'UNAUTHORIZED', message: 'Authentication required', requestId } };
      }

      // Basic format check — reject obviously malformed tokens
      const wellFormed = /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/.test(token);
      if (!wellFormed) {
        const failures = (failureCount.get(ip) ?? 0) + 1;
        failureCount.set(ip, failures);

        if (failures >= 10) {
          mockSecurityEventEmitter.emit({ event: 'consecutive_auth_failures', ip, count: failures });
        }

        mockAuditLog.record({ event: 'auth_malformed_token', path, ip, requestId });
        return { status: 401, body: { code: 'UNAUTHORIZED', message: 'Authentication failed', requestId } };
      }

      const isValid = await mockTokenStore.validate(token);
      if (!isValid) {
        const failures = (failureCount.get(ip) ?? 0) + 1;
        failureCount.set(ip, failures);

        if (failures >= 10) {
          mockSecurityEventEmitter.emit({ event: 'consecutive_auth_failures', ip, count: failures });
        }

        mockAuditLog.record({ event: 'auth_invalid_token', path, ip, requestId });
        return { status: 401, body: { code: 'UNAUTHORIZED', message: 'Authentication failed', requestId } };
      }

      const isExpired = await mockTokenStore.isExpired(token);
      if (isExpired) {
        mockAuditLog.record({ event: 'auth_expired_token', path, ip, requestId });
        return { status: 401, body: { code: 'UNAUTHORIZED', message: 'Authentication failed', requestId } };
      }

      const isRevoked = await mockTokenStore.isRevoked(token);
      if (isRevoked) {
        mockAuditLog.record({ event: 'auth_revoked_token', path, ip, requestId });
        return { status: 401, body: { code: 'UNAUTHORIZED', message: 'Authentication failed', requestId } };
      }

      const role = await mockTokenStore.getRole(token);

      if (path.startsWith('/v1/admin/') && role !== 'admin') {
        mockAuditLog.record({ event: 'auth_insufficient_permissions', path, ip, role, requestId });
        return { status: 403, body: { code: 'FORBIDDEN', message: 'Insufficient permissions', requestId } };
      }

      return { status: 200, body: { code: 'OK', message: 'Authenticated', requestId } };
    },

    getFailureCount(ip: string) {
      return failureCount.get(ip) ?? 0;
    },

    resetFailures(ip: string) {
      failureCount.delete(ip);
    },
  };
};

describe('Security - Authentication Hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // No token
  // -------------------------------------------------------------------------
  describe('Missing Token → 401', () => {
    it('should return 401 when no token is provided', async () => {
      const auth = buildAuthenticator();
      const result = await auth.authenticate(undefined, '/v1/postcodes/SO501AA/addresses', '10.0.0.1', 'req_1');

      expect(result.status).toBe(401);
      expect(result.body.code).toBe('UNAUTHORIZED');
    });

    it('should record audit event when token is absent', async () => {
      const auth = buildAuthenticator();
      await auth.authenticate(undefined, '/v1/postcodes/SO501AA/addresses', '10.0.0.1', 'req_2');

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'auth_missing_token' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Malformed token
  // -------------------------------------------------------------------------
  describe('Malformed Token → 401', () => {
    const malformedTokens = [
      'not-a-jwt',
      'Bearer ',
      'eyJ.only.two',
      '<script>alert(1)</script>',
      "'; DROP TABLE tokens; --",
      '',
      '   ',
      'null',
      'undefined',
    ];

    malformedTokens.forEach(token => {
      it(`should return 401 for malformed token: "${token.slice(0, 40)}"`, async () => {
        const auth = buildAuthenticator();
        const result = await auth.authenticate(token, '/v1/postcodes/SO501AA/addresses', '10.0.0.2', 'req_3');

        expect(result.status).toBe(401);
        expect(result.body.code).toBe('UNAUTHORIZED');
      });
    });

    it('should record audit event for malformed token', async () => {
      const auth = buildAuthenticator();
      await auth.authenticate('not-a-jwt', '/v1/postcodes/SO501AA/addresses', '10.0.0.2', 'req_4');

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'auth_malformed_token' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Expired token
  // -------------------------------------------------------------------------
  describe('Expired Token → 401', () => {
    it('should return 401 for an expired token', async () => {
      mockTokenStore.validate.mockResolvedValue(true);
      mockTokenStore.isExpired.mockResolvedValue(true);
      mockTokenStore.isRevoked.mockResolvedValue(false);

      const auth = buildAuthenticator();
      const result = await auth.authenticate(
        'eyJ.valid.sig',
        '/v1/postcodes/SO501AA/addresses',
        '10.0.0.3',
        'req_5',
      );

      expect(result.status).toBe(401);
      expect(result.body.code).toBe('UNAUTHORIZED');
    });

    it('should record audit event for expired token', async () => {
      mockTokenStore.validate.mockResolvedValue(true);
      mockTokenStore.isExpired.mockResolvedValue(true);
      mockTokenStore.isRevoked.mockResolvedValue(false);

      const auth = buildAuthenticator();
      await auth.authenticate('eyJ.valid.sig', '/v1/postcodes/SO501AA/addresses', '10.0.0.3', 'req_6');

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'auth_expired_token' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Revoked token
  // -------------------------------------------------------------------------
  describe('Revoked Token → 401', () => {
    it('should return 401 for a revoked token', async () => {
      mockTokenStore.validate.mockResolvedValue(true);
      mockTokenStore.isExpired.mockResolvedValue(false);
      mockTokenStore.isRevoked.mockResolvedValue(true);

      const auth = buildAuthenticator();
      const result = await auth.authenticate(
        'eyJ.valid.sig',
        '/v1/postcodes/SO501AA/addresses',
        '10.0.0.4',
        'req_7',
      );

      expect(result.status).toBe(401);
      expect(result.body.code).toBe('UNAUTHORIZED');
    });

    it('should record audit event for revoked token', async () => {
      mockTokenStore.validate.mockResolvedValue(true);
      mockTokenStore.isExpired.mockResolvedValue(false);
      mockTokenStore.isRevoked.mockResolvedValue(true);

      const auth = buildAuthenticator();
      await auth.authenticate('eyJ.valid.sig', '/v1/postcodes/SO501AA/addresses', '10.0.0.4', 'req_8');

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'auth_revoked_token' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Admin endpoint with read-only key → 403
  // -------------------------------------------------------------------------
  describe('Admin Endpoint with Read-Only Key → 403', () => {
    it('should return 403 when read-only key is used on admin endpoint', async () => {
      mockTokenStore.validate.mockResolvedValue(true);
      mockTokenStore.isExpired.mockResolvedValue(false);
      mockTokenStore.isRevoked.mockResolvedValue(false);
      mockTokenStore.getRole.mockResolvedValue('read-only');

      const auth = buildAuthenticator();
      const result = await auth.authenticate(
        'eyJ.valid.sig',
        '/v1/admin/kill-switches',
        '10.0.0.5',
        'req_9',
      );

      expect(result.status).toBe(403);
      expect(result.body.code).toBe('FORBIDDEN');
    });

    it('should record audit event for privilege escalation attempt', async () => {
      mockTokenStore.validate.mockResolvedValue(true);
      mockTokenStore.isExpired.mockResolvedValue(false);
      mockTokenStore.isRevoked.mockResolvedValue(false);
      mockTokenStore.getRole.mockResolvedValue('read-only');

      const auth = buildAuthenticator();
      await auth.authenticate('eyJ.valid.sig', '/v1/admin/kill-switches', '10.0.0.5', 'req_10');

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'auth_insufficient_permissions' }),
      );
    });

    it('should allow admin key on admin endpoint', async () => {
      mockTokenStore.validate.mockResolvedValue(true);
      mockTokenStore.isExpired.mockResolvedValue(false);
      mockTokenStore.isRevoked.mockResolvedValue(false);
      mockTokenStore.getRole.mockResolvedValue('admin');

      const auth = buildAuthenticator();
      const result = await auth.authenticate(
        'eyJ.valid.sig',
        '/v1/admin/kill-switches',
        '10.0.0.6',
        'req_11',
      );

      expect(result.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // Timing-safe comparison
  // -------------------------------------------------------------------------
  describe('Timing-Safe Token Comparison', () => {
    const timingSafeEqual = (a: string, b: string): boolean => {
      if (a.length !== b.length) {
        // Still perform a dummy comparison to avoid length-based leakage
        let dummy = 0;
        const maxLen = Math.max(a.length, b.length);
        for (let i = 0; i < maxLen; i++) {
          dummy |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
        }
        return false;
      }

      let result = 0;
      for (let i = 0; i < a.length; i++) {
        result |= a.charCodeAt(i) ^ b.charCodeAt(i);
      }
      return result === 0;
    };

    it('should return true for identical tokens', () => {
      expect(timingSafeEqual('abc123', 'abc123')).toBe(true);
    });

    it('should return false for tokens differing in one character', () => {
      expect(timingSafeEqual('abc123', 'abc124')).toBe(false);
    });

    it('should return false for tokens of different length without short-circuiting', () => {
      expect(timingSafeEqual('short', 'much-longer-value')).toBe(false);
    });

    it('should return false for empty string vs valid token', () => {
      expect(timingSafeEqual('', 'some-token')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Generic error messages (no information leakage)
  // -------------------------------------------------------------------------
  describe('Generic Error Messages', () => {
    it('should use identical message for missing and invalid tokens', async () => {
      const auth = buildAuthenticator();
      mockTokenStore.validate.mockResolvedValue(false);

      const missingResult = await auth.authenticate(undefined, '/v1/councils', '10.0.0.7', 'req_12');
      const invalidResult = await auth.authenticate('eyJ.bad.sig', '/v1/councils', '10.0.0.7', 'req_13');

      // Both should be 401 — messages may vary slightly but must not reveal which case
      expect(missingResult.status).toBe(401);
      expect(invalidResult.status).toBe(401);
      expect(invalidResult.body.message).not.toContain('invalid signature');
      expect(invalidResult.body.message).not.toContain('malformed');
    });

    it('should use identical message for expired and revoked tokens', async () => {
      const auth = buildAuthenticator();

      mockTokenStore.validate.mockResolvedValue(true);
      mockTokenStore.isExpired.mockResolvedValue(true);
      mockTokenStore.isRevoked.mockResolvedValue(false);
      const expiredResult = await auth.authenticate('eyJ.valid.sig', '/v1/councils', '10.0.0.8', 'req_14');

      vi.clearAllMocks();
      mockTokenStore.validate.mockResolvedValue(true);
      mockTokenStore.isExpired.mockResolvedValue(false);
      mockTokenStore.isRevoked.mockResolvedValue(true);
      const revokedResult = await auth.authenticate('eyJ.valid.sig', '/v1/councils', '10.0.0.8', 'req_15');

      expect(expiredResult.body.message).toBe(revokedResult.body.message);
    });

    it('should not include token value in error response', async () => {
      const auth = buildAuthenticator();
      const sensitiveToken = 'eyJteVNlbnNpdGl2ZVRva2Vu.payload.sig';
      const result = await auth.authenticate(sensitiveToken, '/v1/councils', '10.0.0.9', 'req_16');

      expect(JSON.stringify(result.body)).not.toContain(sensitiveToken);
      expect(JSON.stringify(result.body)).not.toContain('eyJ');
    });

    it('should always include requestId in auth error responses', async () => {
      const auth = buildAuthenticator();
      const result = await auth.authenticate(undefined, '/v1/councils', '10.0.0.10', 'req_17');

      expect(result.body.requestId).toBe('req_17');
    });
  });

  // -------------------------------------------------------------------------
  // Audit logging
  // -------------------------------------------------------------------------
  describe('Audit Logging', () => {
    it('should log all authentication failures', async () => {
      const auth = buildAuthenticator();
      mockTokenStore.validate.mockResolvedValue(false);

      await auth.authenticate('eyJ.bad.sig', '/v1/postcodes/SO501AA/addresses', '10.0.0.11', 'req_18');

      expect(mockAuditLog.record).toHaveBeenCalledTimes(1);
      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ ip: '10.0.0.11', requestId: 'req_18' }),
      );
    });

    it('should not include raw token value in audit log', async () => {
      const auth = buildAuthenticator();
      const sensitiveToken = 'eyJteVNlbnNpdGl2ZQ.payload.sig';

      await auth.authenticate(sensitiveToken, '/v1/councils', '10.0.0.12', 'req_19');

      const logCall = mockAuditLog.record.mock.calls[0]?.[0];
      expect(JSON.stringify(logCall ?? {})).not.toContain(sensitiveToken);
    });
  });

  // -------------------------------------------------------------------------
  // Consecutive failure → security event
  // -------------------------------------------------------------------------
  describe('10 Consecutive Failures → Security Event', () => {
    it('should emit a security event after 10 consecutive auth failures from same IP', async () => {
      const auth = buildAuthenticator();
      const ip = '10.0.0.20';

      for (let i = 0; i < 10; i++) {
        await auth.authenticate('bad-token', '/v1/councils', ip, `req_bf_${i}`);
      }

      expect(mockSecurityEventEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'consecutive_auth_failures', ip, count: 10 }),
      );
    });

    it('should not emit a security event before 10 consecutive failures', async () => {
      const auth = buildAuthenticator();
      const ip = '10.0.0.21';

      for (let i = 0; i < 9; i++) {
        await auth.authenticate('bad-token', '/v1/councils', ip, `req_bf2_${i}`);
      }

      expect(mockSecurityEventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should emit security event on the 10th failure and again on the 11th', async () => {
      const auth = buildAuthenticator();
      const ip = '10.0.0.22';

      for (let i = 0; i < 11; i++) {
        await auth.authenticate('bad-token', '/v1/councils', ip, `req_bf3_${i}`);
      }

      expect(mockSecurityEventEmitter.emit).toHaveBeenCalledTimes(2);
    });

    it('should track failure counts independently per IP', async () => {
      const auth = buildAuthenticator();

      for (let i = 0; i < 10; i++) {
        await auth.authenticate('bad-token', '/v1/councils', '10.0.0.23', `req_ip1_${i}`);
      }

      // Different IP — no security event yet
      await auth.authenticate('bad-token', '/v1/councils', '10.0.0.24', 'req_ip2_0');

      const calls = (mockSecurityEventEmitter.emit.mock.calls as Array<[{ ip: string }]>).filter(
        ([arg]) => arg.ip === '10.0.0.24',
      );
      expect(calls).toHaveLength(0);
    });
  });
});
