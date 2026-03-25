/**
 * Hampshire Bin Collection Data Platform
 * Endpoint-Specific Rate Limiting Middleware
 *
 * Implements tiered rate limiting based on endpoint cost:
 * - Expensive endpoints (address resolution, property lookup): Strict limits
 * - Moderate endpoints (collection lookup with cache): Standard limits
 * - Cheap endpoints (health, stats): Lenient limits
 *
 * CRITICAL: Use Redis for distributed rate limiting in production.
 *
 * @module api/middleware/endpoint-rate-limiting
 */

import type { Context, Next } from 'hono';
import { auditLogger } from '../../observability/audit.js';
import { logger } from '../../observability/logger.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Rate limit tiers based on endpoint cost.
 */
export enum RateLimitTier {
  /** Expensive operations requiring upstream queries */
  EXPENSIVE = 'expensive',
  /** Moderate operations with database queries but cached */
  MODERATE = 'moderate',
  /** Cheap operations (health checks, stats) */
  CHEAP = 'cheap',
}

/**
 * Rate limit configuration per tier.
 */
interface RateLimitConfig {
  /** Maximum requests in time window */
  maxRequests: number;
  /** Time window in seconds */
  windowSeconds: number;
}

const RATE_LIMIT_CONFIGS: Record<RateLimitTier, RateLimitConfig> = {
  [RateLimitTier.EXPENSIVE]: {
    maxRequests: parseInt(process.env.RATE_LIMIT_EXPENSIVE_MAX || '20', 10),
    windowSeconds: parseInt(process.env.RATE_LIMIT_EXPENSIVE_WINDOW_SEC || '900', 10), // 15 min
  },
  [RateLimitTier.MODERATE]: {
    maxRequests: parseInt(process.env.RATE_LIMIT_MODERATE_MAX || '30', 10),
    windowSeconds: parseInt(process.env.RATE_LIMIT_MODERATE_WINDOW_SEC || '900', 10), // 15 min
  },
  [RateLimitTier.CHEAP]: {
    maxRequests: parseInt(process.env.RATE_LIMIT_CHEAP_MAX || '100', 10),
    windowSeconds: parseInt(process.env.RATE_LIMIT_CHEAP_WINDOW_SEC || '900', 10), // 15 min
  },
};

// =============================================================================
// REDIS CLIENT
// =============================================================================

interface RedisClient {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
}

let redisClient: RedisClient | null = null;

export function setRedisClient(client: RedisClient): void {
  redisClient = client;
}

// =============================================================================
// RATE LIMIT LOGIC
// =============================================================================

/**
 * Get current request count for IP and tier.
 * Returns count and TTL for rate limit window.
 */
async function getRateLimitStatus(
  ip: string,
  tier: RateLimitTier,
): Promise<{ count: number; ttl: number }> {
  if (!redisClient) {
    logger.warn('Redis client not initialized, endpoint rate limiting disabled');
    return { count: 0, ttl: 0 };
  }

  const config = RATE_LIMIT_CONFIGS[tier];
  const key = `rate_limit:${tier}:${ip}`;

  try {
    // Increment counter
    const count = await redisClient.incr(key);

    // Get TTL
    const ttl = await redisClient.ttl(key);

    // Set expiry on first request in window
    if (count === 1) {
      await redisClient.expire(key, config.windowSeconds);
    }

    return { count, ttl: ttl > 0 ? ttl : config.windowSeconds };
  } catch (error) {
    logger.error({ error, ip, tier }, 'Failed to check rate limit');
    return { count: 0, ttl: 0 };
  }
}

/**
 * Get client IP from request.
 */
function getClientIp(c: Context): string {
  return c.req.header('x-forwarded-for')?.split(',')[0].trim()
    || c.req.header('x-real-ip')
    || c.req.header('cf-connecting-ip')
    || 'unknown';
}

/**
 * Determine rate limit tier for current request path.
 */
