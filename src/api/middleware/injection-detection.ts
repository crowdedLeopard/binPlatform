/**
 * Hampshire Bin Collection Data Platform
 * Injection Detection Middleware
 *
 * Detects and blocks common injection patterns in path params and query strings.
 * Logs to audit trail as SECURITY_INJECTION_ATTEMPT when detected.
 * Returns 400 INVALID_INPUT without revealing detection logic.
 *
 * CRITICAL: Patterns should be configurable, not hardcoded for production.
 *
 * @module api/middleware/injection-detection
 */

import type { Context, Next } from 'hono';
import { auditLogger } from '../../observability/audit.js';
import { logger } from '../../observability/logger.js';

// =============================================================================
// INJECTION PATTERNS
// =============================================================================

/**
 * SQL injection keywords and patterns.
 * These are common signatures seen in SQL injection attempts.
 */
const SQL_INJECTION_PATTERNS = [
  // SQL keywords
  /\b(union|select|insert|update|delete|drop|create|alter|exec|execute|script|javascript)\b/i,
  
  // SQL comment markers
  /-{2,}/, // SQL comment --
  /\/\*/, // Multi-line comment /*
  
  // SQL string escape attempts
  /['"]\s*(or|and)\s*['"]/i,
  /['"]\s*=\s*['"]/,
  
  // Common SQL injection patterns
  /1\s*=\s*1/,
  /1\s*or\s*1/i,
  /'\s*or\s*'1/i,
];

/**
 * XSS (Cross-Site Scripting) patterns.
 */
const XSS_PATTERNS = [
  // Script tags
  /<script/i,
  /<\/script>/i,
  
  // Event handlers
  /on\w+\s*=/i, // onerror=, onclick=, etc.
  
  // JavaScript protocol
  /javascript:/i,
  
  // Data URIs with scripts
  /data:text\/html/i,
  
  // Common XSS vectors
  /<iframe/i,
  /<embed/i,
  /<object/i,
];

/**
 * Path traversal patterns.
 */
const PATH_TRAVERSAL_PATTERNS = [
  // Directory traversal
  /\.\.\//,  // ../
  /\.\.\\/,  // ..\
  /\.\.%2f/i, // URL-encoded ../
  /\.\.%5c/i, // URL-encoded ..\
  
  // Absolute path attempts
  /^\/etc\//i,
  /^\/proc\//i,
  /^\/sys\//i,
  /^c:\\/i,
  /^\\\\/, // UNC paths
];

/**
 * Null byte injection.
 */
const NULL_BYTE_PATTERNS = [
  /\x00/, // Null byte
  /%00/i, // URL-encoded null byte
];

/**
 * CRLF injection (HTTP header splitting).
 */
const CRLF_PATTERNS = [
  /\r\n/, // CRLF
  /%0d%0a/i, // URL-encoded CRLF
  /%0a/i, // LF
  /%0d/i, // CR
];

/**
 * All injection patterns combined.
 */
const ALL_PATTERNS = [
  ...SQL_INJECTION_PATTERNS,
  ...XSS_PATTERNS,
  ...PATH_TRAVERSAL_PATTERNS,
  ...NULL_BYTE_PATTERNS,
  ...CRLF_PATTERNS,
];

// =============================================================================
// DETECTION LOGIC
// =============================================================================

/**
 * Check if a string matches any injection pattern.
 */
function containsInjectionPattern(value: string): {
  detected: boolean;
  patternType?: string;
} {
  // SQL injection
  for (const pattern of SQL_INJECTION_PATTERNS) {
    if (pattern.test(value)) {
      return { detected: true, patternType: 'sql_injection' };
    }
  }
  
  // XSS
  for (const pattern of XSS_PATTERNS) {
    if (pattern.test(value)) {
      return { detected: true, patternType: 'xss' };
    }
  }
  
  // Path traversal
  for (const pattern of PATH_TRAVERSAL_PATTERNS) {
    if (pattern.test(value)) {
      return { detected: true, patternType: 'path_traversal' };
    }
  }
  
  // Null byte
  for (const pattern of NULL_BYTE_PATTERNS) {
    if (pattern.test(value)) {
      return { detected: true, patternType: 'null_byte' };
    }
  }
  
  // CRLF
  for (const pattern of CRLF_PATTERNS) {
    if (pattern.test(value)) {
      return { detected: true, patternType: 'crlf_injection' };
    }
  }
  
  return { detected: false };
}

/**
 * Scan all request inputs for injection patterns.
 */
function scanRequest(c: Context): {
  detected: boolean;
  location?: string;
  patternType?: string;
  value?: string;
} {
  // Check path parameters
  const pathParams = c.req.param();
  for (const [key, value] of Object.entries(pathParams)) {
    if (typeof value === 'string') {
      const result = containsInjectionPattern(value);
      if (result.detected) {
        return {
          detected: true,
          location: `path.${key}`,
          patternType: result.patternType,
          value,
        };
      }
    }
  }
  
  // Check query parameters
  const queryParams = c.req.query();
  for (const [key, value] of Object.entries(queryParams)) {
    if (typeof value === 'string') {
      const result = containsInjectionPattern(value);
      if (result.detected) {
        return {
          detected: true,
          location: `query.${key}`,
          patternType: result.patternType,
          value,
        };
      }
    }
  }
  
  // Check headers (limited set - not all headers)
  // Only check headers that could be reflected or processed
  const suspiciousHeaders = ['x-forwarded-for', 'referer', 'user-agent'];
  for (const headerName of suspiciousHeaders) {
    const headerValue = c.req.header(headerName);
    if (headerValue) {
      const result = containsInjectionPattern(headerValue);
      if (result.detected) {
        return {
          detected: true,
          location: `header.${headerName}`,
          patternType: result.patternType,
          value: headerValue.substring(0, 100), // Truncate for logging
        };
      }
    }
  }
  
  return { detected: false };
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Injection detection middleware.
 * Runs before route handlers to detect and block injection attempts.
 */
export async function injectionDetection(c: Context, next: Next): Promise<Response | void> {
  const scan = scanRequest(c);
  
  if (scan.detected) {
    // Get client IP (anonymised in audit log)
    const clientIp = c.req.header('x-forwarded-for')?.split(',')[0].trim()
      || c.req.header('x-real-ip')
      || 'unknown';
    
    // Log to audit trail
    auditLogger.logSecurityEvent(
      'injection_attempt',
      'critical',
      {
        description: `Injection pattern detected in ${scan.location}`,
        councilId: c.req.param('councilId'),
      },
    );
    
    // Log details (not in audit trail, in application log)
    logger.warn({
      location: scan.location,
      patternType: scan.patternType,
      clientIp,
      path: c.req.path,
      method: c.req.method,
      // DO NOT log the actual malicious value in production
      // valuePreview: scan.value?.substring(0, 50),
    }, 'Injection attempt blocked');
    
    // Return generic error (do not reveal detection logic)
    return c.json(
      {
        error: 'INVALID_INPUT',
        message: 'Request contains invalid input',
      },
      400,
    );
  }
  
  // No injection detected, continue
  await next();
}

/**
 * Strict injection detection for admin endpoints.
 * More aggressive patterns for privileged endpoints.
 */
export async function strictInjectionDetection(c: Context, next: Next): Promise<Response | void> {
  // Use same detection for now, but could add additional patterns
  // or lower thresholds for admin endpoints
  return injectionDetection(c, next);
}
