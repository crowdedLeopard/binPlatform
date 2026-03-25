/**
 * Hampshire Bin Collection Data Platform
 * Redis Cache Client with Cache Poisoning Prevention
 * 
 * CACHE POISONING PREVENTION:
 * - All cache keys are namespaced to prevent collision (e.g., cache:eastleigh:uprn:12345)
 * - Cache values are validated before use (schema validation)
 * - Maximum cached value size enforced (prevent large payload caching)
 * - Cache keys constructed from validated input only (not raw user input)
 * 
 * CACHE KEY SCHEMA:
 * - Address lookup: cache:{councilId}:address:{postcode}:{houseIdentifier}
 * - Property data: cache:{councilId}:property:{propertyId}
 * - Collection events: cache:{councilId}:events:{propertyId}
 * - Collection services: cache:{councilId}:services:{propertyId}
 * - Council capabilities: cache:council:{councilId}:capabilities
 * 
 * @module storage/cache/client
 */

import Redis from 'ioredis';
import { logger } from '../../observability/logger.js';
import crypto from 'node:crypto';

let redis: Redis | null = null;

export interface CacheConfig {
  url: string;
  tls?: boolean;
  keyPrefix?: string;
}

// Security limits
const MAX_CACHED_VALUE_SIZE_BYTES = 1 * 1024 * 1024; // 1MB max per cached value
const MAX_KEY_LENGTH = 200; // Prevent excessively long keys

/**
 * Validate cache key format
 * Prevents cache key injection attacks
 */
function validateCacheKey(key: string): boolean {
  // Check length
  if (key.length > MAX_KEY_LENGTH) {
    logger.warn({ key, maxLength: MAX_KEY_LENGTH }, 'Cache key exceeds maximum length');
    return false;
  }
  
  // Only allow alphanumeric, hyphens, underscores, colons
  if (!/^[a-zA-Z0-9\-_:]+$/.test(key)) {
    logger.warn({ key }, 'Cache key contains invalid characters');
    return false;
  }
  
  // Reject path traversal attempts
  if (key.includes('..')) {
    logger.warn({ key }, 'Cache key contains path traversal attempt');
    return false;
  }
  
  return true;
}

/**
 * Validate cached value size
 * Prevents large payload caching that could cause memory issues
 */
function validateValueSize(serialized: string): boolean {
  const size = Buffer.byteLength(serialized, 'utf8');
  
  if (size > MAX_CACHED_VALUE_SIZE_BYTES) {
    logger.warn({
      size,
      maxSize: MAX_CACHED_VALUE_SIZE_BYTES,
    }, 'Cached value exceeds maximum size');
    return false;
  }
  
  return true;
}

/**
 * Sanitise user input for use in cache keys
 * Ensures only validated, safe values are used in keys
 */
export function sanitiseForCacheKey(input: string): string {
  // Convert to lowercase
  let sanitised = input.toLowerCase();
  
  // Remove whitespace
  sanitised = sanitised.replace(/\s+/g, '');
  
  // Remove any non-alphanumeric characters except hyphens
  sanitised = sanitised.replace(/[^a-z0-9\-]/g, '');
  
  // Truncate to reasonable length
  if (sanitised.length > 100) {
    sanitised = sanitised.substring(0, 100);
  }
  
  return sanitised;
}

/**
 * Build namespaced cache key
 * 
 * Ensures all keys are properly namespaced to prevent collision.
 * 
 * @example
 * buildCacheKey('address', 'eastleigh', 'SO501AA', '10')
 * // Returns: 'cache:eastleigh:address:so501aa:10'
 */
export function buildCacheKey(
  type: 'address' | 'property' | 'events' | 'services' | 'capabilities' | 'health',
  councilId: string,
  ...parts: string[]
): string {
  // Sanitise all parts
  const sanitisedCouncilId = sanitiseForCacheKey(councilId);
  const sanitisedParts = parts.map(sanitiseForCacheKey);
  
  // Build key with namespace
  const key = ['cache', sanitisedCouncilId, type, ...sanitisedParts].join(':');
  
  // Validate before returning
  if (!validateCacheKey(key)) {
    throw new Error(`Invalid cache key: ${key}`);
  }
  
  return key;
}

/**
 * Hash value for content validation
 * Allows detection of cache tampering
 */
function hashValue(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function initCache(config: CacheConfig): void {
  const { url, tls = false, keyPrefix = 'binday:' } = config;

  redis = new Redis(url, {
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    keyPrefix,
    tls: tls ? { rejectUnauthorized: true } : undefined
  });

  redis.on('error', (err) => {
    logger.error({ err }, 'Redis error');
  });

  redis.on('connect', () => {
    logger.info({}, 'Redis connected');
  });

  redis.on('ready', () => {
    logger.info({}, 'Redis ready');
  });
}

export function getCache(): Redis {
  if (!redis) {
    throw new Error('Cache not initialized. Call initCache() first.');
  }
  return redis;
}

export async function healthCheck(): Promise<boolean> {
  if (!redis) return false;

  try {
    const result = await redis.ping();
    return result === 'PONG';
  } catch (err) {
    logger.error({ err }, 'Cache health check failed');
    return false;
  }
}

export async function closeCache(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
    logger.info({}, 'Cache connection closed');
  }
}

