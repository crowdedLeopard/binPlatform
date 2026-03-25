// TODO: Implement council routes
// GET /api/v1/councils - List all councils
// GET /api/v1/councils/:councilId - Get council details
// GET /api/v1/councils/:councilId/status - Get adapter status and health

import { FastifyPluginAsync } from 'fastify';

export const councilsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async (request, reply) => {
    // TODO: Return list of councils from registry
    return { councils: [] };
  });

  fastify.get('/:councilId', async (request, reply) => {
    // TODO: Return council details
    return { councilId: (request.params as { councilId: string }).councilId };
  });

  fastify.get('/:councilId/status', async (request, reply) => {
    // TODO: Return adapter status, kill switch state, last run
    return { status: 'unknown' };
  });
};
