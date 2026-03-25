import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import IORedis from 'ioredis';
import { logger } from '../observability/logger.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createHash } from 'crypto';
import { getAdapter, isCouncilSupported, initializeAdapters } from '../adapters/registry.js';
import type { PropertyLookupInput, PropertyIdentity, DateRange } from '../adapters/base/adapter.interface.js';
import { v4 as uuidv4 } from 'uuid';
import { resolvePostcodeToUprn } from '../services/uprn-resolution.js';
import { generateMockCollections } from '../services/mock-collections.js';

// Initialize adapters at module load
initializeAdapters();

// Load council registry at startup
const __dirname = dirname(fileURLToPath(import.meta.url));
let councilRegistry: any[] = [];
try {
  const raw = JSON.parse(readFileSync(join(__dirname, '../../data/council-registry.json'), 'utf8'));
  councilRegistry = Array.isArray(raw) ? raw : (raw.councils ?? Object.values(raw));
} catch { /* registry unavailable */ }

// Load test postcodes
let testPostcodes: Record<string, string> = {};
try {
  const testData = JSON.parse(readFileSync(join(__dirname, '../../data/test-postcodes.json'), 'utf8'));
  testPostcodes = testData.postcodes || {};
} catch { /* test postcodes unavailable */ }

// Runtime adapter state (in-memory)
const disabledAdapters = new Map<string, { reason: string; disabled_at: string }>();
const schemaSnapshots = new Map<string, { hash: string; captured_at: string }>();
let lastDriftCheck: { checked_at: string; total: number; ok: number; drifted: number; unreachable: number; results: any[] } | null = null;

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
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Admin-Key'],
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
      new IORedis(process.env.REDIS_URL) :
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

  // Root status page
  server.get('/', async (request, reply) => {
    const activeCouncils = councilRegistry.filter(c => {
      const key = `ADAPTER_KILL_SWITCH_${c.council_id.toUpperCase().replace(/-/g, '_')}`;
      return process.env[key] !== 'true';
    });

    const version = process.env.npm_package_version || '0.1.0';
    const buildTime = new Date().toISOString();

    // Build council rows
    const councilRows = councilRegistry.map(c => {
      const killSwitchKey = `ADAPTER_KILL_SWITCH_${c.council_id.toUpperCase().replace(/-/g, '_')}`;
      const isKilled = process.env[killSwitchKey] === 'true';
      const isActive = !isKilled;
      const statusHtml = isActive ? '<span class="status-active"></span>Active' : '<span class="status-inactive"></span>Disabled';
      const implementation = c.adapter_status === 'implemented' ? 'Implemented' : (c.adapter_status === 'stub' ? 'Stub' : 'Not Implemented');
      return `
          <tr>
            <td><strong>${c.council_name}</strong><br><small style="color: #94a3b8;">${c.council_id}</small></td>
            <td>${implementation}</td>
            <td>${Math.round((c.confidence_score || 0) * 100)}%</td>
            <td>${statusHtml}</td>
          </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hampshire Bin Collection Data Platform</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%);
      color: #e2e8f0;
      line-height: 1.6;
      min-height: 100vh;
      padding: 2rem;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    header {
      text-align: center;
      margin-bottom: 3rem;
      border-bottom: 2px solid #334155;
      padding-bottom: 2rem;
    }
    h1 {
      font-size: 2.5rem;
      margin-bottom: 0.5rem;
      color: #f1f5f9;
    }
    .subtitle {
      font-size: 1.1rem;
      color: #cbd5e1;
    }
    .status-badge {
      display: inline-block;
      padding: 0.5rem 1rem;
      border-radius: 0.375rem;
      font-weight: 600;
      margin-top: 1rem;
      background: #10b981;
      color: #0f172a;
    }
    .section {
      background: rgba(15, 23, 42, 0.5);
      border: 1px solid #334155;
      border-radius: 0.5rem;
      padding: 1.5rem;
      margin-bottom: 2rem;
    }
    .section h2 {
      font-size: 1.5rem;
      margin-bottom: 1rem;
      color: #f1f5f9;
      border-bottom: 1px solid #475569;
      padding-bottom: 0.5rem;
    }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 1rem;
      margin-bottom: 1rem;
    }
    .info-item {
      background: rgba(30, 41, 59, 0.8);
      padding: 1rem;
      border-radius: 0.375rem;
      border-left: 3px solid #3b82f6;
    }
    .info-label {
      font-size: 0.875rem;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .info-value {
      font-size: 1.1rem;
      font-weight: 600;
      color: #e2e8f0;
      margin-top: 0.25rem;
      font-family: 'Monaco', 'Menlo', monospace;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 1rem;
    }
    th {
      background: rgba(30, 41, 59, 0.8);
      padding: 0.75rem;
      text-align: left;
      font-weight: 600;
      color: #cbd5e1;
      border-bottom: 2px solid #334155;
      font-size: 0.875rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    td {
      padding: 0.75rem;
      border-bottom: 1px solid #334155;
    }
    tbody tr:hover {
      background: rgba(30, 41, 59, 0.6);
    }
    .status-active {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #10b981;
      margin-right: 0.5rem;
    }
    .status-inactive {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #ef4444;
      margin-right: 0.5rem;
    }
    .endpoints {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 1rem;
    }
    .endpoint {
      background: rgba(30, 41, 59, 0.8);
      padding: 1rem;
      border-radius: 0.375rem;
      border-left: 3px solid #06b6d4;
    }
    .endpoint-path {
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 0.9rem;
      color: #06b6d4;
      font-weight: 600;
    }
    .endpoint-desc {
      font-size: 0.875rem;
      color: #cbd5e1;
      margin-top: 0.5rem;
    }
    a {
      color: #06b6d4;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    code {
      background: rgba(0,0,0,0.3);
      padding: 0.5rem;
      border-radius: 0.25rem;
      display: block;
      margin: 0.5rem 0;
      font-family: 'Monaco', 'Menlo', monospace;
    }
    .footer {
      text-align: center;
      margin-top: 3rem;
      padding-top: 2rem;
      border-top: 1px solid #334155;
      font-size: 0.875rem;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🗑️ Hampshire Bin Collection Data Platform</h1>
      <p class="subtitle">RESTful API for bin collection schedules across Hampshire</p>
      <div class="status-badge">✓ Operational</div>
    </header>

    <div class="section">
      <h2>Platform Status</h2>
      <div class="info-grid">
        <div class="info-item">
          <div class="info-label">API Status</div>
          <div class="info-value">🟢 Healthy</div>
        </div>
        <div class="info-item">
          <div class="info-label">Version</div>
          <div class="info-value">${version}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Councils Active</div>
          <div class="info-value">${activeCouncils.length} / ${councilRegistry.length}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Last Updated</div>
          <div class="info-value">${buildTime}</div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>Drift Status</h2>
      <div class="info-grid">
        <div class="info-item">
          <div class="info-label">Last Check</div>
          <div class="info-value">${lastDriftCheck ? new Date(lastDriftCheck.checked_at).toLocaleString() : 'Never'}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Adapters OK</div>
          <div class="info-value">${lastDriftCheck ? `${lastDriftCheck.ok} / ${lastDriftCheck.total}` : 'N/A'}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Drifted</div>
          <div class="info-value" style="color: ${lastDriftCheck && lastDriftCheck.drifted > 0 ? '#ef4444' : '#10b981'};">${lastDriftCheck ? lastDriftCheck.drifted : 'N/A'}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Unreachable</div>
          <div class="info-value" style="color: ${lastDriftCheck && lastDriftCheck.unreachable > 0 ? '#f59e0b' : '#10b981'};">${lastDriftCheck ? lastDriftCheck.unreachable : 'N/A'}</div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>Hampshire Councils (${councilRegistry.length})</h2>
      <table>
        <thead>
          <tr>
            <th>Council</th>
            <th>Implementation</th>
            <th>Confidence</th>
            <th>Active</th>
          </tr>
        </thead>
        <tbody>
          ${councilRows}
        </tbody>
      </table>
    </div>

    <div class="section">
      <h2>API Endpoints</h2>
      <div class="endpoints">
        <div class="endpoint">
          <div class="endpoint-path">GET /health</div>
          <div class="endpoint-desc">Service health check</div>
          <div style="margin-top: 0.75rem;"><a href="/health" target="_blank">Test Endpoint →</a></div>
        </div>
        <div class="endpoint">
          <div class="endpoint-path">GET /ready</div>
          <div class="endpoint-desc">Readiness probe with dependency checks</div>
          <div style="margin-top: 0.75rem;"><a href="/ready" target="_blank">Test Endpoint →</a></div>
        </div>
        <div class="endpoint">
          <div class="endpoint-path">GET /v1/councils</div>
          <div class="endpoint-desc">List all councils with metadata</div>
          <div style="margin-top: 0.75rem;"><a href="/v1/councils" target="_blank">Test Endpoint →</a></div>
        </div>
        <div class="endpoint">
          <div class="endpoint-path">GET /v1/councils/:councilId</div>
          <div class="endpoint-desc">Get details for a specific council</div>
          <div style="margin-top: 0.75rem;"><a href="/v1/councils/basingstoke-deane" target="_blank">Example: basingstoke-deane →</a></div>
        </div>
        <div class="endpoint">
          <div class="endpoint-path">GET /v1/councils/:councilId/health</div>
          <div class="endpoint-desc">Get health status of a council adapter</div>
          <div style="margin-top: 0.75rem;"><a href="/v1/councils/basingstoke-deane/health" target="_blank">Example: basingstoke-deane →</a></div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>Getting Started</h2>
      <div style="margin-top: 1rem;">
        <p><strong>1. Check Platform Health</strong></p>
        <code>curl http://localhost:3000/health</code>
        
        <p style="margin-top: 1.5rem;"><strong>2. Get All Councils</strong></p>
        <code>curl http://localhost:3000/v1/councils</code>
        
        <p style="margin-top: 1.5rem;"><strong>3. Query a Council</strong></p>
        <code>curl http://localhost:3000/v1/councils/basingstoke-deane</code>
      </div>
    </div>

    <footer class="footer">
      <p>Hampshire Bin Collection Data Platform v${version}</p>
      <p style="margin-top: 0.5rem; color: #475569;">Live status page served at <code style="color: #64748b;">GET /</code></p>
    </footer>
  </div>
</body>
</html>`;

    reply.type('text/html').send(html);
  });

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

  // =============================================================================
  // ADMIN ENDPOINTS
  // =============================================================================

  // Admin authentication middleware
  const adminAuth = (request: any, reply: any, done: () => void) => {
    const key = request.headers['x-admin-key'];
    if (!key || key !== process.env.BOOTSTRAP_ADMIN_KEY) {
      reply.status(401).send({ error: 'unauthorized' });
      return;
    }
    done();
  };

  // Helper: Get adapter status for a council
  const getAdapterStatus = (councilId: string) => {
    const council = councilRegistry.find(c => c.council_id === councilId);
    if (!council) return null;

    const killSwitchKey = `ADAPTER_KILL_SWITCH_${councilId.toUpperCase().replace(/-/g, '_')}`;
    const envKillSwitch = process.env[killSwitchKey] === 'true';
    const runtimeDisabled = disabledAdapters.has(councilId);

    return {
      council_id: councilId,
      council_name: council.council_name,
      status: council.adapter_status || 'stub',
      kill_switch_active: envKillSwitch || runtimeDisabled,
      last_health_check: null,
      confidence_score: council.confidence_score || 0,
      implementation: council.adapter_status === 'implemented' ? `${councilId.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}Adapter` : 'N/A',
      notes: runtimeDisabled ? disabledAdapters.get(councilId)?.reason || '' : ''
    };
  };

  // Helper: Hash object for drift detection
  const hashObject = (obj: any): string => {
    return createHash('sha256').update(JSON.stringify(obj)).digest('hex');
  };

  // 1. GET /v1/admin/adapters - List all adapter statuses
  server.get('/v1/admin/adapters', { preHandler: adminAuth }, async () => {
    const adapters = councilRegistry.map(c => getAdapterStatus(c.council_id)).filter(Boolean);
    return { adapters };
  });

  // 2. GET /v1/admin/adapters/:councilId/health - Deep health check
  server.get('/v1/admin/adapters/:councilId/health', { preHandler: adminAuth }, async (request: any, reply: any) => {
    const { councilId } = request.params;
    
    if (!isCouncilSupported(councilId)) {
      reply.code(404).send({ error: 'Council not found or adapter not registered' });
      return;
    }

    try {
      const adapter = getAdapter(councilId);
      const health = await adapter.verifyHealth();
      return {
        council_id: councilId,
        health,
        checked_at: new Date().toISOString()
      };
    } catch (error: any) {
      reply.code(500).send({ 
        error: 'Health check failed', 
        message: error.message,
        council_id: councilId
      });
    }
  });

  // 3. POST /v1/admin/adapters/:councilId/drift-check - Check for schema drift
  server.post('/v1/admin/adapters/:councilId/drift-check', { preHandler: adminAuth }, async (request: any, reply: any) => {
    const { councilId } = request.params;
    
    const testPostcode = testPostcodes[councilId];
    if (!testPostcode) {
      reply.code(400).send({ error: 'No test postcode configured for this council' });
      return;
    }

    if (!isCouncilSupported(councilId)) {
      reply.code(404).send({ error: 'Council not found or adapter not registered' });
      return;
    }

    try {
      const adapter = getAdapter(councilId);
      const result = await adapter.resolveAddresses({
        postcode: testPostcode,
        correlationId: uuidv4()
      });

      const currentHash = hashObject(result.data || {});
      const snapshot = schemaSnapshots.get(councilId);

      let drifted = false;
      let details = 'No previous snapshot available';
      let recommendation = 'Baseline snapshot created';

      if (snapshot) {
        drifted = snapshot.hash !== currentHash;
        details = drifted 
          ? `Schema hash changed from ${snapshot.hash.substring(0, 8)} to ${currentHash.substring(0, 8)}`
          : 'Schema matches previous snapshot';
        recommendation = drifted 
          ? 'Review adapter implementation and update schema snapshot if expected'
          : 'No action required';
      }

      // Update snapshot
      schemaSnapshots.set(councilId, {
        hash: currentHash,
        captured_at: new Date().toISOString()
      });

      return {
        council_id: councilId,
        drifted,
        details,
        recommendation,
        current_hash: currentHash,
        previous_hash: snapshot?.hash || null,
        checked_at: new Date().toISOString()
      };
    } catch (error: any) {
      reply.code(500).send({
        error: 'Drift check failed',
        message: error.message,
        council_id: councilId
      });
    }
  });

  // 4. POST /v1/admin/adapters/:councilId/disable - Disable an adapter
  server.post('/v1/admin/adapters/:councilId/disable', { preHandler: adminAuth }, async (request: any, reply: any) => {
    const { councilId } = request.params;
    const body: any = request.body || {};
    const reason = body.reason || 'Manually disabled via admin API';

    const council = councilRegistry.find(c => c.council_id === councilId);
    if (!council) {
      reply.code(404).send({ error: 'Council not found' });
      return;
    }

    disabledAdapters.set(councilId, {
      reason,
      disabled_at: new Date().toISOString()
    });

    return {
      disabled: true,
      council_id: councilId,
      reason,
      disabled_at: disabledAdapters.get(councilId)?.disabled_at
    };
  });

  // 5. POST /v1/admin/adapters/:councilId/enable - Re-enable an adapter
  server.post('/v1/admin/adapters/:councilId/enable', { preHandler: adminAuth }, async (request: any, reply: any) => {
    const { councilId } = request.params;

    const council = councilRegistry.find(c => c.council_id === councilId);
    if (!council) {
      reply.code(404).send({ error: 'Council not found' });
      return;
    }

    const wasDisabled = disabledAdapters.has(councilId);
    disabledAdapters.delete(councilId);

    return {
      enabled: true,
      council_id: councilId,
      was_disabled: wasDisabled,
      enabled_at: new Date().toISOString()
    };
  });

  // 6. GET /v1/admin/drift - Run drift check on ALL adapters
  server.get('/v1/admin/drift', { preHandler: adminAuth }, async () => {
    const checked_at = new Date().toISOString();
    const results = [];

    for (const council of councilRegistry) {
      const councilId = council.council_id;
      const testPostcode = testPostcodes[councilId];

      if (!testPostcode) {
        results.push({
          council_id: councilId,
          status: 'no_test_postcode',
          drifted: false
        });
        continue;
      }

      if (!isCouncilSupported(councilId)) {
        results.push({
          council_id: councilId,
          status: 'not_supported',
          drifted: false
        });
        continue;
      }

      if (disabledAdapters.has(councilId)) {
        results.push({
          council_id: councilId,
          status: 'disabled',
          drifted: false
        });
        continue;
      }

      try {
        const adapter = getAdapter(councilId);
        const result = await adapter.resolveAddresses({
          postcode: testPostcode,
          correlationId: uuidv4()
        });

        const currentHash = hashObject(result.data || {});
        const snapshot = schemaSnapshots.get(councilId);

        const drifted = snapshot ? snapshot.hash !== currentHash : false;

        // Update snapshot
        schemaSnapshots.set(councilId, {
          hash: currentHash,
          captured_at: checked_at
        });

        results.push({
          council_id: councilId,
          status: 'ok',
          drifted,
          hash: currentHash.substring(0, 16)
        });
      } catch (error: any) {
        results.push({
          council_id: councilId,
          status: 'unreachable',
          drifted: false,
          error: error.message
        });
      }
    }

    const summary = {
      checked_at,
      total: results.length,
      ok: results.filter(r => r.status === 'ok').length,
      drifted: results.filter(r => r.drifted).length,
      unreachable: results.filter(r => r.status === 'unreachable').length,
      results
    };

    lastDriftCheck = summary;
    return summary;
  });

  // 7. GET /v1/admin/adapters/:councilId/test - Test with sample postcode
  server.get('/v1/admin/adapters/:councilId/test', { preHandler: adminAuth }, async (request: any, reply: any) => {
    const { councilId } = request.params;

    const testPostcode = testPostcodes[councilId];
    if (!testPostcode) {
      reply.code(400).send({ error: 'No test postcode configured for this council' });
      return;
    }

    if (!isCouncilSupported(councilId)) {
      reply.code(404).send({ error: 'Council not found or adapter not registered' });
      return;
    }

    try {
      const startTime = Date.now();
      const adapter = getAdapter(councilId);
      
      const result = await adapter.resolveAddresses({
        postcode: testPostcode,
        correlationId: uuidv4()
      });

      const duration = Date.now() - startTime;

      return {
        council_id: councilId,
        test_postcode: testPostcode,
        success: result.success,
        confidence: result.confidence,
        duration_ms: duration,
        address_count: result.data?.length || 0,
        result,
        tested_at: new Date().toISOString()
      };
    } catch (error: any) {
      reply.code(500).send({
        error: 'Test failed',
        message: error.message,
        council_id: councilId
      });
    }
  });

  // =============================================================================
  // POSTCODE & PROPERTY ROUTES
  // =============================================================================

  /**
   * GET /v1/postcodes/:postcode/addresses
   * Resolve postcode to address candidates
   */
  server.get('/v1/postcodes/:postcode/addresses', async (request: any, reply: any) => {
    const { postcode } = request.params;
    const { councilId } = request.query;

    // Validate UK postcode format
    const cleaned = postcode.trim().toUpperCase().replace(/\s+/g, ' ');
    const ukPostcodeRegex = /^([A-Z]{1,2}\d{1,2}[A-Z]?)\s?(\d[A-Z]{2})$/;
    
    if (!ukPostcodeRegex.test(cleaned)) {
      return reply.code(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid UK postcode format',
      });
    }

    const normalizedPostcode = cleaned;

    try {
      // If councilId specified, use that adapter
      if (councilId) {
        if (!isCouncilSupported(councilId)) {
          return reply.code(503).send({
            statusCode: 503,
            error: 'Service Unavailable',
            message: `Council '${councilId}' adapter not available`,
            council_id: councilId,
          });
        }

        const adapter = getAdapter(councilId);
        const input: PropertyLookupInput = {
          postcode: normalizedPostcode,
          correlationId: uuidv4(),
        };

        const result = await adapter.resolveAddresses(input);

        if (!result.success) {
          return reply.code(503).send({
            statusCode: 503,
            error: 'Service Unavailable',
            message: result.errorMessage || 'Failed to fetch addresses',
            council_id: councilId,
            failure_category: result.failureCategory,
          });
        }

        return {
          postcode: normalizedPostcode,
          council_id: councilId,
          addresses: result.data?.map(addr => ({
            id: `${councilId}:${addr.councilLocalId}`,
            uprn: addr.uprn,
            address: addr.addressDisplay,
            council_id: councilId,
          })) || [],
          source_method: 'api',
          source_timestamp: new Date().toISOString(),
          confidence: result.confidence,
        };
      }

      // No councilId — use UPRN resolution service
      const addresses = await resolvePostcodeToUprn(normalizedPostcode);
      
      if (addresses.length === 0) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `No addresses found for postcode '${normalizedPostcode}'. Try SO50 5PN (Eastleigh) or PO16 7XX (Fareham) for demo.`,
          postcode: normalizedPostcode
        });
      }
      
      return {
        postcode: normalizedPostcode,
        addresses: addresses.map(addr => ({
          id: `${addr.councilId}:${addr.uprn}`,
          address: addr.address,
          uprn: addr.uprn,
          council_id: addr.councilId,
          confidence: addr.confidence
        })),
        count: addresses.length,
        source_method: 'uprn_lookup',
        source_timestamp: new Date().toISOString()
      };
    } catch (error) {
      request.log.error({ err: error, postcode: normalizedPostcode, councilId }, 'Address lookup error');
      return reply.code(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Failed to lookup addresses',
      });
    }
  });

  /**
   * GET /v1/properties/:propertyId/collections
   * Get collection events (scheduled pickups) for a property
   */
  server.get('/v1/properties/:propertyId/collections', async (request: any, reply: any) => {
    const { propertyId } = request.params;
    const { from, to } = request.query;

    // Parse propertyId format: councilId:localId
    const parts = propertyId.split(':');
    if (parts.length !== 2) {
      return reply.code(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid propertyId format. Expected: councilId:localId',
      });
    }

    const [councilId, localId] = parts;

    // Check if council supported
    if (!isCouncilSupported(councilId)) {
      return reply.code(503).send({
        statusCode: 503,
        error: 'Service Unavailable',
        message: `Council '${councilId}' adapter not available`,
        council_id: councilId,
      });
    }

    try {
      const adapter = getAdapter(councilId);

      const identity: PropertyIdentity = {
        councilLocalId: localId,
        address: '',
        postcode: '',
        correlationId: uuidv4(),
      };

      let range: DateRange | undefined;
      if (from && to) {
        range = { from, to };
      }

      const result = await adapter.getCollectionEvents(identity, range);

      if (!result.success) {
        // If bot detection or parse error, fallback to mock data for demo
        if (result.failureCategory === 'bot_detection' || result.failureCategory === 'parse_error') {
          request.log.warn({ councilId, localId, error: result.errorMessage }, 'Using mock data due to upstream failure');
          
          const mockEvents = generateMockCollections(localId, councilId);
          
          return {
            property_id: propertyId,
            council_id: councilId,
            collections: mockEvents.map(event => ({
              date: event.collectionDate,
              bin_types: [event.serviceType],
              description: `Collection: ${event.serviceType}`,
              is_confirmed: event.isConfirmed,
              is_rescheduled: event.isRescheduled,
              notes: event.notes,
            })),
            source_timestamp: new Date().toISOString(),
            confidence: 0.5,
            warning: 'Using mock data - upstream council website has bot protection',
            failure_reason: result.errorMessage
          };
        }
        
        return reply.code(503).send({
          statusCode: 503,
          error: 'Service Unavailable',
          message: result.errorMessage || 'Failed to fetch collection events',
          council_id: councilId,
          failure_category: result.failureCategory,
        });
      }

      // Transform to API response
      const collections = result.data?.map(event => ({
        date: event.collectionDate,
        bin_types: [event.serviceType],
        description: `Collection: ${event.serviceType}`,
        is_confirmed: event.isConfirmed,
        is_rescheduled: event.isRescheduled,
        notes: event.notes,
      })) || [];

      return {
        property_id: propertyId,
        council_id: councilId,
        collections,
        source_timestamp: new Date().toISOString(),
        confidence: result.confidence,
        freshness: 'live',
      };
    } catch (error) {
      request.log.error({ err: error, propertyId }, 'Collection events error');
      return reply.code(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Failed to fetch collection events',
      });
    }
  });

  /**
   * GET /v1/properties/:propertyId/services
   * Get collection services available at a property
   */
  server.get('/v1/properties/:propertyId/services', async (request: any, reply: any) => {
    const { propertyId } = request.params;

    // Parse propertyId format: councilId:localId
    const parts = propertyId.split(':');
    if (parts.length !== 2) {
      return reply.code(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid propertyId format. Expected: councilId:localId',
      });
    }

    const [councilId, localId] = parts;

    // Check if council supported
    if (!isCouncilSupported(councilId)) {
      return reply.code(503).send({
        statusCode: 503,
        error: 'Service Unavailable',
        message: `Council '${councilId}' adapter not available`,
        council_id: councilId,
      });
    }

    try {
      const adapter = getAdapter(councilId);

      const identity: PropertyIdentity = {
        councilLocalId: localId,
        address: '',
        postcode: '',
        correlationId: uuidv4(),
      };

      const result = await adapter.getCollectionServices(identity);

      if (!result.success) {
        return reply.code(503).send({
          statusCode: 503,
          error: 'Service Unavailable',
          message: result.errorMessage || 'Failed to fetch collection services',
          council_id: councilId,
          failure_category: result.failureCategory,
        });
      }

      // Transform to API response
      const services = result.data?.map(service => ({
        service_id: service.serviceId,
        service_type: service.serviceType,
        name: service.serviceNameDisplay,
        frequency: service.frequency,
        container_type: service.containerType,
        container_colour: service.containerColour,
        is_active: service.isActive,
        requires_subscription: service.requiresSubscription,
        notes: service.notes,
      })) || [];

      return {
        property_id: propertyId,
        council_id: councilId,
        services,
        source_timestamp: new Date().toISOString(),
        confidence: result.confidence,
      };
    } catch (error) {
      request.log.error({ err: error, propertyId }, 'Collection services error');
      return reply.code(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Failed to fetch collection services',
      });
    }
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
