// TODO: Redis cache client
// Connection management, health checks, common cache operations

import Redis from 'ioredis';
import { logger } from '../../observability/logger.js';

let redis: Redis | null = null;

export interface CacheConfig {
  url: string;
  tls?: boolean;
  keyPrefix?: string;
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
    logger.info('Redis connected');
  });

  redis.on('ready', () => {
    logger.info('Redis ready');
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
    logger.info('Cache connection closed');
  }
}

// Common cache operations
export async function get<T>(key: string): Promise<T | null> {
  const value = await getCache().get(key);
  return value ? JSON.parse(value) : null;
}

export async function set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
  const serialized = JSON.stringify(value);
  if (ttlSeconds) {
    await getCache().setex(key, ttlSeconds, serialized);
  } else {
    await getCache().set(key, serialized);
  }
}

export async function del(key: string): Promise<void> {
  await getCache().del(key);
}

export async function invalidatePattern(pattern: string): Promise<number> {
  const keys = await getCache().keys(pattern);
  if (keys.length > 0) {
    return await getCache().del(...keys);
  }
  return 0;
}