function getRateLimitTier(c: Context): RateLimitTier {
  const path = c.req.path;

  // Expensive endpoints (require upstream queries)
  if (path.includes('/addresses') || path.includes('/resolve')) {
    return RateLimitTier.EXPENSIVE;
  }

  // Moderate endpoints (database queries, but cached)
  if (path.includes('/properties') || path.includes('/uprn')) {
    return RateLimitTier.MODERATE;
  }

  // Cheap endpoints (health, stats, public info)
  if (path.includes('/health') || path.includes('/stats') || path.includes('/councils')) {
    return RateLimitTier.CHEAP;
  }

  // Default to moderate for unknown endpoints
  return RateLimitTier.MODERATE;
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Endpoint-specific rate limiting middleware.
 * Should be applied after authentication but before route handlers.
 */
export async function endpointRateLimiting(c: Context, next: Next): Promise<Response | void> {
  const clientIp = getClientIp(c);
  const tier = getRateLimitTier(c);
  const config = RATE_LIMIT_CONFIGS[tier];

  // Get current rate limit status
  const status = await getRateLimitStatus(clientIp, tier);

  // Add rate limit headers to response
  c.header('X-RateLimit-Tier', tier);
  c.header('X-RateLimit-Limit', String(config.maxRequests));
  c.header('X-RateLimit-Remaining', String(Math.max(0, config.maxRequests - status.count)));
  c.header('X-RateLimit-Reset', String(Math.floor(Date.now() / 1000) + status.ttl));

  // Check if rate limit exceeded
  if (status.count > config.maxRequests) {
    // Log to audit trail
    auditLogger.logAbuse('rate_limit', {
      type: 'api_client',
      ip: clientIp,
    }, {
      reason: 'Endpoint-specific rate limit exceeded',
      threshold: config.maxRequests,
      count: status.count,
      tier,
    });

    logger.warn({
      clientIp,
      tier,
      count: status.count,
      limit: config.maxRequests,
      path: c.req.path,
    }, 'Endpoint rate limit exceeded');

    // Return 429 with retry-after header
    return c.json(
      {
        error: 'RATE_LIMITED',
        message: 'Too many requests to this endpoint type',
        tier,
        limit: config.maxRequests,
        windowSeconds: config.windowSeconds,
        retryAfter: status.ttl,
      },
      429,
    );
  }

  // Rate limit OK, continue
  await next();
}

/**
 * Get rate limit status for an IP (admin endpoint).
 */
export async function getRateLimitStatsForIp(ip: string): Promise<{
  expensive: { count: number; limit: number; remaining: number };
  moderate: { count: number; limit: number; remaining: number };
  cheap: { count: number; limit: number; remaining: number };
}> {
  const expensive = await getRateLimitStatus(ip, RateLimitTier.EXPENSIVE);
  const moderate = await getRateLimitStatus(ip, RateLimitTier.MODERATE);
  const cheap = await getRateLimitStatus(ip, RateLimitTier.CHEAP);

  return {
    expensive: {
      count: expensive.count,
      limit: RATE_LIMIT_CONFIGS[RateLimitTier.EXPENSIVE].maxRequests,
      remaining: Math.max(0, RATE_LIMIT_CONFIGS[RateLimitTier.EXPENSIVE].maxRequests - expensive.count),
    },
    moderate: {
      count: moderate.count,
      limit: RATE_LIMIT_CONFIGS[RateLimitTier.MODERATE].maxRequests,
      remaining: Math.max(0, RATE_LIMIT_CONFIGS[RateLimitTier.MODERATE].maxRequests - moderate.count),
    },
    cheap: {
      count: cheap.count,
      limit: RATE_LIMIT_CONFIGS[RateLimitTier.CHEAP].maxRequests,
      remaining: Math.max(0, RATE_LIMIT_CONFIGS[RateLimitTier.CHEAP].maxRequests - cheap.count),
    },
  };
}
