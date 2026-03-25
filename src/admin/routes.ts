// TODO: Admin routes implementation
import { FastifyPluginAsync } from 'fastify';

export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  // TODO: Same as api/routes/admin.ts
  // Consider consolidating or this is for internal admin panel
  fastify.get('/health', async () => ({ status: 'ok' }));
};
