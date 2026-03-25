/**
 * Hampshire Bin Collection Data Platform
 * Cache Control Middleware
 *
 * Implements appropriate cache control headers based on data sensitivity.
 * - Sensitive endpoints (addresses, UPRNs): no-store (never cache)
 * - Private endpoints (per-user data): private, short TTL
 * - Public endpoints (councils list, health): public, moderate TTL
 *
 * @module api/middleware/cache-control
 */

import type { Context, Next } from 'hono';

/**
 * Cache control for sensitive endpoints.
 * Use for endpoints returning addresses, UPRNs, or other PII.
 * Prevents browser/proxy caching of sensitive data.
 */
export async function cacheControlSensitive(c: Context, next: Next): Promise<void> {
  await next();
  
  // No caching whatsoever - HTTP/1.1 and HTTP/1.0 compat
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  c.header('Pragma', 'no-cache');  // HTTP/1.0 compatibility
  c.header('Expires', '0');         // Proxies
}

/**
 * Cache control for private per-user data.
 * Use for authenticated endpoints returning user-specific data.
 * Short TTL allows browser caching but not shared caches.
 */
export async function cacheControlPrivate(c: Context, next: Next): Promise<void> {
  await next();
  
  // Private cache only (not shared/proxy caches), 60 second TTL
  c.header('Cache-Control', 'private, max-age=60, must-revalidate');
}

/**
 * Cache control for public data.
 * Use for endpoints returning public information (councils list, health status).
 * Allows caching by browsers and CDNs to reduce load.
 */
export async function cacheControlPublic(c: Context, next: Next): Promise<void> {
  await next();
  
  // Public cache allowed, 5 minute TTL
  c.header('Cache-Control', 'public, max-age=300');
}

/**
 * Cache control for immutable static data.
 * Use for resources that never change (council metadata, static assets).
 * Long TTL with immutable directive for maximum cache efficiency.
 */
export async function cacheControlImmutable(c: Context, next: Next): Promise<void> {
  await next();
  
  // Public cache with long TTL and immutable directive
  c.header('Cache-Control', 'public, max-age=31536000, immutable');
}

/**
 * No cache control (use sparingly).
 * Use only when you want to rely on default browser/proxy behavior.
 * Generally avoid this - be explicit about caching intent.
 */
export async function cacheControlNone(c: Context, next: Next): Promise<void> {
  await next();
  // No Cache-Control header set - use default behavior
}

/**
 * Automatically determine cache control based on path.
 * Apply this middleware globally or to route groups.
 */
export async function cacheControlAuto(c: Context, next: Next): Promise<void> {
  const path = c.req.path;

  // Sensitive endpoints - never cache
  if (
    path.includes('/addresses') ||
    path.includes('/resolve') ||
    path.includes('/uprn') ||
    path.includes('/properties') ||
    path.includes('/admin')
  ) {
    return cacheControlSensitive(c, next);
  }

  // Public endpoints - moderate caching
  if (
    path.includes('/health') ||
    path.includes('/ready') ||
    path.includes('/councils') ||
    path === '/'
  ) {
    return cacheControlPublic(c, next);
  }

  // Per-user data - private caching
  if (
    path.includes('/collections') ||
    path.includes('/schedules')
  ) {
    return cacheControlPrivate(c, next);
  }

  // Default: no caching for unknown endpoints
  return cacheControlSensitive(c, next);
}
