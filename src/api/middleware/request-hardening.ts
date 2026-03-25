/**
 * Hampshire Bin Collection Data Platform
 * Request Hardening Middleware
 * 
 * Applies security controls to all incoming requests:
 * - Request size limits (10KB max for council IDs which are short)
 * - Content-Type enforcement (only application/json for POST/PATCH/PUT)
 * - Strict URL path validation (only alphanumeric, hyphens, underscores)
 * - Request ID injection (UUID v4 if not present)
 * - Timeout enforcement (30s hard limit per request)
 * - User-Agent logging (for abuse analysis)
 * - HTTP method validation (405 for unexpected methods, not 404)
 * 
 * @module api/middleware/request-hardening
 */

import type { Context, Next } from 'hono';
import { randomUUID } from 'node:crypto';
import { ApiError, ErrorCode } from '../errors.js';

// Security limits
const MAX_REQUEST_SIZE_BYTES = 10 * 1024; // 10KB
const REQUEST_TIMEOUT_MS = 30 * 1000; // 30 seconds
const ALLOWED_CONTENT_TYPES = ['application/json'];

/**
 * Validate path parameters contain only safe characters
 * Prevents path traversal and injection attempts
 */
function validatePathParams(path: string): boolean {
  // Extract path parameters (anything after /v1/)
  const pathMatch = path.match(/\/v1\/(.+)/);
  if (!pathMatch) return true; // Root paths are fine
  
  const pathSegments = pathMatch[1].split('/');
  
  for (const segment of pathSegments) {
    // Allow alphanumeric, hyphens, underscores only
    // Also allow query strings (will be parsed separately)
    const cleanSegment = segment.split('?')[0];
    
    // Skip empty segments
    if (!cleanSegment) continue;
    
    // Check for invalid characters
    if (!/^[a-zA-Z0-9\-_\.]+$/.test(cleanSegment)) {
      return false;
    }
    
    // Reject path traversal attempts
    if (cleanSegment.includes('..')) {
      return false;
    }
    
    // Reject encoded path separators
    if (cleanSegment.includes('%2F') || cleanSegment.includes('%5C')) {
      return false;
    }
  }
  
  return true;
}

/**
 * Validate Content-Type for methods that accept body
 */
function validateContentType(method: string, contentType: string | undefined): boolean {
  const methodsWithBody = ['POST', 'PUT', 'PATCH'];
  
  if (!methodsWithBody.includes(method)) {
    return true; // No body expected
  }
  
  if (!contentType) {
    return false; // Body expected but no Content-Type
  }
  
  // Extract base content type (ignore charset)
  const baseContentType = contentType.split(';')[0].trim().toLowerCase();
  
  return ALLOWED_CONTENT_TYPES.includes(baseContentType);
}

/**
 * Inject or validate request ID
 * Ensures every request has a correlation ID for tracing
 */
function ensureRequestId(c: Context): string {
  // Check if already present in header
  const headerRequestId = c.req.header('X-Request-ID');
  
  if (headerRequestId) {
    // Validate format (must be UUID v4)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    
    if (uuidRegex.test(headerRequestId)) {
      return headerRequestId;
    }
    
    // Invalid format - generate new one
    console.warn('Invalid X-Request-ID format, generating new ID', {
      provided: headerRequestId,
    });
  }
  
  // Generate new UUID v4
  return randomUUID();
}

/**
 * Extract and sanitise User-Agent for logging
 */
function extractUserAgent(c: Context): string {
  const ua = c.req.header('User-Agent') || 'unknown';
  
  // Truncate to prevent log injection
  return ua.substring(0, 200);
}

/**
 * Check if request size exceeds limit
 * Note: This is a heuristic check since body might not be fully loaded yet
 */
async function validateRequestSize(c: Context): Promise<boolean> {
  const contentLength = c.req.header('Content-Length');
  
  if (!contentLength) {
    // No Content-Length header - we'll check body size after parsing
    return true;
  }
  
  const size = parseInt(contentLength, 10);
  
  if (isNaN(size)) {
    return false; // Invalid Content-Length
  }
  
  return size <= MAX_REQUEST_SIZE_BYTES;
}

/**
 * Validate HTTP method against allowed methods for the route
 */
function validateHttpMethod(c: Context, allowedMethods: string[]): boolean {
  const method = c.req.method;
  
  // OPTIONS is always allowed (CORS preflight)
  if (method === 'OPTIONS') {
    return true;
  }
  
  return allowedMethods.includes(method);
}

/**
 * Request hardening middleware
 * 
 * Applies security controls before request reaches route handlers.
 */
