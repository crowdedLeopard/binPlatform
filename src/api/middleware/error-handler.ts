/**
 * Hampshire Bin Collection Data Platform
 * Global Error Handler Middleware
 * 
 * Catches all unhandled errors and sanitises responses.
 * SECURITY REQUIREMENTS:
 * - Never leak stack traces to clients
 * - Never reveal internal file paths
 * - Never reveal database query details
 * - Never reveal which specific validation failed (for security-sensitive endpoints)
 * - Always return consistent JSON shape: { error: { code, message, requestId } }
 * - Log full details internally but return minimal details externally
 * 
 * @module api/middleware/error-handler
 */

import type { Context } from 'hono';
import { ApiError, ErrorCode, internalError, logError } from '../errors.js';
import { randomUUID } from 'node:crypto';

/**
 * Check if error is a known ApiError
 */
function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/**
 * Check if error is a validation error
 */
function isValidationError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  
  const name = error.name.toLowerCase();
  const message = error.message.toLowerCase();
  
  return (
    name.includes('validation') ||
    name.includes('zod') ||
    name === 'syntaxerror' ||
    message.includes('invalid') ||
    message.includes('required') ||
    message.includes('expected')
  );
}

/**
 * Check if error is a database error
 */
function isDatabaseError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  
  const name = error.name.toLowerCase();
  const message = error.message.toLowerCase();
  
  return (
    name.includes('postgres') ||
    name.includes('pg') ||
    name.includes('sql') ||
    name.includes('database') ||
    message.includes('relation') ||
    message.includes('column') ||
    message.includes('constraint')
  );
}

/**
 * Check if error is a timeout error
 */
function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  
  const message = error.message.toLowerCase();
  
  return (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('deadline exceeded')
  );
}

/**
 * Check if error is an auth error
 */
function isAuthError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  
  const name = error.name.toLowerCase();
  const message = error.message.toLowerCase();
  
  return (
    name.includes('auth') ||
    name.includes('unauthorized') ||
    name.includes('forbidden') ||
    message.includes('unauthorized') ||
    message.includes('forbidden') ||
    message.includes('access denied') ||
    message.includes('permission')
  );
}

/**
 * Sanitise error message to remove sensitive information
 */
function sanitiseErrorMessage(message: string): string {
  // Remove file paths (Windows and Unix)
  let sanitised = message.replace(/[A-Z]:\\[\w\\\-\.]+/gi, '[PATH]');
  sanitised = sanitised.replace(/\/[\w\/\-\.]+/g, '[PATH]');
  
  // Remove SQL fragments
  sanitised = sanitised.replace(/SELECT .+ FROM/gi, '[SQL_QUERY]');
  sanitised = sanitised.replace(/INSERT INTO .+/gi, '[SQL_QUERY]');
  sanitised = sanitised.replace(/UPDATE .+ SET/gi, '[SQL_QUERY]');
  sanitised = sanitised.replace(/DELETE FROM .+/gi, '[SQL_QUERY]');
  
  // Remove IP addresses
  sanitised = sanitised.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP_ADDRESS]');
  
  // Remove connection strings
  sanitised = sanitised.replace(/postgres:\/\/[^\s]+/gi, '[CONNECTION_STRING]');
  sanitised = sanitised.replace(/redis:\/\/[^\s]+/gi, '[CONNECTION_STRING]');
  
  // Remove UUIDs (might be internal IDs)
  sanitised = sanitised.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    '[UUID]'
  );
  
  return sanitised;
}

/**
 * Extract sanitised details from validation error (safe to expose field-level info)
 */
function extractValidationDetails(error: Error): Record<string, unknown> | undefined {
  // For Zod errors, extract field validation issues
  if ('issues' in error && Array.isArray(error.issues)) {
    return {
      fields: error.issues.map((issue: any) => ({
        path: issue.path.join('.'),
        message: sanitiseErrorMessage(issue.message),
      })),
    };
  }
  
  // For generic validation errors, return generic message
  return {
    hint: 'Check request parameters and format',
  };
}

/**
 * Get request ID from context or generate one
 */
function getRequestId(c: Context): string {
  // Try to get from auth context
  const requestId = c.get('requestId');
  if (requestId) return requestId;
  
  // Try to get from X-Request-ID header
  const headerRequestId = c.req.header('X-Request-ID');
  if (headerRequestId) return headerRequestId;
  
  // Generate new one
  return randomUUID();
}

/**
 * Global error handler middleware for Hono
 * 
 * Catches all unhandled errors and returns sanitised responses.
 * Logs full error details internally with requestId for correlation.
 */
