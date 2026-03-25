/**
 * Hampshire Bin Collection Data Platform
 * Per-Endpoint Rate Limiting
 * 
 * Tiered rate limits based on endpoint cost and risk:
 * - Public endpoints (cheap — DB lookups): 200/min per IP
 * - Address resolution (expensive — adapter/cache): 20/min per IP, 100/min per API key
 * - Collection data (medium — may trigger adapter): 60/min per IP
 * - Health endpoints (cheap — monitoring must work): 600/min
 * - Admin endpoints (sensitive): 30/min read, 10/min write per API key
 * 
 * Uses Redis for distributed rate limiting across instances.
 * 
 * @module api/middleware/rateLimit
 */

import type { Context, Next } from 'hono';
import type Redis from 'ioredis';
import { ApiError, ErrorCode, rateLimited } from '../errors.js';

export interface RateLimitConfig {
  /** Maximum requests per window */
  maxRequests: number;
  
  /** Time window in seconds */
  windowSeconds: number;
  
  /** Rate limit key prefix (e.g., 'ratelimit:councils') */
  keyPrefix: string;
  
  /** Whether to use IP-based limiting (default: true) */
  useIpLimit?: boolean;
  
  /** Whether to use API key-based limiting (default: false) */
  useApiKeyLimit?: boolean;
  
  /** Different limit for API keys (if useApiKeyLimit is true) */
  apiKeyMaxRequests?: number;
}

// Pre-configured rate limit tiers
export const RATE_LIMITS = {
  // Public council listing endpoints
  PUBLIC_READ: {
    maxRequests: 200,
    windowSeconds: 60,
    keyPrefix: 'ratelimit:public',
    useIpLimit: true,
  } as RateLimitConfig,
  
  // Address resolution (expensive — triggers adapter or cache lookup)
  ADDRESS_RESOLUTION: {
    maxRequests: 20,
    windowSeconds: 60,
    keyPrefix: 'ratelimit:address',
    useIpLimit: true,
    useApiKeyLimit: true,
    apiKeyMaxRequests: 100,
  } as RateLimitConfig,
  
  // Collection data (medium cost)
  COLLECTION_DATA: {
    maxRequests: 60,
    windowSeconds: 60,
    keyPrefix: 'ratelimit:collections',
    useIpLimit: true,
  } as RateLimitConfig,
  
  // Health endpoints (must not block monitoring)
  HEALTH_CHECK: {
    maxRequests: 600,
    windowSeconds: 60,
    keyPrefix: 'ratelimit:health',
    useIpLimit: true,
  } as RateLimitConfig,
  
  // Admin read endpoints
  ADMIN_READ: {
    maxRequests: 30,
    windowSeconds: 60,
    keyPrefix: 'ratelimit:admin:read',
    useApiKeyLimit: true,
  } as RateLimitConfig,
  
  // Admin write endpoints (kill switches, etc.)
  ADMIN_WRITE: {
    maxRequests: 10,
    windowSeconds: 60,
    keyPrefix: 'ratelimit:admin:write',
    useApiKeyLimit: true,
  } as RateLimitConfig,
};

/**
 * Extract client identifier for rate limiting
 */
function getClientIdentifier(c: Context): { ip: string; apiKey?: string } {
  // Get IP address (prefer X-Forwarded-For if behind proxy)
  const ip =
    c.req.header('X-Forwarded-For')?.split(',')[0].trim() ||
    c.req.header('X-Real-IP') ||
    'unknown';
  
  // Get API key from auth context (if authenticated)
  const apiKey = c.get('apiKeyId');
  
  return { ip, apiKey };
}

/**
 * Check rate limit against Redis
 */
async function checkRateLimit(
  redis: Redis,
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - windowSeconds;
  
  try {
    // Use Redis sorted set to track requests with timestamps
    const multi = redis.multi();
    
    // Remove expired entries
    multi.zremrangebyscore(key, '0', String(windowStart));
    
    // Count current requests in window
    multi.zcard(key);
    
    // Add current request
    multi.zadd(key, now, `${now}-${Math.random()}`);
    
    // Set expiry
    multi.expire(key, windowSeconds);
    
    const results = await multi.exec();
    
    // Get count (after removing expired but before adding new)
    const count = (results?.[1]?.[1] as number) || 0;
    
    const allowed = count < maxRequests;
    const remaining = Math.max(0, maxRequests - count - 1);
    const resetAt = now + windowSeconds;
    
    return { allowed, remaining, resetAt };
  } catch (error) {
    // If Redis fails, allow the request (fail open)
    console.error('Rate limit check failed', { key, error });
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowSeconds };
  }
}

