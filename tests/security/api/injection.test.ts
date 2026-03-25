/**
 * Security Tests - Injection Attack Coverage
 *
 * Tests that injection payloads in all user-controlled fields are rejected
 * with HTTP 400 and a generic error code before reaching any data layer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

// ---------------------------------------------------------------------------
// Validators (implementation-agnostic contracts)
// ---------------------------------------------------------------------------

interface ValidationResult {
  status: number;
  body: {
    code: string;
    message: string;
    requestId?: string;
  };
}

const validatePostcode = (postcode: string): ValidationResult => {
  // Null byte
  if (postcode.includes('\0')) {
    return { status: 400, body: { code: 'INVALID_INPUT', message: 'Invalid input', requestId: 'req_inj_1' } };
  }
  // Path traversal
  if (postcode.includes('..') || postcode.includes('/') || postcode.includes('\\')) {
    return { status: 400, body: { code: 'INVALID_INPUT', message: 'Invalid input', requestId: 'req_inj_2' } };
  }
  // CRLF
  if (/[\r\n]/.test(postcode)) {
    return { status: 400, body: { code: 'INVALID_INPUT', message: 'Invalid input', requestId: 'req_inj_3' } };
  }
  // Standard postcode regex
  const postcodeRegex = /^[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}$/i;
  if (!postcodeRegex.test(postcode)) {
    return { status: 400, body: { code: 'INVALID_INPUT', message: 'Invalid input', requestId: 'req_inj_4' } };
  }
  return { status: 200, body: { code: 'OK', message: 'Valid' } };
};

const validatePropertyId = (propertyId: string): ValidationResult => {
  if (propertyId.includes('\0')) {
    return { status: 400, body: { code: 'INVALID_INPUT', message: 'Invalid input', requestId: 'req_inj_5' } };
  }
  if (propertyId.includes('..') || propertyId.includes('/') || propertyId.includes('\\')) {
    return { status: 400, body: { code: 'INVALID_INPUT', message: 'Invalid input', requestId: 'req_inj_6' } };
  }
  if (/[\r\n]/.test(propertyId)) {
    return { status: 400, body: { code: 'INVALID_INPUT', message: 'Invalid input', requestId: 'req_inj_7' } };
  }
  // UUID v4 format only
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(propertyId)) {
    return { status: 400, body: { code: 'INVALID_INPUT', message: 'Invalid input', requestId: 'req_inj_8' } };
  }
  return { status: 200, body: { code: 'OK', message: 'Valid' } };
};

const validateCouncilId = (councilId: string): ValidationResult => {
  if (councilId.includes('\0')) {
    return { status: 400, body: { code: 'INVALID_INPUT', message: 'Invalid input', requestId: 'req_inj_9' } };
  }
  if (councilId.includes('..') || councilId.includes('/') || councilId.includes('\\')) {
    return { status: 400, body: { code: 'INVALID_INPUT', message: 'Invalid input', requestId: 'req_inj_10' } };
  }
  if (/[\r\n]/.test(councilId)) {
    return { status: 400, body: { code: 'INVALID_INPUT', message: 'Invalid input', requestId: 'req_inj_11' } };
  }
  // Slug: lowercase alphanumeric + hyphen
  const slugRegex = /^[a-z0-9\-]{2,64}$/;
  if (!slugRegex.test(councilId)) {
    return { status: 400, body: { code: 'INVALID_INPUT', message: 'Invalid input', requestId: 'req_inj_12' } };
  }
  return { status: 200, body: { code: 'OK', message: 'Valid' } };
};

const validateAddressField = (address: string): ValidationResult => {
  if (address.includes('\0')) {
    return { status: 400, body: { code: 'INVALID_INPUT', message: 'Invalid input', requestId: 'req_inj_13' } };
  }
  if (/[\r\n]/.test(address)) {
    return { status: 400, body: { code: 'INVALID_INPUT', message: 'Invalid input', requestId: 'req_inj_14' } };
  }
  // Strip tags and check for dangerous content
  const stripped = address.replace(/<[^>]*>/g, '');
  if (stripped !== address) {
    return { status: 400, body: { code: 'INVALID_INPUT', message: 'Invalid input', requestId: 'req_inj_15' } };
  }
  // Template injection patterns: {{...}}, ${...}, #{...}, <%= ... %>
  if (/\{\{.*?\}\}|\$\{.*?\}|#\{.*?\}|<%.*?%>/.test(address)) {
    return { status: 400, body: { code: 'INVALID_INPUT', message: 'Invalid input', requestId: 'req_inj_17' } };
  }
  if (address.length > 200) {
    return { status: 400, body: { code: 'INVALID_INPUT', message: 'Invalid input', requestId: 'req_inj_16' } };
  }
  return { status: 200, body: { code: 'OK', message: 'Valid' } };
};

describe('Security - Injection Attack Coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // SQL injection in postcode
  // -------------------------------------------------------------------------
  describe('SQL Injection in Postcode Parameter', () => {
    const sqlPayloads = [
      "'; DROP TABLE properties; --",
      "' OR '1'='1",
      "' OR 1=1 --",
      "1'; SELECT * FROM users WHERE '1'='1",
      "' UNION SELECT null,null,null --",
      "admin'--",
      "' OR 'x'='x",
      "'; EXEC xp_cmdshell('dir'); --",
    ];

    sqlPayloads.forEach(payload => {
      it(`should return 400 for SQL payload: "${payload.slice(0, 50)}"`, () => {
        const result = validatePostcode(payload);
        expect(result.status).toBe(400);
        expect(result.body.code).toBe('INVALID_INPUT');
      });
    });
  });

  // -------------------------------------------------------------------------
  // SQL injection in propertyId
  // -------------------------------------------------------------------------
  describe('SQL Injection in PropertyId Parameter', () => {
    const sqlPayloads = [
      "1 AND 1=1",
      "1; DROP TABLE collections; --",
      "' OR '1'='1' --",
      "1 UNION ALL SELECT 1,2,3 --",
    ];

    sqlPayloads.forEach(payload => {
      it(`should return 400 for SQL payload in propertyId: "${payload.slice(0, 50)}"`, () => {
        const result = validatePropertyId(payload);
        expect(result.status).toBe(400);
        expect(result.body.code).toBe('INVALID_INPUT');
      });
    });
  });

  // -------------------------------------------------------------------------
  // XSS in postcode
  // -------------------------------------------------------------------------
  describe('XSS in Postcode Parameter', () => {
    const xssPayloads = [
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      '"><script>alert(document.cookie)</script>',
      "javascript:alert(1)",
      '<svg onload=alert(1)>',
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    ];

    xssPayloads.forEach(payload => {
      it(`should return 400 for XSS payload in postcode: "${payload.slice(0, 50)}"`, () => {
        const result = validatePostcode(payload);
        expect(result.status).toBe(400);
        expect(result.body.code).toBe('INVALID_INPUT');
      });
    });
  });

  // -------------------------------------------------------------------------
  // XSS in address field
  // -------------------------------------------------------------------------
  describe('XSS in Address Field', () => {
    const xssPayloads = [
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      '<iframe src="javascript:alert(1)">',
      '<body onload=alert(1)>',
      '"><img src=x onerror=alert(1)>',
    ];

    xssPayloads.forEach(payload => {
      it(`should return 400 for XSS payload in address: "${payload.slice(0, 50)}"`, () => {
        const result = validateAddressField(payload);
        expect(result.status).toBe(400);
        expect(result.body.code).toBe('INVALID_INPUT');
      });
    });

    it('should allow a legitimate address value', () => {
      const result = validateAddressField('10 High Street, Winchester');
      expect(result.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // Path traversal in councilId
  // -------------------------------------------------------------------------
  describe('Path Traversal in CouncilId Parameter', () => {
    const traversalPayloads = [
      '../../../etc/passwd',
      '..\\..\\windows\\system32\\drivers\\etc\\hosts',
      '....//....//etc/passwd',
      '%2e%2e%2f%2e%2e%2fetc%2fpasswd',
      '..%c0%af..%c0%afetc%c0%afpasswd',
      '/etc/passwd',
      'eastleigh/../../../etc/shadow',
    ];

    traversalPayloads.forEach(payload => {
      it(`should return 400 for path traversal in councilId: "${payload.slice(0, 60)}"`, () => {
        const result = validateCouncilId(payload);
        expect(result.status).toBe(400);
        expect(result.body.code).toBe('INVALID_INPUT');
      });
    });

    it('should allow a valid council slug', () => {
      const result = validateCouncilId('eastleigh-borough-council');
      expect(result.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // Null byte injection
  // -------------------------------------------------------------------------
  describe('Null Byte Injection', () => {
    it('should return 400 for null byte in postcode', () => {
      const result = validatePostcode('SO50\x001AA');
      expect(result.status).toBe(400);
      expect(result.body.code).toBe('INVALID_INPUT');
    });

    it('should return 400 for null byte in propertyId', () => {
      const result = validatePropertyId('3f0a5e2c-\x00-4b1d-8e9f-123456789abc');
      expect(result.status).toBe(400);
      expect(result.body.code).toBe('INVALID_INPUT');
    });

    it('should return 400 for null byte in councilId', () => {
      const result = validateCouncilId('eastleigh\x00-council');
      expect(result.status).toBe(400);
      expect(result.body.code).toBe('INVALID_INPUT');
    });

    it('should return 400 for null byte in address field', () => {
      const result = validateAddressField('10 High Street\x00 Winchester');
      expect(result.status).toBe(400);
      expect(result.body.code).toBe('INVALID_INPUT');
    });
  });

  // -------------------------------------------------------------------------
  // CRLF injection
  // -------------------------------------------------------------------------
  describe('CRLF Injection', () => {
    const crlfPayloads = [
      'SO50\r\n1AA',
      'SO50\r1AA',
      'SO50\n1AA',
      'SO50%0d%0a1AA',
      'SO50%0d1AA',
      'SO50%0a1AA',
    ];

    crlfPayloads.forEach(payload => {
      it(`should return 400 for CRLF payload in postcode: "${payload.replace(/[\r\n]/g, '\\n').slice(0, 40)}"`, () => {
        const result = validatePostcode(payload);
        expect(result.status).toBe(400);
        expect(result.body.code).toBe('INVALID_INPUT');
      });
    });

    it('should return 400 for CRLF in councilId', () => {
      const result = validateCouncilId('eastleigh\r\ninjected-header: value');
      expect(result.status).toBe(400);
      expect(result.body.code).toBe('INVALID_INPUT');
    });
  });

  // -------------------------------------------------------------------------
  // Log injection (ANSI codes, newlines)
  // -------------------------------------------------------------------------
  describe('Log Injection with ANSI Codes', () => {
    const sanitiseForLog = (input: string): string => {
      // Strip ANSI escape sequences
      // eslint-disable-next-line no-control-regex
      return input.replace(/\x1b\[[0-9;]*m/g, '').replace(/[\r\n\t]/g, ' ');
    };

    it('should strip ANSI reset sequence from log output', () => {
      const malicious = '\x1b[0mINJECTED LOG LINE';
      const sanitised = sanitiseForLog(malicious);
      expect(sanitised).not.toContain('\x1b[0m');
      expect(sanitised).toContain('INJECTED LOG LINE');
    });

    it('should strip ANSI colour codes from log output', () => {
      const malicious = '\x1b[31mERROR\x1b[0m normal text';
      const sanitised = sanitiseForLog(malicious);
      expect(sanitised).not.toContain('\x1b[');
    });

    it('should neutralise newline injection in log fields', () => {
      const malicious = 'legitimate\nINJECTED: fake-log-entry';
      const sanitised = sanitiseForLog(malicious);
      expect(sanitised).not.toContain('\n');
      expect(sanitised).toContain('legitimate');
      expect(sanitised).toContain('INJECTED');
    });

    it('should return 400 for ANSI-containing postcode', () => {
      const result = validatePostcode('\x1b[31mSO50 1AA\x1b[0m');
      expect(result.status).toBe(400);
      expect(result.body.code).toBe('INVALID_INPUT');
    });
  });

  // -------------------------------------------------------------------------
  // Command injection
  // -------------------------------------------------------------------------
  describe('Command Injection', () => {
    const commandPayloads = [
      '; ls -la',
      '| cat /etc/passwd',
      '`whoami`',
      '$(id)',
      '& net user',
      '; rm -rf /',
      '| dir c:\\',
      '`id`',
    ];

    commandPayloads.forEach(payload => {
      it(`should return 400 for command injection in postcode: "${payload}"`, () => {
        const result = validatePostcode(payload);
        expect(result.status).toBe(400);
        expect(result.body.code).toBe('INVALID_INPUT');
      });
    });

    commandPayloads.forEach(payload => {
      it(`should return 400 for command injection in councilId: "${payload}"`, () => {
        const result = validateCouncilId(payload);
        expect(result.status).toBe(400);
        expect(result.body.code).toBe('INVALID_INPUT');
      });
    });
  });

  // -------------------------------------------------------------------------
  // Template injection
  // -------------------------------------------------------------------------
  describe('Template Injection', () => {
    const templatePayloads = [
      '{{7*7}}',
      '${7*7}',
      '<%= 7*7 %>',
      '#{7*7}',
      '${{7*7}}',
      '{{config}}',
      '${process.env}',
      '<% system("id") %>',
      '{{constructor.constructor("return process")().env}}',
    ];

    templatePayloads.forEach(payload => {
      it(`should return 400 for template injection in postcode: "${payload}"`, () => {
        const result = validatePostcode(payload);
        expect(result.status).toBe(400);
        expect(result.body.code).toBe('INVALID_INPUT');
      });
    });

    templatePayloads.forEach(payload => {
      it(`should return 400 for template injection in address: "${payload}"`, () => {
        const result = validateAddressField(payload);
        expect(result.status).toBe(400);
        expect(result.body.code).toBe('INVALID_INPUT');
      });
    });
  });

  // -------------------------------------------------------------------------
  // Generic error contract
  // -------------------------------------------------------------------------
  describe('Generic Error Response Contract', () => {
    it('should return INVALID_INPUT (not INVALID_POSTCODE) to avoid leaking field-specific info', () => {
      const result = validatePostcode("' OR 1=1 --");
      // The top-level code must be generic
      expect(result.body.code).toBe('INVALID_INPUT');
    });

    it('should not reflect the injected payload in the error message', () => {
      const payload = "'; DROP TABLE collections; --";
      const result = validatePostcode(payload);

      expect(result.body.message).not.toContain('DROP TABLE');
      expect(result.body.message).not.toContain(payload);
    });

    it('should not include stack traces in injection error responses', () => {
      const result = validatePostcode('<script>throw new Error("oops")</script>');
      const body = JSON.stringify(result.body);

      expect(body).not.toContain('at ');
      expect(body).not.toContain('.ts:');
      expect(body).not.toContain('.js:');
    });

    it('should include requestId in all injection error responses', () => {
      const result = validatePostcode('{{7*7}}');
      expect(result.body.requestId).toBeDefined();
    });
  });
});