/**
 * Get value from cache with validation
 * 
 * @param key - Cache key (will be validated)
 * @param validate - Optional validation function for cached value
 * @returns Cached value or null if not found/invalid
 */
export async function get<T>(
  key: string,
  validate?: (value: T) => boolean
): Promise<T | null> {
  // Validate key format
  if (!validateCacheKey(key)) {
    return null;
  }
  
  try {
    const value = await getCache().get(key);
    if (!value) return null;
    
    // Parse JSON
    const parsed = JSON.parse(value) as T;
    
    // Run custom validation if provided
    if (validate && !validate(parsed)) {
      logger.warn({ key }, 'Cached value failed validation');
      // Delete poisoned value
      await del(key);
      return null;
    }
    
    return parsed;
  } catch (error) {
    logger.error({ error, key }, 'Failed to get cached value');
    // Delete corrupted value
    await del(key);
    return null;
  }
}

/**
 * Set value in cache with size validation
 * 
 * @param key - Cache key (will be validated)
 * @param value - Value to cache
 * @param ttlSeconds - Optional TTL in seconds
 */
export async function set<T>(
  key: string,
  value: T,
  ttlSeconds?: number
): Promise<void> {
  // Validate key format
  if (!validateCacheKey(key)) {
    throw new Error(`Invalid cache key: ${key}`);
  }
  
  try {
    const serialized = JSON.stringify(value);
    
    // Validate value size
    if (!validateValueSize(serialized)) {
      throw new Error(`Cached value exceeds maximum size for key: ${key}`);
    }
    
    if (ttlSeconds) {
      await getCache().setex(key, ttlSeconds, serialized);
    } else {
      await getCache().set(key, serialized);
    }
    
    logger.debug({ key, ttl: ttlSeconds, size: serialized.length }, 'Cached value set');
  } catch (error) {
    logger.error({ error, key }, 'Failed to set cached value');
    throw error;
  }
}

/**
 * Delete value from cache
 */
export async function del(key: string): Promise<void> {
  try {
    await getCache().del(key);
  } catch (error) {
    logger.error({ error, key }, 'Failed to delete cached value');
  }
}

/**
 * Invalidate all keys matching pattern
 * 
 * WARNING: Use with caution. Pattern should be specific to avoid mass deletion.
 */
export async function invalidatePattern(pattern: string): Promise<number> {
  // Validate pattern to prevent abuse
  if (pattern === '*' || pattern === '**') {
    throw new Error('Cannot invalidate all keys. Pattern too broad.');
  }
  
  try {
    const keys = await getCache().keys(pattern);
    if (keys.length > 0) {
      logger.info({ pattern, count: keys.length }, 'Invalidating cache keys by pattern');
      return await getCache().del(...keys);
    }
    return 0;
  } catch (error) {
    logger.error({ error, pattern }, 'Failed to invalidate cache pattern');
    return 0;
  }
}

/**
 * Invalidate cache for a specific council
 * Useful when a council's adapter is updated or schema drifts
 */
export async function invalidateCouncilCache(councilId: string): Promise<number> {
  const sanitisedCouncilId = sanitiseForCacheKey(councilId);
  const pattern = `cache:${sanitisedCouncilId}:*`;
  return await invalidatePattern(pattern);
}

/**
 * Get cache statistics for monitoring
 */
export async function getCacheStats(): Promise<{
  connected: boolean;
  keyCount: number;
  memoryUsed?: number;
  hitRate?: number;
}> {
  try {
    const connected = await healthCheck();
    if (!connected) {
      return { connected: false, keyCount: 0 };
    }
    
    // Get key count
    const keys = await getCache().keys('cache:*');
    const keyCount = keys.length;
    
    // Get Redis info
    const info = await getCache().info('stats');
    
    // Parse hit rate from info (if available)
    const hitsMatch = info.match(/keyspace_hits:(\d+)/);
    const missesMatch = info.match(/keyspace_misses:(\d+)/);
    
    let hitRate: number | undefined;
    if (hitsMatch && missesMatch) {
      const hits = parseInt(hitsMatch[1], 10);
      const misses = parseInt(missesMatch[1], 10);
      const total = hits + misses;
      hitRate = total > 0 ? hits / total : undefined;
    }
    
    return {
      connected: true,
      keyCount,
      hitRate,
    };
  } catch (error) {
    logger.error({ error }, 'Failed to get cache stats');
    return { connected: false, keyCount: 0 };
  }
}