/**
 * Rate limit middleware factory
 * 
 * Creates middleware that enforces rate limits based on configuration.
 */
export function rateLimitMiddleware(redis: Redis, config: RateLimitConfig) {
  return async (c: Context, next: Next) => {
    const { ip, apiKey } = getClientIdentifier(c);
    const requestId = c.get('requestId');
    
    let allowed = true;
    let remaining = config.maxRequests;
    let resetAt = Math.floor(Date.now() / 1000) + config.windowSeconds;
    
    // Check IP-based limit
    if (config.useIpLimit) {
      const ipKey = `${config.keyPrefix}:ip:${ip}`;
      const ipLimit = await checkRateLimit(
        redis,
        ipKey,
        config.maxRequests,
        config.windowSeconds
      );
      
      if (!ipLimit.allowed) {
        allowed = false;
        remaining = ipLimit.remaining;
        resetAt = ipLimit.resetAt;
      }
    }
    
    // Check API key-based limit (if authenticated)
    if (config.useApiKeyLimit && apiKey) {
      const keyMaxRequests = config.apiKeyMaxRequests || config.maxRequests;
      const apiKeyKey = `${config.keyPrefix}:apikey:${apiKey}`;
      const apiKeyLimit = await checkRateLimit(
        redis,
        apiKeyKey,
        keyMaxRequests,
        config.windowSeconds
      );
      
      if (!apiKeyLimit.allowed) {
        allowed = false;
        remaining = apiKeyLimit.remaining;
        resetAt = apiKeyLimit.resetAt;
      }
    }
    
    // Set rate limit headers
    c.header('X-RateLimit-Limit', config.maxRequests.toString());
    c.header('X-RateLimit-Remaining', remaining.toString());
    c.header('X-RateLimit-Reset', resetAt.toString());
    
    if (!allowed) {
      const retryAfter = resetAt - Math.floor(Date.now() / 1000);
      c.header('Retry-After', retryAfter.toString());
      
      throw rateLimited(retryAfter, requestId);
    }
    
    await next();
  };
}

/**
 * Create rate limiter for specific endpoint tier
 */
export function createRateLimiter(
  redis: Redis,
  tier: keyof typeof RATE_LIMITS
) {
  return rateLimitMiddleware(redis, RATE_LIMITS[tier]);
}

/**
 * Fastify-compatible rate limit hook
 */
export async function rateLimitByKey(
  redis: Redis,
  config: RateLimitConfig,
  request: any,
  reply: any
): Promise<void> {
  const ip =
    request.headers['x-forwarded-for']?.split(',')[0].trim() ||
    request.headers['x-real-ip'] ||
    request.ip ||
    'unknown';
  
  const apiKey = request.apiKeyId;
  const requestId = request.id;
  
  let allowed = true;
  let remaining = config.maxRequests;
  let resetAt = Math.floor(Date.now() / 1000) + config.windowSeconds;
  
  // Check IP-based limit
  if (config.useIpLimit) {
    const ipKey = `${config.keyPrefix}:ip:${ip}`;
    const ipLimit = await checkRateLimit(
      redis,
      ipKey,
      config.maxRequests,
      config.windowSeconds
    );
    
    if (!ipLimit.allowed) {
      allowed = false;
      remaining = ipLimit.remaining;
      resetAt = ipLimit.resetAt;
    }
  }
  
  // Check API key-based limit
  if (config.useApiKeyLimit && apiKey) {
    const keyMaxRequests = config.apiKeyMaxRequests || config.maxRequests;
    const apiKeyKey = `${config.keyPrefix}:apikey:${apiKey}`;
    const apiKeyLimit = await checkRateLimit(
      redis,
      apiKeyKey,
      keyMaxRequests,
      config.windowSeconds
    );
    
    if (!apiKeyLimit.allowed) {
      allowed = false;
      remaining = apiKeyLimit.remaining;
      resetAt = apiKeyLimit.resetAt;
    }
  }
  
  // Set rate limit headers
  reply.header('X-RateLimit-Limit', config.maxRequests);
  reply.header('X-RateLimit-Remaining', remaining);
  reply.header('X-RateLimit-Reset', resetAt);
  
  if (!allowed) {
    const retryAfter = resetAt - Math.floor(Date.now() / 1000);
    reply.header('Retry-After', retryAfter);
    
    const error = rateLimited(retryAfter, requestId);
    reply.status(429).send(error.toResponse());
  }
}
