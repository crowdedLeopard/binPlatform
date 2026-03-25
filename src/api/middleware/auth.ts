// TODO: Implement API key authentication middleware
// - Extract API key from X-API-Key header
// - Hash and compare with stored hashes
// - Rate limit per key
// - Log authentication attempts

import { FastifyRequest, FastifyReply } from 'fastify';

export async function verifyApiKey(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const apiKey = request.headers['x-api-key'];

  if (!apiKey || typeof apiKey !== 'string') {
    reply.code(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'API key required'
    });
    return;
  }

  // TODO: Hash API key with bcrypt
  // TODO: Compare with stored hashes in database
  // TODO: Load rate limits and permissions for this key
  // TODO: Attach key metadata to request context

  // Stub - always deny
  reply.code(401).send({
    statusCode: 401,
    error: 'Unauthorized',
    message: 'Invalid API key'
  });
}

export async function verifyAdminApiKey(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // TODO: Verify admin-level API key
  // Same as verifyApiKey but check for admin role
  await verifyApiKey(request, reply);
}
