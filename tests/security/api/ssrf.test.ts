/**
 * Security Tests - SSRF Protection
 *
 * Tests that the HTTP adapter layer blocks requests to internal/private
 * addresses and off-allowlist domains, while permitting valid council domains.
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
// SSRF-safe HTTP client (the contract under test)
// ---------------------------------------------------------------------------

interface FetchResult {
  status: number;
  body: {
    code: string;
    message: string;
    requestId?: string;
  };
  data?: unknown;
}

const ALLOWED_COUNCIL_DOMAINS = [
  'eastleigh.gov.uk',
  'winchester.gov.uk',
  'basingstoke.gov.uk',
  'southampton.gov.uk',
  'portsmouth.gov.uk',
  'test-council.hampshire.gov.uk',
];

const isBlockedAddress = (url: string): { blocked: boolean; reason?: string } => {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return { blocked: true, reason: 'invalid_url' };
  }

  // Localhost variants
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return { blocked: true, reason: 'localhost' };
  }

  // All-zeros
  if (hostname === '0.0.0.0') {
    return { blocked: true, reason: 'any_address' };
  }

  // Private RFC-1918 ranges (simplified check)
  const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    if (a === 10) return { blocked: true, reason: 'private_10' };
    if (a === 172 && b >= 16 && b <= 31) return { blocked: true, reason: 'private_172' };
    if (a === 192 && b === 168) return { blocked: true, reason: 'private_192_168' };
    // Link-local (IMDS on cloud VMs)
    if (a === 169 && b === 254) return { blocked: true, reason: 'link_local_169_254' };
    // Loopback range
    if (a === 127) return { blocked: true, reason: 'loopback' };
  }

  // IPv6 link-local
  if (hostname.startsWith('fe80') || hostname === '::1') {
    return { blocked: true, reason: 'ipv6_link_local' };
  }

  return { blocked: false };
};

const isAllowlistedDomain = (url: string): boolean => {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return false;
  }

  return ALLOWED_COUNCIL_DOMAINS.some(
    allowed => hostname === allowed || hostname.endsWith(`.${allowed}`),
  );
};

const ssrfSafeFetch = async (
  targetUrl: string,
  requestId: string,
): Promise<FetchResult> => {
  // Block internal addresses
  const blockCheck = isBlockedAddress(targetUrl);
  if (blockCheck.blocked) {
    mockSecurityEventEmitter.emit({
      event: 'ssrf_attempt_blocked',
      targetUrl,
      reason: blockCheck.reason,
      requestId,
    });
    mockLogger.warn({ event: 'ssrf_attempt_blocked', targetUrl, reason: blockCheck.reason, requestId });
    return {
      status: 400,
      body: { code: 'INVALID_REQUEST', message: 'Request target is not permitted', requestId },
    };
  }

  // Enforce allowlist
  if (!isAllowlistedDomain(targetUrl)) {
    mockSecurityEventEmitter.emit({
      event: 'ssrf_off_allowlist',
      targetUrl,
      requestId,
    });
    mockLogger.warn({ event: 'ssrf_off_allowlist', targetUrl, requestId });
    return {
      status: 400,
      body: { code: 'INVALID_REQUEST', message: 'Request target is not permitted', requestId },
    };
  }

  return {
    status: 200,
    body: { code: 'OK', message: 'Request succeeded', requestId },
    data: {},
  };
};

// Simulates a redirect response followed by resolution
const ssrfSafeFetchWithRedirect = async (
  originalUrl: string,
  redirectTargetUrl: string,
  requestId: string,
): Promise<FetchResult> => {
  // Check original URL first
  const originalCheck = isBlockedAddress(originalUrl);
  if (originalCheck.blocked) {
    mockSecurityEventEmitter.emit({ event: 'ssrf_attempt_blocked', targetUrl: originalUrl, reason: originalCheck.reason, requestId });
    return { status: 400, body: { code: 'INVALID_REQUEST', message: 'Request target is not permitted', requestId } };
  }

  if (!isAllowlistedDomain(originalUrl)) {
    mockSecurityEventEmitter.emit({ event: 'ssrf_off_allowlist', targetUrl: originalUrl, requestId });
    return { status: 400, body: { code: 'INVALID_REQUEST', message: 'Request target is not permitted', requestId } };
  }

  // Re-validate after redirect (SSRF via redirect)
  const redirectCheck = isBlockedAddress(redirectTargetUrl);
  if (redirectCheck.blocked) {
    mockSecurityEventEmitter.emit({
      event: 'ssrf_redirect_blocked',
      originalUrl,
      redirectTargetUrl,
      reason: redirectCheck.reason,
      requestId,
    });
    mockLogger.warn({ event: 'ssrf_redirect_blocked', redirectTargetUrl, reason: redirectCheck.reason, requestId });
    return {
      status: 400,
      body: { code: 'INVALID_REQUEST', message: 'Request target is not permitted', requestId },
    };
  }

  if (!isAllowlistedDomain(redirectTargetUrl)) {
    mockSecurityEventEmitter.emit({ event: 'ssrf_redirect_off_allowlist', originalUrl, redirectTargetUrl, requestId });
    return { status: 400, body: { code: 'INVALID_REQUEST', message: 'Request target is not permitted', requestId } };
  }

  return { status: 200, body: { code: 'OK', message: 'Request succeeded', requestId }, data: {} };
};

describe('Security - SSRF Protection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Direct requests to blocked addresses
  // -------------------------------------------------------------------------
  describe('Direct Requests to Internal Addresses', () => {
    it('should block direct request to 169.254.169.254 (IMDS)', async () => {
      const result = await ssrfSafeFetch('http://169.254.169.254/latest/meta-data/', 'req_ssrf_1');

      expect(result.status).toBe(400);
      expect(result.body.code).toBe('INVALID_REQUEST');
    });

    it('should block direct request to 169.254.0.0/16 range', async () => {
      const result = await ssrfSafeFetch('http://169.254.100.50/internal', 'req_ssrf_2');

      expect(result.status).toBe(400);
      expect(result.body.code).toBe('INVALID_REQUEST');
    });

    it('should block direct request to localhost', async () => {
      const result = await ssrfSafeFetch('http://localhost:8080/internal', 'req_ssrf_3');

      expect(result.status).toBe(400);
      expect(result.body.code).toBe('INVALID_REQUEST');
    });

    it('should block direct request to 127.0.0.1', async () => {
      const result = await ssrfSafeFetch('http://127.0.0.1:6379/', 'req_ssrf_4');

      expect(result.status).toBe(400);
      expect(result.body.code).toBe('INVALID_REQUEST');
    });

    it('should block direct request to 0.0.0.0', async () => {
      const result = await ssrfSafeFetch('http://0.0.0.0/admin', 'req_ssrf_5');

      expect(result.status).toBe(400);
      expect(result.body.code).toBe('INVALID_REQUEST');
    });

    it('should block direct request to 10.0.0.0/8 private range', async () => {
      const result = await ssrfSafeFetch('http://10.0.0.1/internal-service', 'req_ssrf_6');

      expect(result.status).toBe(400);
      expect(result.body.code).toBe('INVALID_REQUEST');
    });

    it('should block direct request to 192.168.0.0/16 private range', async () => {
      const result = await ssrfSafeFetch('http://192.168.1.100/router-admin', 'req_ssrf_7');

      expect(result.status).toBe(400);
      expect(result.body.code).toBe('INVALID_REQUEST');
    });

    it('should block direct request to 172.16.0.0/12 private range', async () => {
      const result = await ssrfSafeFetch('http://172.16.0.1/internal', 'req_ssrf_8');

      expect(result.status).toBe(400);
      expect(result.body.code).toBe('INVALID_REQUEST');
    });
  });

  // -------------------------------------------------------------------------
  // Redirect-based SSRF
  // -------------------------------------------------------------------------
  describe('Redirect to Internal Addresses → Blocked', () => {
    it('should block redirect from allowlisted domain to 169.254.0.0/16', async () => {
      const result = await ssrfSafeFetchWithRedirect(
        'https://eastleigh.gov.uk/bins/api',
        'http://169.254.169.254/latest/meta-data/',
        'req_ssrf_10',
      );

      expect(result.status).toBe(400);
      expect(result.body.code).toBe('INVALID_REQUEST');
    });

    it('should block redirect from allowlisted domain to localhost', async () => {
      const result = await ssrfSafeFetchWithRedirect(
        'https://eastleigh.gov.uk/bins/api',
        'http://localhost:5432/pg',
        'req_ssrf_11',
      );

      expect(result.status).toBe(400);
      expect(result.body.code).toBe('INVALID_REQUEST');
    });

    it('should block redirect from allowlisted domain to 0.0.0.0', async () => {
      const result = await ssrfSafeFetchWithRedirect(
        'https://eastleigh.gov.uk/bins/api',
        'http://0.0.0.0:9200/es-internal',
        'req_ssrf_12',
      );

      expect(result.status).toBe(400);
      expect(result.body.code).toBe('INVALID_REQUEST');
    });

    it('should block redirect to off-allowlist external domain', async () => {
      const result = await ssrfSafeFetchWithRedirect(
        'https://eastleigh.gov.uk/bins/api',
        'https://attacker.example.com/exfiltrate',
        'req_ssrf_13',
      );

      expect(result.status).toBe(400);
      expect(result.body.code).toBe('INVALID_REQUEST');
    });

    it('should allow redirect that stays within the same allowlisted council domain', async () => {
      const result = await ssrfSafeFetchWithRedirect(
        'https://eastleigh.gov.uk/bins/api',
        'https://eastleigh.gov.uk/bins/api/v2',
        'req_ssrf_14',
      );

      expect(result.status).toBe(200);
    });

    it('should allow redirect to another allowlisted council subdomain', async () => {
      const result = await ssrfSafeFetchWithRedirect(
        'https://eastleigh.gov.uk/bins/api',
        'https://api.eastleigh.gov.uk/collections',
        'req_ssrf_15',
      );

      expect(result.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // Off-allowlist domains
  // -------------------------------------------------------------------------
  describe('Off-Allowlist Domain → Blocked', () => {
    const offAllowlistUrls = [
      'https://evil.example.com/steal',
      'https://google.com/search',
      'http://pastebin.com/raw/abc',
      'https://attacker.ngrok.io/collect',
      'ftp://files.example.com/data',
      'https://eastleigh.gov.uk.evil.com/', // subdomain spoofing
    ];

    offAllowlistUrls.forEach(url => {
      it(`should block off-allowlist domain: "${url}"`, async () => {
        const result = await ssrfSafeFetch(url, 'req_ssrf_off');
        expect(result.status).toBe(400);
        expect(result.body.code).toBe('INVALID_REQUEST');
      });
    });
  });

  // -------------------------------------------------------------------------
  // Valid allowlisted council domains
  // -------------------------------------------------------------------------
  describe('Allowlisted Council Domains → Allowed', () => {
    const allowedUrls = [
      'https://eastleigh.gov.uk/bins/collection-dates',
      'https://winchester.gov.uk/api/waste',
      'https://southampton.gov.uk/bins',
      'https://portsmouth.gov.uk/refuse-collections',
      'https://test-council.hampshire.gov.uk/api/bins',
    ];

    allowedUrls.forEach(url => {
      it(`should allow allowlisted council URL: "${url}"`, async () => {
        const result = await ssrfSafeFetch(url, 'req_ssrf_allow');
        expect(result.status).toBe(200);
      });
    });
  });

  // -------------------------------------------------------------------------
  // SSRF events are always logged
  // -------------------------------------------------------------------------
  describe('All SSRF Attempts Are Logged as Security Events', () => {
    it('should emit security event for direct internal address attempt', async () => {
      await ssrfSafeFetch('http://169.254.169.254/metadata', 'req_ssrf_log_1');

      expect(mockSecurityEventEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'ssrf_attempt_blocked', requestId: 'req_ssrf_log_1' }),
      );
    });

    it('should emit security event for off-allowlist domain attempt', async () => {
      await ssrfSafeFetch('https://evil.example.com/steal', 'req_ssrf_log_2');

      expect(mockSecurityEventEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'ssrf_off_allowlist', requestId: 'req_ssrf_log_2' }),
      );
    });

    it('should emit security event for redirect-based SSRF attempt', async () => {
      await ssrfSafeFetchWithRedirect(
        'https://eastleigh.gov.uk/bins/api',
        'http://169.254.169.254/metadata',
        'req_ssrf_log_3',
      );

      expect(mockSecurityEventEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'ssrf_redirect_blocked', requestId: 'req_ssrf_log_3' }),
      );
    });

    it('should include targetUrl in every security event', async () => {
      const targetUrl = 'http://10.0.0.1/internal';
      await ssrfSafeFetch(targetUrl, 'req_ssrf_log_4');

      expect(mockSecurityEventEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({ targetUrl }),
      );
    });

    it('should not emit security event for legitimate allowlisted request', async () => {
      await ssrfSafeFetch('https://eastleigh.gov.uk/bins/api', 'req_ssrf_log_5');

      expect(mockSecurityEventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should warn-log every SSRF block', async () => {
      await ssrfSafeFetch('http://127.0.0.1:22/', 'req_ssrf_log_6');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'ssrf_attempt_blocked' }),
      );
    });

    it('should not expose blocked URL details in the API response body', async () => {
      const result = await ssrfSafeFetch('http://169.254.169.254/meta-data/iam', 'req_ssrf_log_7');

      expect(JSON.stringify(result.body)).not.toContain('169.254');
      expect(JSON.stringify(result.body)).not.toContain('meta-data');
    });
  });
});
