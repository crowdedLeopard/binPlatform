import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { logger } from '../observability/logger.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load council registry at startup
const __dirname = dirname(fileURLToPath(import.meta.url));
let councilRegistry: any[] = [];
try {
  const raw = JSON.parse(readFileSync(join(__dirname, '../../data/council-registry.json'), 'utf8'));
  councilRegistry = Array.isArray(raw) ? raw : (raw.councils ?? Object.values(raw));
} catch { /* registry unavailable */ }

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
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
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
    xssFilter: false,  // Deprecated header - disabled
  });

  // Remove server identification headers
  server.addHook('onSend', async (request, reply) => {
    reply.removeHeader('Server');
    reply.removeHeader('X-Powered-By');
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
  // Inline v1 routes — council registry served from data/council-registry.json
  server.get('/v1/councils', async () => ({
    councils: councilRegistry.map(c => ({
      council_id: c.council_id,
      council_name: c.council_name,
      official_waste_url: c.official_waste_url,
      lookup_method: c.lookup_method,
      required_input: c.required_input,
      confidence_score: c.confidence_score,
      adapter_status: c.adapter_status,
      upstream_risk_level: c.upstream_risk_level
    })),
    count: councilRegistry.length,
    source_timestamp: new Date().toISOString()
  }));

  server.get('/v1/councils/:councilId', async (request: any, reply: any) => {
    const council = councilRegistry.find(c => c.council_id === request.params.councilId);
    if (!council) {
      reply.code(404).send({ statusCode: 404, error: 'Not Found', message: `Council '${request.params.councilId}' not found` });
      return;
    }
    return { council, source_timestamp: new Date().toISOString() };
  });

  server.get('/v1/councils/:councilId/health', async (request: any, reply: any) => {
    const council = councilRegistry.find(c => c.council_id === request.params.councilId);
    if (!council) {
      reply.code(404).send({ statusCode: 404, error: 'Not Found', message: `Council '${request.params.councilId}' not found` });
      return;
    }
    const killSwitchKey = `ADAPTER_KILL_SWITCH_${council.council_id.toUpperCase().replace(/-/g, '_')}`;
    const isKilled = process.env[killSwitchKey] === 'true';
    return {
      council_id: council.council_id,
      status: isKilled ? 'disabled' : council.adapter_status ?? 'unknown',
      kill_switch_active: isKilled,
      confidence_score: council.confidence_score,
      upstream_risk_level: council.upstream_risk_level,
      checked_at: new Date().toISOString()
    };
  });

  // Global error handler - sanitize errors in production
  server.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error, requestId: request.id }, 'Request error');

    // Don't leak stack traces in production
    const isDevelopment = NODE_ENV === 'development';
    
    // Type guard for error with statusCode
    const hasStatusCode = (err: unknown): err is { statusCode: number; name: string; message: string; stack?: string } => {
      return typeof err === 'object' && err !== null && 'statusCode' in err;
    };
    
    if (hasStatusCode(error) && error.statusCode < 500) {
      // Client errors - safe to return
      reply.status(error.statusCode).send({
        statusCode: error.statusCode,
        error: error.name,
        message: error.message
      });
    } else {
      // Server errors - sanitize
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: isDevelopment ? errorMessage : 'An unexpected error occurred',
        ...(isDevelopment && errorStack && { stack: errorStack })
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