export function requestHardening() {
  return async (c: Context, next: Next) => {
    const startTime = Date.now();
    
    // 1. Inject/validate request ID
    const requestId = ensureRequestId(c);
    c.set('requestId', requestId);
    
    // Set request ID in response header for client correlation
    c.header('X-Request-ID', requestId);
    
    // 2. Validate path parameters
    if (!validatePathParams(c.req.path)) {
      throw new ApiError(
        ErrorCode.INVALID_REQUEST,
        'Invalid characters in URL path',
        400,
        { hint: 'Only alphanumeric, hyphens, and underscores allowed in path parameters' },
        requestId
      );
    }
    
    // 3. Validate request size
    const sizeValid = await validateRequestSize(c);
    if (!sizeValid) {
      throw new ApiError(
        ErrorCode.INVALID_REQUEST,
        'Request size exceeds maximum allowed size',
        413,
        { maxSizeBytes: MAX_REQUEST_SIZE_BYTES },
        requestId
      );
    }
    
    // 4. Validate Content-Type for methods with body
    const method = c.req.method;
    const contentType = c.req.header('Content-Type');
    
    if (!validateContentType(method, contentType)) {
      throw new ApiError(
        ErrorCode.INVALID_REQUEST,
        'Invalid or missing Content-Type header',
        415,
        { 
          hint: 'Use Content-Type: application/json for POST/PUT/PATCH requests',
          allowedTypes: ALLOWED_CONTENT_TYPES,
        },
        requestId
      );
    }
    
    // 5. Log User-Agent (non-blocking, for abuse analysis)
    const userAgent = extractUserAgent(c);
    c.set('userAgent', userAgent);
    
    // Log request metadata
    console.info({
      level: 'info',
      type: 'request',
      requestId,
      method,
      path: c.req.path,
      userAgent,
      ip: c.req.header('X-Forwarded-For') || c.req.header('X-Real-IP') || 'unknown',
      timestamp: new Date().toISOString(),
    });
    
    // 6. Set timeout for request processing
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(
          new ApiError(
            ErrorCode.INTERNAL_ERROR,
            'Request timeout exceeded',
            504,
            { timeoutMs: REQUEST_TIMEOUT_MS },
            requestId
          )
        );
      }, REQUEST_TIMEOUT_MS);
    });
    
    try {
      // Race between request processing and timeout
      await Promise.race([next(), timeoutPromise]);
      
      // Log successful completion
      const duration = Date.now() - startTime;
      console.info({
        level: 'info',
        type: 'response',
        requestId,
        method,
        path: c.req.path,
        status: c.res.status,
        durationMs: duration,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      // Log error (full error handling done by error-handler middleware)
      const duration = Date.now() - startTime;
      console.error({
        level: 'error',
        type: 'request_error',
        requestId,
        method,
        path: c.req.path,
        durationMs: duration,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });
      
      throw error;
    }
  };
}

/**
 * Method validation middleware
 * 
 * Returns 405 Method Not Allowed for unexpected HTTP methods.
 * Prevents path enumeration by returning 405 instead of 404.
 */
export function methodValidation(allowedMethods: string[]) {
  return async (c: Context, next: Next) => {
    const requestId = c.get('requestId') || randomUUID();
    
    if (!validateHttpMethod(c, allowedMethods)) {
      const method = c.req.method;
      
      throw new ApiError(
        ErrorCode.INVALID_REQUEST,
        `Method ${method} not allowed for this endpoint`,
        405,
        { 
          allowedMethods,
          receivedMethod: method,
        },
        requestId
      );
    }
    
    await next();
  };
}

/**
 * Body size enforcement middleware
 * 
 * Additional check after body is parsed to enforce size limit.
 * Use after request hardening to catch cases where Content-Length is missing.
 */
export function enforcBodySizeLimit() {
  return async (c: Context, next: Next) => {
    const requestId = c.get('requestId') || randomUUID();
    
    // Only check for methods with body
    const method = c.req.method;
    if (!['POST', 'PUT', 'PATCH'].includes(method)) {
      await next();
      return;
    }
    
    try {
      // Try to parse body
      const body = await c.req.json().catch(() => null);
      
      if (body) {
        // Check serialized size
        const bodySize = JSON.stringify(body).length;
        
        if (bodySize > MAX_REQUEST_SIZE_BYTES) {
          throw new ApiError(
            ErrorCode.INVALID_REQUEST,
            'Request body exceeds maximum allowed size',
            413,
            { 
              maxSizeBytes: MAX_REQUEST_SIZE_BYTES,
              actualSizeBytes: bodySize,
            },
            requestId
          );
        }
        
        // Store parsed body for handler
        c.set('parsedBody', body);
      }
    } catch (error) {
      // If JSON parsing fails, let validation middleware handle it
      if (error instanceof ApiError) {
        throw error;
      }
      // Invalid JSON - validation middleware will catch this
    }
    
    await next();
  };
}
