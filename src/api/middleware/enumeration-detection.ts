/**
 * Hampshire Bin Collection Data Platform
 * Enumeration Detection Middleware
 *
 * Implements sliding window enumeration detection on address resolution endpoint.
 * Tracks per-IP unique postcode lookups to detect mass enumeration attempts.
 *
 * CRITICAL: Uses Redis for distributed tracking. Never logs IP in plaintext.
 *
 * @module api/middleware/enumeration-detection
 */

import type { Context, Next } from 'hono';
import { auditLogger, anonymiseIp } from '../../observability/audit.js';
import { logger } from '../../observability/logger.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

const WINDOW_DURATION_SECONDS = 15 * 60; // 15 minutes
const SOFT_BLOCK_THRESHOLD = 50; // Unique postcodes in window
const HARD_BLOCK_THRESHOLD = 100; // Unique postcodes in window
const SOFT_BLOCK_DELAY_MS = 2000; // 1-3 seconds artificial delay
const WINDOW_BUCKET_SIZE_SECONDS = 60; // 1-minute buckets

// =============================================================================
// REDIS CLIENT
// =============================================================================

// TODO: Import from central Redis connection
interface RedisClient {
  sadd(key: string, member: string): Promise<number>;
  scard(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  incr(key: string): Promise<number>;
  get(key: string): Promise<string | null>;
  setex(key: string, seconds: number, value: string): Promise<string>;
}

let redisClient: RedisClient | null = null;

export function setRedisClient(client: RedisClient): void {
  redisClient = client;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get current window bucket timestamp.
 * Buckets are 1-minute intervals for sliding window.
 */
function getCurrentBucket(): number {
  return Math.floor(Date.now() / 1000 / WINDOW_BUCKET_SIZE_SECONDS);
}

/**
 * Get all bucket IDs in the sliding window.
 */
function getWindowBuckets(): number[] {
  const currentBucket = getCurrentBucket();
  const bucketsInWindow = Math.ceil(WINDOW_DURATION_SECONDS / WINDOW_BUCKET_SIZE_SECONDS);
  
  const buckets: number[] = [];
  for (let i = 0; i < bucketsInWindow; i++) {
    buckets.push(currentBucket - i);
  }
  
  return buckets;
}

/**
 * Extract postcode from request.
 */
function extractPostcode(c: Context): string | null {
  // Check path parameter
  const postcodeParam = c.req.param('postcode');
  if (postcodeParam) {
    return postcodeParam.toUpperCase().replace(/\s+/g, '');
  }
  
  // Check query parameter
  const postcodeQuery = c.req.query('postcode');
  if (postcodeQuery) {
    return postcodeQuery.toUpperCase().replace(/\s+/g, '');
  }
  
  return null;
}

/**
 * Get client IP from request.
 */
function getClientIp(c: Context): string {
  return c.req.header('x-forwarded-for')?.split(',')[0].trim()
    || c.req.header('x-real-ip')
    || c.req.header('cf-connecting-ip') // Cloudflare
    || 'unknown';
}

/**
 * Add artificial delay to degrade bot performance.
 */
function artificialDelay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =============================================================================
// ENUMERATION TRACKING
// =============================================================================

/**
 * Track postcode lookup for an IP.
 * Returns the number of unique postcodes in the sliding window.
 */
async function trackPostcodeLookup(ipAnon: string, postcode: string): Promise<number> {
  if (!redisClient) {
    logger.warn('Redis client not initialized, enumeration detection disabled');
    return 0;
  }
  
  const buckets = getWindowBuckets();
  let uniquePostcodes = 0;
  
  // Add postcode to current bucket
  const currentBucket = buckets[0];
  const key = `enumeration:${ipAnon}:${currentBucket}`;
  
  try {
    await redisClient.sadd(key, postcode);
    await redisClient.expire(key, WINDOW_DURATION_SECONDS);
    
    // Count unique postcodes across all buckets in window
    for (const bucket of buckets) {
      const bucketKey = `enumeration:${ipAnon}:${bucket}`;
      const count = await redisClient.scard(bucketKey);
      uniquePostcodes += count;
    }
  } catch (error) {
    logger.error({ error, ipAnon }, 'Failed to track enumeration');
    return 0;
  }
  
  return uniquePostcodes;
}

/**
 * Check if IP is currently hard-blocked.
 */
async function isHardBlocked(ipAnon: string): Promise<boolean> {
  if (!redisClient) {
    return false;
  }
  
  try {
    const blockKey = `enumeration:hardblock:${ipAnon}`;
    const blocked = await redisClient.get(blockKey);
    return blocked === '1';
  } catch (error) {
    logger.error({ error, ipAnon }, 'Failed to check hard block status');
    return false;
  }
}

/**
 * Set hard block for an IP.
 */
async function setHardBlock(ipAnon: string, durationSeconds: number): Promise<void> {
  if (!redisClient) {
    return;
  }
  
  try {
    const blockKey = `enumeration:hardblock:${ipAnon}`;
    await redisClient.setex(blockKey, durationSeconds, '1');
  } catch (error) {
    logger.error({ error, ipAnon }, 'Failed to set hard block');
  }
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Enumeration detection middleware.
 * Should be applied to address resolution endpoints.
 */
export async function enumerationDetection(c: Context, next: Next): Promise<Response | void> {
  // Only apply to address lookup endpoints
  const path = c.req.path;
  if (!path.includes('/addresses') && !path.includes('/postcodes')) {
    await next();
    return;
  }
  
  // Extract postcode from request
  const postcode = extractPostcode(c);
  if (!postcode) {
    // No postcode in request, skip detection
    await next();
    return;
  }
  
  // Get and anonymise client IP
  const clientIp = getClientIp(c);
  const ipAnon = anonymiseIp(clientIp);
  
  // Check if IP is hard-blocked
  const hardBlocked = await isHardBlocked(ipAnon);
  if (hardBlocked) {
    auditLogger.logAbuse('enumeration', {
      type: 'api_client',
      ip: clientIp,
    }, {
      reason: 'Hard block active',
      threshold: HARD_BLOCK_THRESHOLD,
    });
    
    return c.json(
      {
        error: 'RATE_LIMITED',
        message: 'Too many requests',
        retryAfter: 900, // 15 minutes
      },
      429,
    );
  }
  
  // Track this postcode lookup
  const uniquePostcodes = await trackPostcodeLookup(ipAnon, postcode);
  
  // Hard block threshold exceeded
  if (uniquePostcodes >= HARD_BLOCK_THRESHOLD) {
    await setHardBlock(ipAnon, 900); // 15 minutes
    
    auditLogger.logAbuse('enumeration', {
      type: 'api_client',
      ip: clientIp,
    }, {
      reason: 'Hard block threshold exceeded',
      threshold: HARD_BLOCK_THRESHOLD,
      count: uniquePostcodes,
    });
    
    logger.warn({
      ipAnon,
      uniquePostcodes,
      threshold: HARD_BLOCK_THRESHOLD,
    }, 'Enumeration hard block activated');
    
    return c.json(
      {
        error: 'RATE_LIMITED',
        message: 'Too many requests',
        retryAfter: 900,
      },
      429,
    );
  }
  
  // Soft block threshold exceeded - add delay
  if (uniquePostcodes >= SOFT_BLOCK_THRESHOLD) {
    auditLogger.logAbuse('enumeration', {
      type: 'api_client',
      ip: clientIp,
    }, {
      reason: 'Soft block threshold exceeded',
      threshold: SOFT_BLOCK_THRESHOLD,
      count: uniquePostcodes,
    });
    
    logger.warn({
      ipAnon,
      uniquePostcodes,
      threshold: SOFT_BLOCK_THRESHOLD,
      delayMs: SOFT_BLOCK_DELAY_MS,
    }, 'Enumeration soft block - adding delay');
    
    // Add artificial delay to degrade bot performance
    // Delay increases with count
    const delayMultiplier = Math.min(
      (uniquePostcodes - SOFT_BLOCK_THRESHOLD) / 10,
      3,
    );
    const delay = SOFT_BLOCK_DELAY_MS * (1 + delayMultiplier);
    
    await artificialDelay(delay);
  }
  
  // Continue to handler
  await next();
}

/**
 * Get enumeration statistics for an IP (admin endpoint).
 */
export async function getEnumerationStats(ipAnon: string): Promise<{
  uniquePostcodes: number;
  hardBlocked: boolean;
  softBlocked: boolean;
}> {
  if (!redisClient) {
    return {
      uniquePostcodes: 0,
      hardBlocked: false,
      softBlocked: false,
    };
  }
  
  const buckets = getWindowBuckets();
  let uniquePostcodes = 0;
  
  try {
    for (const bucket of buckets) {
      const bucketKey = `enumeration:${ipAnon}:${bucket}`;
      const count = await redisClient.scard(bucketKey);
      uniquePostcodes += count;
    }
    
    const hardBlocked = await isHardBlocked(ipAnon);
    const softBlocked = uniquePostcodes >= SOFT_BLOCK_THRESHOLD;
    
    return {
      uniquePostcodes,
      hardBlocked,
      softBlocked,
    };
  } catch (error) {
    logger.error({ error, ipAnon }, 'Failed to get enumeration stats');
    return {
      uniquePostcodes: 0,
      hardBlocked: false,
      softBlocked: false,
    };
  }
}
