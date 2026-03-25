// TODO: Request validation middleware using Zod schemas
// - Validate query parameters
// - Validate request body
// - Validate path parameters
// - Return 400 with detailed error messages

import { FastifyRequest, FastifyReply } from 'fastify';
import { z, ZodSchema } from 'zod';

export function validateBody<T extends ZodSchema>(schema: T) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const validated = schema.parse(request.body);
      (request as any).validatedBody = validated;
    } catch (err) {
      if (err instanceof z.ZodError) {
        reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Validation failed',
          details: err.errors
        });
      } else {
        throw err;
      }
    }
  };
}

export function validateQuery<T extends ZodSchema>(schema: T) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const validated = schema.parse(request.query);
      (request as any).validatedQuery = validated;
    } catch (err) {
      if (err instanceof z.ZodError) {
        reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Validation failed',
          details: err.errors
        });
      } else {
        throw err;
      }
    }
  };
}
