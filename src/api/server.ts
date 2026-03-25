import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { logger } from '../observability/logger.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';

// CORS origins from environment
const corsOrigins = process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'];

/**
 * Create and configure Fastify server with security plugins
 */
export async function buildServer() {
  const server = Fastify({
    logger: logger,
    trustProxy: true,
    requestIdLogLabel: 'requestId',
    disableRequestLogging: false,
    bodyLimit: parseInt(process.env.REQUEST_BODY_SIZE_LIMIT || '1048576', 10), // 1MB default
    requestTimeout: parseInt(process.env.REQUEST_TIMEOUT_MS || '30000', 10)
  });

  // Security headers
  await server.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: { policy: 'same-origin' },
    dnsPrefetchControl: { allow: false },
    frameguard: { action: 'deny' },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    ieNoOpen: true,
    noSniff: true,
    originAgentCluster: true,
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xssFilter: true
  });

  // CORS configuration
  await server.register(cors, {
    origin: NODE_ENV === 'production' ? corsOrigins : true,
    credentials: process.env.CORS_CREDENTIALS === 'true',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    exposedHeaders: ['X-Request-ID'],
    maxAge: 86400 // 24 hours
  });

  // Rate limiting with Redis store
  await server.register(rateLimit, {
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
    timeWindow: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
    cache: 10000,
    allowList: ['127.0.0.1'],
    redis: process.env.REDIS_URL ? 
      // Use Redis for distributed rate limiting in production
      require('ioredis').default.createClient(process.env.REDIS_URL) : 
      undefined,
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true
    },
    errorResponseBuilder: () => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.'
    })
  });

  // Health check endpoint (unauthenticated)
  server.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'hampshire-bin-platform',
    version: process.env.npm_package_version || '0.1.0'
  }));

  // Ready check (includes dependency checks)
  server.get('/ready', async (request, reply) => {
    // TODO: Add database and Redis connection checks
    const checks = {
      database: 'ok', // TODO: await db.ping()
      cache: 'ok',    // TODO: await redis.ping()
      storage: 'ok'   // TODO: await storage.healthCheck()
    };

    const allHealthy = Object.values(checks).every(status => status === 'ok');
    
    reply.code(allHealthy ? 200 : 503);
    return {
      status: allHealthy ? 'ready' : 'not ready',
      checks,
      timestamp: new Date().toISOString()
    };
  });

  // TODO: Register API routes
  // await server.register(councilsRoutes, { prefix: '/api/v1/councils' });
  // await server.register(propertiesRoutes, { prefix: '/api/v1/properties' });
  // await server.register(adminRoutes, { prefix: '/api/v1/admin' });

  // Global error handler - sanitize errors in production
  server.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error, requestId: request.id }, 'Request error');

    // Don't leak stack traces in production
    const isDevelopment = NODE_ENV === 'development';
    
    if (error.statusCode && error.statusCode < 500) {
      // Client errors - safe to return
      reply.status(error.statusCode).send({
        statusCode: error.statusCode,
        error: error.name,
        message: error.message
      });
    } else {
      // Server errors - sanitize
      reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: isDevelopment ? error.message : 'An unexpected error occurred',
        ...(isDevelopment && { stack: error.stack })
      });
    }
  });

  // 404 handler
  server.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: `Route ${request.method}:${request.url} not found`
    });
  });

  return server;
}

/**
 * Start the server
 */
export async function start() {
  const server = await buildServer();

  // Graceful shutdown
  const gracefulShutdown = async (signal: string) => {
    server.log.info(`Received ${signal}, starting graceful shutdown`);
    
    const shutdownTimeout = parseInt(
      process.env.SHUTDOWN_TIMEOUT_MS || '10000',
      10
    );

    const timeoutHandle = setTimeout(() => {
      server.log.error('Shutdown timeout exceeded, forcing exit');
      process.exit(1);
    }, shutdownTimeout);

    try {
      await server.close();
      clearTimeout(timeoutHandle);
      server.log.info('Server closed successfully');
      process.exit(0);
    } catch (err) {
      server.log.error({ err }, 'Error during shutdown');
      clearTimeout(timeoutHandle);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Start listening
  try {
    await server.listen({ port: PORT, host: HOST });
    server.log.info(`Server listening on ${HOST}:${PORT}`);
  } catch (err) {
    server.log.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}

// Start server if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  start().catch((err) => {
    console.error('Fatal error starting server:', err);
    process.exit(1);
  });
}
