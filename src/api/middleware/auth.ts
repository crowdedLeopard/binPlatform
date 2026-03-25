/**
 * Hampshire Bin Collection Data Platform
 * API Key Authentication Middleware
 * 
 * Validates API keys from X-Api-Key or Authorization: Bearer headers.
 * Attaches authenticated context to request for role-based access control.
 */

import type { Context, Next } from 'hono';
import { ApiError, ErrorCode, unauthorized, invalidApiKey, forbidden } from '../errors';
import { randomUUID } from 'node:crypto';

export type UserRole = 'public' | 'read' | 'admin';

export interface AuthContext {
  apiKeyId: string;
  role: UserRole;
  clientId: string;
  requestId: string;
}

interface ApiKeyRecord {
  id: string;
  keyHash: string;
  role: UserRole;
  clientId: string;
  enabled: boolean;
  rateLimit?: number;
}

export class AuthMiddleware {
  private database?: any; // Database client (to be injected)
  private redisCache?: any; // Redis client for key cache

  constructor(options?: { database?: any; redisCache?: any }) {
    this.database = options?.database;
    this.redisCache = options?.redisCache;
  }

  /**
   * Middleware for public endpoints - no key required but still rate-limited by IP.
   */
  public() {
    return async (c: Context, next: Next) => {
      const requestId = randomUUID();
      
      c.set('auth', {
        apiKeyId: 'anonymous',
        role: 'public' as UserRole,
        clientId: this.getClientIp(c),
        requestId,
      });

      await next();
    };
  }

  /**
   * Middleware for read endpoints - requires valid API key.
   */
  read() {
    return async (c: Context, next: Next) => {
      const requestId = randomUUID();
      const apiKey = this.extractApiKey(c);

      if (!apiKey) {
        throw unauthorized(requestId);
      }

      const authContext = await this.validateApiKey(apiKey, requestId);
      
      if (authContext.role === 'public') {
        throw forbidden(requestId);
      }

      c.set('auth', authContext);
      await next();
    };
  }

  /**
   * Middleware for admin endpoints - requires valid API key with admin role.
   */
  admin() {
    return async (c: Context, next: Next) => {
      const requestId = randomUUID();
      const apiKey = this.extractApiKey(c);

      if (!apiKey) {
        throw unauthorized(requestId);
      }

      const authContext = await this.validateApiKey(apiKey, requestId);
      
      if (authContext.role !== 'admin') {
        throw forbidden(requestId);
      }

      c.set('auth', authContext);
      await next();
    };
  }

  /**
   * Extract API key from X-Api-Key header or Authorization: Bearer header.
   */
  private extractApiKey(c: Context): string | null {
    // Check X-Api-Key header
    const xApiKey = c.req.header('X-Api-Key');
    if (xApiKey) {
      return xApiKey;
    }

    // Check Authorization: Bearer header
    const authHeader = c.req.header('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    return null;
  }

  /**
   * Validate API key against database.
   * Keys are stored as bcrypt hashes for security.
   */
  private async validateApiKey(apiKey: string, requestId: string): Promise<AuthContext> {
    // Check cache first
    const cached = await this.getCachedKey(apiKey);
    if (cached) {
      return {
        apiKeyId: cached.id,
        role: cached.role,
        clientId: cached.clientId,
        requestId,
      };
    }

    // Lookup from database
    const keyRecord = await this.lookupApiKey(apiKey);
    
    if (!keyRecord) {
      throw invalidApiKey(requestId);
    }

    if (!keyRecord.enabled) {
      throw invalidApiKey(requestId);
    }

    // Cache for next request (5 minute TTL)
    await this.cacheApiKey(apiKey, keyRecord);

    return {
      apiKeyId: keyRecord.id,
      role: keyRecord.role,
      clientId: keyRecord.clientId,
      requestId,
    };
  }

  /**
   * Get client IP address, accounting for proxy headers.
   */
  private getClientIp(c: Context): string {
    // Check X-Forwarded-For (from reverse proxy)
    const forwarded = c.req.header('X-Forwarded-For');
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }

    // Check X-Real-IP
    const realIp = c.req.header('X-Real-IP');
    if (realIp) {
      return realIp;
    }

    // Fallback to connection IP (may be proxy)
    return 'unknown';
  }

  private async getCachedKey(apiKey: string): Promise<ApiKeyRecord | null> {
    // TODO: Implement Redis cache lookup
    return null;
  }

  private async cacheApiKey(apiKey: string, record: ApiKeyRecord): Promise<void> {
    // TODO: Implement Redis cache with 5min TTL
  }

  private async lookupApiKey(apiKey: string): Promise<ApiKeyRecord | null> {
    // TODO: Implement database lookup with bcrypt comparison
    // For now, return null (all keys invalid)
    return null;
  }
}

/**
 * Helper to get auth context from Hono context.
 */
export function getAuthContext(c: Context): AuthContext {
  const auth = c.get('auth');
  if (!auth) {
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Auth context not set', 500);
  }
  return auth as AuthContext;
}
