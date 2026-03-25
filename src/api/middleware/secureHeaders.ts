// TODO: Additional security headers middleware
// Already using @fastify/helmet, but this file can contain:
// - Custom CSP policies per route
// - CORP/COEP/COOP overrides
// - Request/response sanitization
// - Input filtering

import { FastifyRequest, FastifyReply } from 'fastify';

export async function additionalSecurityHeaders(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // TODO: Add any custom security headers not covered by helmet
  // e.g., Permissions-Policy, Clear-Site-Data on logout
}
