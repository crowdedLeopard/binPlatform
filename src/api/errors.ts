/**
 * Hampshire Bin Collection Data Platform
 * Standardised Error Responses
 * 
 * Defines error codes and response formats for API endpoints.
 * Never exposes internal details, stack traces, or sensitive information.
 */

import { randomUUID } from 'node:crypto';

export enum ErrorCode {
  // Input validation errors (400)
  INVALID_POSTCODE = 'INVALID_POSTCODE',
  INVALID_HOUSE_IDENTIFIER = 'INVALID_HOUSE_IDENTIFIER',
  INVALID_PROPERTY_ID = 'INVALID_PROPERTY_ID',
  INVALID_REQUEST = 'INVALID_REQUEST',
  
  // Not found errors (404)
  POSTCODE_NOT_HAMPSHIRE = 'POSTCODE_NOT_HAMPSHIRE',
  PROPERTY_NOT_FOUND = 'PROPERTY_NOT_FOUND',
  COUNCIL_NOT_FOUND = 'COUNCIL_NOT_FOUND',
  
  // Adapter/service errors (503)
  ADAPTER_UNAVAILABLE = 'ADAPTER_UNAVAILABLE',
  ADAPTER_DISABLED = 'ADAPTER_DISABLED',
  ADAPTER_ERROR = 'ADAPTER_ERROR',
  
  // Rate limiting (429)
  RATE_LIMITED = 'RATE_LIMITED',
  
  // Authentication/authorization (401/403)
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  INVALID_API_KEY = 'INVALID_API_KEY',
  
  // Server errors (500)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export interface ErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    requestId: string;
    details?: Record<string, unknown>;
  };
}

export class ApiError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, unknown>,
    public readonly requestId: string = randomUUID()
  ) {
    super(message);
    this.name = 'ApiError';
  }

  toResponse(): ErrorResponse {
    return {
      error: {
        code: this.code,
        message: this.message,
        requestId: this.requestId,
        details: this.details,
      },
    };
  }
}

// Error factory functions

export function invalidPostcode(postcode?: string, requestId?: string): ApiError {
  return new ApiError(
    ErrorCode.INVALID_POSTCODE,
    'The provided postcode is not in valid UK format',
    400,
    postcode ? { example: 'SO23 8QT' } : undefined,
    requestId
  );
}

export function invalidHouseIdentifier(requestId?: string): ApiError {
  return new ApiError(
    ErrorCode.INVALID_HOUSE_IDENTIFIER,
    'House identifier contains invalid characters or exceeds maximum length',
    400,
    { maxLength: 50 },
    requestId
  );
}

export function invalidPropertyId(requestId?: string): ApiError {
  return new ApiError(
    ErrorCode.INVALID_PROPERTY_ID,
    'Property ID must be a valid UUID',
    400,
    undefined,
    requestId
  );
}

export function postcodeNotHampshire(postcodePrefix?: string, requestId?: string): ApiError {
  return new ApiError(
    ErrorCode.POSTCODE_NOT_HAMPSHIRE,
    'This service only covers Hampshire councils. The provided postcode is outside our service area.',
    404,
    postcodePrefix ? { postcodePrefix } : undefined,
    requestId
  );
}

export function propertyNotFound(requestId?: string): ApiError {
  return new ApiError(
    ErrorCode.PROPERTY_NOT_FOUND,
    'No property found matching the provided criteria',
    404,
    undefined,
    requestId
  );
}

export function councilNotFound(councilId?: string, requestId?: string): ApiError {
  return new ApiError(
    ErrorCode.COUNCIL_NOT_FOUND,
    'Council not found',
    404,
    councilId ? { councilId } : undefined,
    requestId
  );
}

export function adapterUnavailable(councilId?: string, requestId?: string): ApiError {
  return new ApiError(
    ErrorCode.ADAPTER_UNAVAILABLE,
    'Council service is temporarily unavailable. Please try again later.',
    503,
    councilId ? { councilId } : undefined,
    requestId
  );
}

export function adapterDisabled(councilId?: string, requestId?: string): ApiError {
  return new ApiError(
    ErrorCode.ADAPTER_DISABLED,
    'Council service is currently disabled for maintenance',
    503,
    councilId ? { councilId } : undefined,
    requestId
  );
}

export function rateLimited(retryAfter?: number, requestId?: string): ApiError {
  return new ApiError(
    ErrorCode.RATE_LIMITED,
    'Rate limit exceeded. Please slow down your requests.',
    429,
    retryAfter ? { retryAfter } : undefined,
    requestId
  );
}

export function unauthorized(requestId?: string): ApiError {
  return new ApiError(
    ErrorCode.UNAUTHORIZED,
    'Authentication required. Please provide a valid API key.',
    401,
    undefined,
    requestId
  );
}

export function forbidden(requestId?: string): ApiError {
  return new ApiError(
    ErrorCode.FORBIDDEN,
    'You do not have permission to access this resource',
    403,
    undefined,
    requestId
  );
}

export function invalidApiKey(requestId?: string): ApiError {
  return new ApiError(
    ErrorCode.INVALID_API_KEY,
    'The provided API key is invalid or has been revoked',
    401,
    undefined,
    requestId
  );
}

export function internalError(requestId?: string): ApiError {
  return new ApiError(
    ErrorCode.INTERNAL_ERROR,
    'An internal server error occurred. Please contact support with the request ID.',
    500,
    undefined,
    requestId
  );
}

/**
 * Safe error logger - never logs sensitive data.
 * Logs postcode prefix only, never full addresses or internal IDs.
 */
export function logError(error: unknown, context?: Record<string, unknown>): void {
  if (error instanceof ApiError) {
    console.error({
      level: 'error',
      code: error.code,
      message: error.message,
      statusCode: error.statusCode,
      requestId: error.requestId,
      context: sanitiseContext(context),
    });
  } else if (error instanceof Error) {
    console.error({
      level: 'error',
      name: error.name,
      message: error.message,
      context: sanitiseContext(context),
    });
  } else {
    console.error({
      level: 'error',
      message: 'Unknown error',
      error: String(error),
      context: sanitiseContext(context),
    });
  }
}

/**
 * Sanitise logging context to remove sensitive data.
 */
function sanitiseContext(context?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!context) return undefined;

  const sanitised: Record<string, unknown> = {};
  const SENSITIVE_KEYS = ['password', 'token', 'apiKey', 'secret', 'authorization'];

  for (const [key, value] of Object.entries(context)) {
    if (SENSITIVE_KEYS.some(sensitive => key.toLowerCase().includes(sensitive))) {
      sanitised[key] = '[REDACTED]';
    } else if (key === 'postcode' && typeof value === 'string') {
      // Log only postcode prefix
      sanitised.postcodePrefix = value.split(' ')[0];
    } else if (key === 'address') {
      sanitised[key] = '[ADDRESS_REDACTED]';
    } else {
      sanitised[key] = value;
    }
  }

  return sanitised;
}