export function errorHandler() {
  return async (c: Context, next: () => Promise<void>) => {
    try {
      await next();
    } catch (error) {
      const requestId = getRequestId(c);
      
      // Known ApiError - already sanitised
      if (isApiError(error)) {
        logError(error, {
          path: c.req.path,
          method: c.req.method,
          requestId,
        });
        
        return c.json(error.toResponse(), error.statusCode as any);
      }
      
      // Auth errors - return minimal details
      if (isAuthError(error)) {
        const sanitisedError = new ApiError(
          ErrorCode.UNAUTHORIZED,
          'Unauthorized',
          401,
          undefined,
          requestId
        );
        
        logError(error, {
          path: c.req.path,
          method: c.req.method,
          requestId,
          originalError: error instanceof Error ? error.message : String(error),
        });
        
        return c.json(sanitisedError.toResponse(), 401);
      }
      
      // Validation errors - return field-level details (safe to expose)
      if (isValidationError(error)) {
        const details = error instanceof Error ? extractValidationDetails(error) : undefined;
        
        const sanitisedError = new ApiError(
          ErrorCode.INVALID_REQUEST,
          'Request validation failed',
          400,
          details,
          requestId
        );
        
        logError(error, {
          path: c.req.path,
          method: c.req.method,
          requestId,
          validationError: error instanceof Error ? error.message : String(error),
        });
        
        return c.json(sanitisedError.toResponse(), 400);
      }
      
      // Database errors - never expose details
      if (isDatabaseError(error)) {
        const sanitisedError = internalError(requestId);
        
        logError(error, {
          path: c.req.path,
          method: c.req.method,
          requestId,
          errorType: 'database',
          // Log full details internally but don't expose
          internalError: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        
        return c.json(sanitisedError.toResponse(), 500);
      }
      
      // Timeout errors
      if (isTimeoutError(error)) {
        const sanitisedError = new ApiError(
          ErrorCode.ADAPTER_UNAVAILABLE,
          'Request timeout. The upstream service took too long to respond.',
          504,
          undefined,
          requestId
        );
        
        logError(error, {
          path: c.req.path,
          method: c.req.method,
          requestId,
          errorType: 'timeout',
        });
        
        return c.json(sanitisedError.toResponse(), 504);
      }
      
      // Unknown errors - return generic internal error with requestId
      const sanitisedError = internalError(requestId);
      
      logError(error, {
        path: c.req.path,
        method: c.req.method,
        requestId,
        errorType: 'unknown',
        errorName: error instanceof Error ? error.name : 'Unknown',
        // Log sanitised message
        errorMessage: error instanceof Error ? sanitiseErrorMessage(error.message) : String(error),
        // Log full stack internally
        stack: error instanceof Error ? error.stack : undefined,
      });
      
      return c.json(sanitisedError.toResponse(), 500);
    }
  };
}

/**
 * Fastify-compatible error handler
 * 
 * For use with Fastify instead of Hono.
 * Provides same sanitisation guarantees.
 */
export function fastifyErrorHandler(
  error: Error,
  request: any,
  reply: any
): void {
  const requestId = request.id || request.headers['x-request-id'] || randomUUID();
  
  // Known ApiError
  if (isApiError(error)) {
    logError(error, {
      path: request.url,
      method: request.method,
      requestId,
    });
    
    reply.status(error.statusCode).send(error.toResponse());
    return;
  }
  
  // Auth errors
  if (isAuthError(error)) {
    const sanitisedError = new ApiError(
      ErrorCode.UNAUTHORIZED,
      'Unauthorized',
      401,
      undefined,
      requestId
    );
    
    logError(error, {
      path: request.url,
      method: request.method,
      requestId,
      originalError: error.message,
    });
    
    reply.status(401).send(sanitisedError.toResponse());
    return;
  }
  
  // Validation errors
  if (isValidationError(error)) {
    const details = extractValidationDetails(error);
    
    const sanitisedError = new ApiError(
      ErrorCode.INVALID_REQUEST,
      'Request validation failed',
      400,
      details,
      requestId
    );
    
    logError(error, {
      path: request.url,
      method: request.method,
      requestId,
      validationError: error.message,
    });
    
    reply.status(400).send(sanitisedError.toResponse());
    return;
  }
  
  // Database errors
  if (isDatabaseError(error)) {
    const sanitisedError = internalError(requestId);
    
    logError(error, {
      path: request.url,
      method: request.method,
      requestId,
      errorType: 'database',
      internalError: error.message,
      stack: error.stack,
    });
    
    reply.status(500).send(sanitisedError.toResponse());
    return;
  }
  
  // Timeout errors
  if (isTimeoutError(error)) {
    const sanitisedError = new ApiError(
      ErrorCode.ADAPTER_UNAVAILABLE,
      'Request timeout. The upstream service took too long to respond.',
      504,
      undefined,
      requestId
    );
    
    logError(error, {
      path: request.url,
      method: request.method,
      requestId,
      errorType: 'timeout',
    });
    
    reply.status(504).send(sanitisedError.toResponse());
    return;
  }
  
  // Unknown errors
  const sanitisedError = internalError(requestId);
  
  logError(error, {
    path: request.url,
    method: request.method,
    requestId,
    errorType: 'unknown',
    errorName: error.name,
    errorMessage: sanitiseErrorMessage(error.message),
    stack: error.stack,
  });
  
  reply.status(500).send(sanitisedError.toResponse());
}
