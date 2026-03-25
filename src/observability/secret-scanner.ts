/**
 * Hampshire Bin Collection Data Platform
 * Secret Detection and Redaction
 * 
 * Scans content for sensitive credentials and API keys.
 * Used by audit logs, evidence storage, and error reporting.
 * 
 * @module observability/secret-scanner
 */

/**
 * Platform-specific secret patterns
 * These are the formats used by the Hampshire Bin Platform API keys
 */
export const SECRET_PATTERNS = [
  // Stripe-style live keys (sk_live_...)
  /sk_live_[A-Za-z0-9]{20,}/g,
  
  // Hampshire Bin Platform live keys (hbp_live_...)
  /hbp_live_[A-Za-z0-9]{20,}/g,
  
  // Hampshire Bin Platform test keys (hbp_test_...)
  /hbp_test_[A-Za-z0-9]{20,}/g,
  
  // Generic API key patterns (api_key=...)
  /api_key\s*=\s*[A-Za-z0-9_\-]{16,}/gi,
  
  // Bearer tokens
  /bearer\s+[A-Za-z0-9_\-]{20,}/gi,
  
  // Generic password patterns
  /password\s*[=:]\s*[^\s&]+/gi,
  
  // Generic secret patterns
  /secret\s*[=:]\s*[^\s&]+/gi,
  
  // Connection strings
  /postgres:\/\/[^@]+@[^\s]+/gi,
  /mysql:\/\/[^@]+@[^\s]+/gi,
  /mongodb:\/\/[^@]+@[^\s]+/gi,
  /redis:\/\/[^@]+@[^\s]+/gi,
];

/**
 * Scan content for potential secrets
 * Returns array of secret patterns found (not the actual secret values)
 */
export function scanForSecrets(content: string): string[] {
  const findings: string[] = [];
  
  SECRET_PATTERNS.forEach((pattern, index) => {
    if (pattern.test(content)) {
      findings.push(`pattern_${index}`);
    }
    // Reset regex state
    pattern.lastIndex = 0;
  });
  
  return findings;
}

/**
 * Redact secrets from a string
 * Replaces detected secrets with [REDACTED]
 */
export function redactSecrets(message: string): string {
  let redacted = message;
  
  // Redact known secret patterns
  redacted = redacted.replace(/password\s*=\s*[^\s&]+/gi, 'password=[REDACTED]');
  redacted = redacted.replace(/api_key\s*=\s*[^\s&]+/gi, 'api_key=[REDACTED]');
  redacted = redacted.replace(/secret\s*=\s*[^\s&]+/gi, 'secret=[REDACTED]');
  redacted = redacted.replace(/bearer\s+[A-Za-z0-9_\-]{20,}/gi, 'bearer [REDACTED]');
  redacted = redacted.replace(/sk_live_[A-Za-z0-9]{20,}/g, 'sk_live_[REDACTED]');
  redacted = redacted.replace(/hbp_live_[A-Za-z0-9]{20,}/g, 'hbp_live_[REDACTED]');
  redacted = redacted.replace(/hbp_test_[A-Za-z0-9]{20,}/g, 'hbp_test_[REDACTED]');
  
  // Redact connection strings
  redacted = redacted.replace(/postgres:\/\/[^@]+@/gi, 'postgres://[REDACTED]@');
  redacted = redacted.replace(/mysql:\/\/[^@]+@/gi, 'mysql://[REDACTED]@');
  redacted = redacted.replace(/mongodb:\/\/[^@]+@/gi, 'mongodb://[REDACTED]@');
  redacted = redacted.replace(/redis:\/\/[^@]+@/gi, 'redis://[REDACTED]@');
  
  return redacted;
}

/**
 * Scan log content for leaked secrets
 * Returns actual matched secret strings (for testing/alerting)
 */
export function scanLogForSecrets(logContent: string): string[] {
  const secretPatterns = [
    /hbp_(test|live)_[a-zA-Z0-9]{32}/g,
    /password\s*=\s*[^&\s]+/gi,
    /bearer\s+[a-z0-9]{20,}/gi,
    /sk_[a-z]+_[a-z0-9]{20,}/gi,
  ];
  
  const findings: string[] = [];
  
  secretPatterns.forEach((pattern) => {
    const matches = logContent.match(pattern);
    if (matches) {
      findings.push(...matches);
    }
  });
  
  return findings;
}

/**
 * Sanitize error messages to remove internal file paths
 */
export function sanitizeErrorMessage(message: string): string {
  // Remove Unix/Linux file paths
  let sanitized = message.replace(/\/[\w\/.-]+\.(ts|js|json)/g, '[FILE]');
  
  // Remove Windows file paths
  sanitized = sanitized.replace(/[A-Z]:\\[\w\\.-]+\.(ts|js|json)/gi, '[FILE]');
  
  // Remove stack trace line numbers
  sanitized = sanitized.replace(/at .+:\d+:\d+/g, '');
  
  return sanitized;
}

/**
 * Sanitize house parameter (preserves commas, strips dangerous content)
 */
export function sanitizeHouseParam(house: string | undefined): string {
  if (!house) return '';
  
  // First remove HTML tags
  let clean = house.replace(/<[^>]*>/g, '');
  
  // Remove dangerous JavaScript/XSS keywords
  clean = clean.replace(/\balert\b/gi, '');
  clean = clean.replace(/\beval\b/gi, '');
  clean = clean.replace(/\bprompt\b/gi, '');
  clean = clean.replace(/\bconfirm\b/gi, '');
  clean = clean.replace(/document\.cookie/gi, '');
  clean = clean.replace(/document\.write/gi, '');
  clean = clean.replace(/window\.location/gi, '');
  clean = clean.replace(/javascript:/gi, '');
  
  // Truncate to reasonable length
  clean = clean.slice(0, 50);
  
  // Only allow alphanumeric, spaces, commas, hyphens
  clean = clean.replace(/[^a-zA-Z0-9\s,\-]/g, '');
  
  return clean.trim();
}

/**
 * Sanitize postcode input (for form adapters)
 * Strips SQL injection attempts while preserving valid postcode chars
 */
export function sanitizePostcodeInput(postcode: string): string {
  // Remove all non-alphanumeric except spaces
  let clean = postcode.replace(/[^A-Z0-9\s]/gi, '').toUpperCase().trim();
  
  // Strip SQL keywords that might remain after char removal
  const sqlKeywords = [
    'DROP', 'TABLE', 'DELETE', 'UPDATE', 'INSERT', 'SELECT',
    'UNION', 'WHERE', 'FROM', 'JOIN', 'EXEC', 'EXECUTE',
    'SCRIPT', 'ALERT', 'EVAL'
  ];
  
  for (const keyword of sqlKeywords) {
    // Remove the keyword but preserve spacing
    clean = clean.replace(new RegExp(`\\b${keyword}\\b`, 'gi'), '');
  }
  
  // Collapse multiple spaces
  clean = clean.replace(/\s+/g, ' ').trim();
  
  return clean;
}
