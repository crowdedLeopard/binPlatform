// TODO: Implement property routes
// POST /api/v1/properties/search - Search for property by postcode/address
// GET /api/v1/properties/:propertyId - Get property details
// GET /api/v1/properties/:propertyId/collections - Get collection schedule

import { FastifyPluginAsync } from 'fastify';

export const propertiesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/search', async (request, reply) => {
    // TODO: Validate request body with Zod schema
    // TODO: Call property resolution service
    // TODO: Return matching properties with confidence scores
    return { properties: [] };
  });

  fastify.get('/:propertyId', async (request, reply) => {
    // TODO: Return property details
    return { propertyId: (request.params as { propertyId: string }).propertyId };
  });

  fastify.get('/:propertyId/collections', async (request, reply) => {
    // TODO: Return collection schedule for property
    // TODO: Check cache first, then database
    return { collections: [] };
  });
};
