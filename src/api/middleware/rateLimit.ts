// TODO: Custom rate limiting middleware (in addition to global)
// - Per-endpoint rate limits
// - Different limits for authenticated vs unauthenticated
// - Burst allowances
// - Redis-backed distributed rate limiting

import { FastifyRequest, FastifyReply } from 'fastify';

export async function rateLimitByKey(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // TODO: Extract API key from request context
  // TODO: Check rate limit in Redis
  // TODO: Increment counter
  // TODO: Return 429 if exceeded
}
