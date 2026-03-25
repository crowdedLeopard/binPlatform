/**
 * Health Check Endpoints
 * 
 * Provides liveness and readiness probes for container orchestration.
 * SECURITY: Exposes NO sensitive information (versions, dependencies, internal IPs, etc.)
 */

import type { FastifyPluginAsync } from 'fastify';
import type { Pool } from 'pg';
import type Redis from 'ioredis';

interface HealthCheckDeps {
  db: Pool;
  redis: Redis;
}

export const healthRoutes: FastifyPluginAsync<HealthCheckDeps> = async (fastify, opts) => {
  const { db, redis } = opts;

  /**
   * Liveness probe
   * Returns 200 if process is alive and can serve requests.
   * Does NOT check dependencies - just process health.
   */
  fastify.get('/health', async (request, reply) => {
    return reply.status(200).send({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * Liveness probe (explicit)
   * Alias for /health for Kubernetes-style naming
   */
  fastify.get('/health/live', async (request, reply) => {
    return reply.status(200).send({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * Readiness probe
   * Returns 200 if service is ready to accept traffic.
   * Checks database and Redis connectivity.
   * Returns 503 if dependencies are unavailable.
   */
  fastify.get('/health/ready', async (request, reply) => {
    const checks: Record<string, boolean> = {};
    let allHealthy = true;

    // Check database connectivity
    try {
      await db.query('SELECT 1');
      checks.database = true;
    } catch (err) {
      checks.database = false;
      allHealthy = false;
      request.log.error({ err }, 'Database health check failed');
    }

    // Check Redis connectivity
    try {
      await redis.ping();
      checks.redis = true;
    } catch (err) {
      checks.redis = false;
      allHealthy = false;
      request.log.error({ err }, 'Redis health check failed');
    }

    const status = allHealthy ? 200 : 503;
    
    return reply.status(status).send({
      status: allHealthy ? 'ready' : 'not_ready',
      checks,
      timestamp: new Date().toISOString(),
    });
  });
};
