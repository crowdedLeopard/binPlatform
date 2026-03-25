/**
 * E2E Integration Tests Against Live Staging API
 * 
 * API URL: https://ca-binplatform-api-staging.icyriver-42deda52.uksouth.azurecontainerapps.io
 * 
 * These tests verify:
 * - Core endpoints respond correctly
 * - Response shapes match expected schemas
 * - Error handling returns JSON (not HTML)
 * - Security headers are present
 * - Rate limiting headers exist
 */

const API_BASE_URL = 'https://ca-binplatform-api-staging.icyriver-42deda52.uksouth.azurecontainerapps.io';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration?: number;
}

const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    results.push({ name, passed: true, duration: Date.now() - start });
    console.log(`✓ ${name}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, error: errorMsg, duration: Date.now() - start });
    console.error(`✗ ${name}`);
    console.error(`  ${errorMsg}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEq<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

function assertType(value: any, type: string, fieldName: string): void {
  const actualType = typeof value;
  if (actualType !== type) {
    throw new Error(`${fieldName} should be ${type}, got ${actualType}`);
  }
}

function assertInRange(value: number, min: number, max: number, fieldName: string): void {
  if (value < min || value > max) {
    throw new Error(`${fieldName} should be between ${min} and ${max}, got ${value}`);
  }
}

async function runTests() {
  console.log('🧪 Running E2E Integration Tests Against Live Staging API\n');
  console.log(`API Base URL: ${API_BASE_URL}\n`);

  // ============================================================================
  // CORE ENDPOINTS
  // ============================================================================

  await test('GET /health returns 200 with correct shape', async () => {
    const response = await fetch(`${API_BASE_URL}/health`);
    assertEq(response.status, 200, 'Expected status 200');
    
    const contentType = response.headers.get('content-type');
    assert(contentType?.includes('application/json'), 'Expected JSON content type');
    
    const data = await response.json();
    assertEq(data.status, 'ok', 'Expected status: ok');
    assertType(data.timestamp, 'string', 'timestamp');
    assertType(data.service, 'string', 'service');
    assertType(data.version, 'string', 'version');
  });

  await test('GET /ready returns 200 or 503 with checks object', async () => {
    const response = await fetch(`${API_BASE_URL}/ready`);
    assert(response.status === 200 || response.status === 503, 'Expected status 200 or 503');
    
    const data = await response.json();
    assertType(data.checks, 'object', 'checks');
  });

  await test('GET /v1/councils returns array of 13 councils', async () => {
    const response = await fetch(`${API_BASE_URL}/v1/councils`);
    assertEq(response.status, 200, 'Expected status 200');
    
    const data = await response.json();
    assertType(data.councils, 'object', 'councils');
    assert(Array.isArray(data.councils), 'Expected councils to be an array');
    assertEq(data.count, 13, 'Expected count to be 13');
    assertEq(data.councils.length, 13, 'Expected exactly 13 councils');
    
    // Verify first council has required fields
    const council = data.councils[0];
    assertType(council.council_id, 'string', 'council_id');
    assertType(council.council_name, 'string', 'council_name');
    assertType(council.official_waste_url, 'string', 'official_waste_url');
    assertType(council.lookup_method, 'string', 'lookup_method');
    assertType(council.confidence_score, 'number', 'confidence_score');
    assertInRange(council.confidence_score, 0, 1, 'confidence_score');
  });

  await test('GET /v1/councils/eastleigh returns council with matching ID', async () => {
    const response = await fetch(`${API_BASE_URL}/v1/councils/eastleigh`);
    assertEq(response.status, 200, 'Expected status 200');
    
    const data = await response.json();
    const council = data.council || data; // Handle both { council: {...} } and direct object
    assertEq(council.council_id, 'eastleigh', 'Expected council_id to match');
    assertType(council.council_name, 'string', 'council_name');
    assertType(council.official_waste_url, 'string', 'official_waste_url');
    assertType(council.lookup_method, 'string', 'lookup_method');
    assertType(council.confidence_score, 'number', 'confidence_score');
  });

  await test('GET /v1/councils/fareham returns 200 (beta-active council)', async () => {
    const response = await fetch(`${API_BASE_URL}/v1/councils/fareham`);
    assertEq(response.status, 200, 'Expected status 200');
    
    const data = await response.json();
    const council = data.council || data;
    assertEq(council.council_id, 'fareham', 'Expected council_id to match');
  });

  await test('GET /v1/councils/basingstoke-deane/health returns kill_switch_active: true', async () => {
    const response = await fetch(`${API_BASE_URL}/v1/councils/basingstoke-deane/health`);
    assertEq(response.status, 200, 'Expected status 200');
    
    const data = await response.json();
    assertEq(data.council_id, 'basingstoke-deane', 'Expected council_id to match');
    assertEq(data.kill_switch_active, true, 'Expected kill_switch_active to be true');
    assertType(data.status, 'string', 'status');
    assertType(data.confidence_score, 'number', 'confidence_score');
    assertType(data.checked_at, 'string', 'checked_at');
  });

  await test('GET /v1/councils/eastleigh/health returns kill_switch_active: false', async () => {
    const response = await fetch(`${API_BASE_URL}/v1/councils/eastleigh/health`);
    assertEq(response.status, 200, 'Expected status 200');
    
    const data = await response.json();
    assertEq(data.council_id, 'eastleigh', 'Expected council_id to match');
    assertEq(data.kill_switch_active, false, 'Expected kill_switch_active to be false');
  });

  await test('GET /v1/councils/portsmouth/health returns kill_switch_active: true', async () => {
    const response = await fetch(`${API_BASE_URL}/v1/councils/portsmouth/health`);
    assertEq(response.status, 200, 'Expected status 200');
    
    const data = await response.json();
    assertEq(data.council_id, 'portsmouth', 'Expected council_id to match');
    assertEq(data.kill_switch_active, true, 'Expected kill_switch_active to be true');
  });

  // ============================================================================
  // ERROR HANDLING
  // ============================================================================

  await test('GET /v1/councils/does-not-exist returns 404 JSON (not HTML)', async () => {
    const response = await fetch(`${API_BASE_URL}/v1/councils/does-not-exist`);
    assertEq(response.status, 404, 'Expected status 404');
    
    const contentType = response.headers.get('content-type');
    assert(contentType?.includes('application/json'), 'Expected JSON content type, not HTML');
    
    const data = await response.json();
    assertType(data.statusCode, 'number', 'statusCode');
    assertEq(data.statusCode, 404, 'Expected statusCode to be 404');
  });

  await test('GET /notaroute returns 404 JSON (not HTML)', async () => {
    const response = await fetch(`${API_BASE_URL}/notaroute`);
    assertEq(response.status, 404, 'Expected status 404');
    
    const contentType = response.headers.get('content-type');
    assert(contentType?.includes('application/json'), 'Expected JSON content type, not HTML');
    
    const data = await response.json();
    assertType(data.statusCode, 'number', 'statusCode');
  });

  // ============================================================================
  // RESPONSE SHAPE VALIDATION (detailed check)
  // ============================================================================

  await test('Councils list has all required fields with correct types', async () => {
    const response = await fetch(`${API_BASE_URL}/v1/councils`);
    const data = await response.json();
    const councils = data.councils;
    
    for (const council of councils) {
      assertType(council.council_id, 'string', 'council_id');
      assertType(council.council_name, 'string', 'council_name');
      assertType(council.official_waste_url, 'string', 'official_waste_url');
      assertType(council.lookup_method, 'string', 'lookup_method');
      assertType(council.confidence_score, 'number', 'confidence_score');
      assertInRange(council.confidence_score, 0, 1, 'confidence_score');
    }
  });

  await test('Council health has all required fields with correct types', async () => {
    const response = await fetch(`${API_BASE_URL}/v1/councils/eastleigh/health`);
    const health = await response.json();
    
    assertType(health.council_id, 'string', 'council_id');
    assertType(health.status, 'string', 'status');
    assertType(health.kill_switch_active, 'boolean', 'kill_switch_active');
    assertType(health.confidence_score, 'number', 'confidence_score');
    assertType(health.checked_at, 'string', 'checked_at');
    assertInRange(health.confidence_score, 0, 1, 'confidence_score');
    
    // Verify ISO 8601 timestamp format
    const dateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
    assert(dateRegex.test(health.checked_at), 'checked_at should be ISO 8601 format');
  });

  // ============================================================================
  // SECURITY HEADERS
  // ============================================================================

  await test('Responses include x-frame-options header', async () => {
    const response = await fetch(`${API_BASE_URL}/health`);
    const header = response.headers.get('x-frame-options');
    assert(header !== null, 'x-frame-options header should be present');
    assert(
      header === 'DENY' || header === 'SAMEORIGIN',
      `x-frame-options should be DENY or SAMEORIGIN, got: ${header}`
    );
  });

  await test('Responses include x-content-type-options: nosniff', async () => {
    const response = await fetch(`${API_BASE_URL}/health`);
    const header = response.headers.get('x-content-type-options');
    assertEq(header, 'nosniff', 'Expected x-content-type-options: nosniff');
  });

  await test('Responses include strict-transport-security header', async () => {
    const response = await fetch(`${API_BASE_URL}/health`);
    const header = response.headers.get('strict-transport-security');
    assert(header !== null, 'strict-transport-security header should be present');
    assert(header.includes('max-age'), 'HSTS header should include max-age directive');
  });

  await test('Responses do NOT expose "server" header (Fastify)', async () => {
    const response = await fetch(`${API_BASE_URL}/health`);
    const serverHeader = response.headers.get('server');
    
    // Either no server header, or if present, should not reveal "Fastify"
    if (serverHeader) {
      assert(
        !serverHeader.toLowerCase().includes('fastify'),
        `Server header should not expose Fastify, got: ${serverHeader}`
      );
    }
  });

  // ============================================================================
  // RATE LIMITING
  // ============================================================================

  await test('Responses include x-ratelimit-limit header', async () => {
    const response = await fetch(`${API_BASE_URL}/health`);
    const header = response.headers.get('x-ratelimit-limit');
    assert(header !== null, 'x-ratelimit-limit header should be present');
    
    const limit = parseInt(header, 10);
    assert(!isNaN(limit), 'x-ratelimit-limit should be a number');
    assert(limit > 0, 'x-ratelimit-limit should be positive');
  });

  await test('Responses include x-ratelimit-remaining header', async () => {
    const response = await fetch(`${API_BASE_URL}/health`);
    const header = response.headers.get('x-ratelimit-remaining');
    assert(header !== null, 'x-ratelimit-remaining header should be present');
    
    const remaining = parseInt(header, 10);
    assert(!isNaN(remaining), 'x-ratelimit-remaining should be a number');
    assert(remaining >= 0, 'x-ratelimit-remaining should be non-negative');
  });

  // ============================================================================
  // SUMMARY
  // ============================================================================

  console.log('\n' + '='.repeat(60));
  console.log('E2E Test Summary');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;
  
  console.log(`Total:  ${total}`);
  console.log(`Passed: ${passed} ✓`);
  console.log(`Failed: ${failed} ✗`);
  console.log('='.repeat(60));
  
  if (failed > 0) {
    console.log('\nFailed Tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  ✗ ${r.name}`);
      console.log(`    ${r.error}`);
    });
  }
  
  const exitCode = failed === 0 ? 0 : 1;
  process.exit(exitCode);
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error running tests:', error);
  process.exit(1);
});
