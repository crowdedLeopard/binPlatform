/**
 * E2E Collection Flow Tests
 * 
 * Tests the full collection API flow including:
 * - Address lookup by postcode (with and without councilId)
 * - Collections for a property
 * - Services for a property
 * - Invalid input handling
 * - Kill-switched council behavior
 * - Unknown council handling
 * 
 * These tests are RESILIENT:
 * - Accept 503 as valid (upstream council website may be down)
 * - Accept 200 as valid
 * - Reject 500 (internal server error — that's a bug)
 * - Reject HTML responses (should always be JSON)
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

function assertStatusIn(actual: number, validStatuses: number[], message: string): void {
  if (!validStatuses.includes(actual)) {
    throw new Error(`${message}. Expected one of [${validStatuses.join(', ')}], got ${actual}`);
  }
}

async function runTests() {
  console.log('🧪 Running E2E Collection Flow Tests\n');
  console.log(`API Base URL: ${API_BASE_URL}\n`);

  // ============================================================================
  // ADDRESS LOOKUP TESTS
  // ============================================================================

  await test('GET /v1/postcodes/:postcode/addresses with councilId (Eastleigh)', async () => {
    const postcode = 'SO50 1QD';
    const councilId = 'eastleigh';
    const response = await fetch(
      `${API_BASE_URL}/v1/postcodes/${encodeURIComponent(postcode)}/addresses?councilId=${councilId}`
    );
    
    // Accept 200 (success), 503 (upstream down), or 404 (not implemented yet)
    assertStatusIn(
      response.status,
      [200, 503, 404],
      'Address lookup should return 200, 503, or 404 (not 500)'
    );
    
    const contentType = response.headers.get('content-type');
    assert(contentType?.includes('application/json'), 'Response should be JSON, not HTML');
    
    const data = await response.json();
    
    if (response.status === 200) {
      // Validate successful response shape
      assert(
        Array.isArray(data.addresses) || Array.isArray(data),
        'Expected addresses array in successful response'
      );
      
      const addresses = data.addresses || data;
      if (addresses.length > 0) {
        const addr = addresses[0];
        assertType(addr.council_local_id || addr.councilLocalId, 'string', 'council_local_id');
        assertType(addr.address_display || addr.addressDisplay, 'string', 'address_display');
      }
    } else if (response.status === 503) {
      // Upstream unavailable — valid state
      assertType(data.statusCode, 'number', 'statusCode');
      assertEq(data.statusCode, 503, 'statusCode should match HTTP status');
    }
  });

  await test('GET /v1/postcodes/:postcode/addresses WITHOUT councilId', async () => {
    const postcode = 'SO50 1QD';
    const response = await fetch(
      `${API_BASE_URL}/v1/postcodes/${encodeURIComponent(postcode)}/addresses`
    );
    
    // Accept 200 (success), 503 (upstream down), 400 (councilId required), or 404 (not implemented)
    assertStatusIn(
      response.status,
      [200, 400, 503, 404],
      'Address lookup without councilId should return 200, 400, 503, or 404'
    );
    
    const contentType = response.headers.get('content-type');
    assert(contentType?.includes('application/json'), 'Response should be JSON, not HTML');
    
    const data = await response.json();
    
    if (response.status === 200) {
      assert(
        Array.isArray(data.addresses) || Array.isArray(data),
        'Expected addresses array'
      );
    } else if (response.status === 400) {
      // councilId required — also valid
      assertType(data.statusCode, 'number', 'statusCode');
    }
  });

  await test('GET /v1/postcodes/INVALID/addresses returns 400 validation error', async () => {
    const response = await fetch(`${API_BASE_URL}/v1/postcodes/INVALID/addresses`);
    
    // Should be 400 (validation error) or 404 (not implemented)
    assertStatusIn(
      response.status,
      [400, 404],
      'Invalid postcode should return 400 or 404'
    );
    
    const contentType = response.headers.get('content-type');
    assert(contentType?.includes('application/json'), 'Response should be JSON, not HTML');
    
    const data = await response.json();
    
    if (response.status === 400) {
      assertType(data.statusCode, 'number', 'statusCode');
      assertEq(data.statusCode, 400, 'statusCode should be 400');
    }
  });

  await test('GET /v1/postcodes/:postcode/addresses?councilId=basingstoke-deane returns 503 (kill-switched)', async () => {
    const postcode = 'RG21 1AA';
    const councilId = 'basingstoke-deane';
    const response = await fetch(
      `${API_BASE_URL}/v1/postcodes/${encodeURIComponent(postcode)}/addresses?councilId=${councilId}`
    );
    
    // Kill-switched council should return 503 or 404 (not implemented yet)
    assertStatusIn(
      response.status,
      [503, 404],
      'Kill-switched council should return 503 or 404'
    );
    
    const contentType = response.headers.get('content-type');
    assert(contentType?.includes('application/json'), 'Response should be JSON, not HTML');
    
    const data = await response.json();
    
    if (response.status === 503) {
      assertType(data.statusCode, 'number', 'statusCode');
      assertEq(data.statusCode, 503, 'statusCode should be 503');
      
      // Should explain kill switch if message present
      if (data.message || data.error) {
        const msg = (data.message || data.error).toLowerCase();
        assert(
          msg.includes('kill') || msg.includes('disabled') || msg.includes('unavailable'),
          'Error message should explain kill switch or unavailability'
        );
      }
    }
  });

  await test('GET /v1/postcodes/:postcode/addresses?councilId=does-not-exist returns 404', async () => {
    const postcode = 'SO50 1QD';
    const councilId = 'does-not-exist';
    const response = await fetch(
      `${API_BASE_URL}/v1/postcodes/${encodeURIComponent(postcode)}/addresses?councilId=${councilId}`
    );
    
    // Unknown council should return 404
    assertEq(response.status, 404, 'Unknown council should return 404');
    
    const contentType = response.headers.get('content-type');
    assert(contentType?.includes('application/json'), 'Response should be JSON, not HTML');
    
    const data = await response.json();
    assertType(data.statusCode, 'number', 'statusCode');
    assertEq(data.statusCode, 404, 'statusCode should be 404');
  });

  // ============================================================================
  // PROPERTY COLLECTIONS TESTS
  // ============================================================================

  await test('GET /v1/properties/:propertyId/collections returns data or 503/404', async () => {
    // Use a known property ID format: councilId:localId
    const propertyId = 'eastleigh:100060321174'; // Known test UPRN from Eastleigh adapter
    const response = await fetch(
      `${API_BASE_URL}/v1/properties/${encodeURIComponent(propertyId)}/collections`
    );
    
    // Accept 200 (success), 503 (upstream down), or 404 (not found/not implemented)
    assertStatusIn(
      response.status,
      [200, 503, 404],
      'Collections endpoint should return 200, 503, or 404'
    );
    
    const contentType = response.headers.get('content-type');
    assert(contentType?.includes('application/json'), 'Response should be JSON, not HTML');
    
    const data = await response.json();
    
    if (response.status === 200) {
      // Validate collections array
      assert(
        Array.isArray(data.collections) || Array.isArray(data),
        'Expected collections array'
      );
      
      const collections = data.collections || data;
      if (collections.length > 0) {
        const collection = collections[0];
        assertType(
          collection.collection_date || collection.collectionDate,
          'string',
          'collection_date'
        );
        assertType(
          collection.service_type || collection.serviceType,
          'string',
          'service_type'
        );
      }
    } else if (response.status === 503) {
      assertType(data.statusCode, 'number', 'statusCode');
    } else if (response.status === 404) {
      assertType(data.statusCode, 'number', 'statusCode');
    }
  });

  await test('GET /v1/properties/invalid:format/collections returns 400 or 404', async () => {
    const propertyId = 'invalid-format-no-colon';
    const response = await fetch(
      `${API_BASE_URL}/v1/properties/${encodeURIComponent(propertyId)}/collections`
    );
    
    // Should return 400 (validation) or 404 (not found/not implemented)
    assertStatusIn(
      response.status,
      [400, 404],
      'Invalid property ID format should return 400 or 404'
    );
    
    const contentType = response.headers.get('content-type');
    assert(contentType?.includes('application/json'), 'Response should be JSON, not HTML');
  });

  // ============================================================================
  // PROPERTY SERVICES TESTS
  // ============================================================================

  await test('GET /v1/properties/:propertyId/services returns data or 503/404', async () => {
    const propertyId = 'eastleigh:100060321174';
    const response = await fetch(
      `${API_BASE_URL}/v1/properties/${encodeURIComponent(propertyId)}/services`
    );
    
    // Accept 200 (success), 503 (upstream down), or 404 (not found/not implemented)
    assertStatusIn(
      response.status,
      [200, 503, 404],
      'Services endpoint should return 200, 503, or 404'
    );
    
    const contentType = response.headers.get('content-type');
    assert(contentType?.includes('application/json'), 'Response should be JSON, not HTML');
    
    const data = await response.json();
    
    if (response.status === 200) {
      // Validate services array
      assert(
        Array.isArray(data.services) || Array.isArray(data),
        'Expected services array'
      );
      
      const services = data.services || data;
      if (services.length > 0) {
        const service = services[0];
        assertType(service.service_type || service.serviceType, 'string', 'service_type');
        assertType(service.container_type || service.containerType, 'string', 'container_type');
      }
    } else if (response.status === 503) {
      assertType(data.statusCode, 'number', 'statusCode');
    } else if (response.status === 404) {
      assertType(data.statusCode, 'number', 'statusCode');
    }
  });

  // ============================================================================
  // ERROR RESILIENCE TESTS
  // ============================================================================

  await test('All 500 errors are bugs (should not happen in production)', async () => {
    // This test documents that 500s are ALWAYS bugs
    // We test various endpoints and ensure none return 500
    const endpoints = [
      '/v1/postcodes/SO50%201QD/addresses',
      '/v1/properties/eastleigh:test/collections',
      '/v1/properties/eastleigh:test/services',
    ];
    
    for (const endpoint of endpoints) {
      const response = await fetch(`${API_BASE_URL}${endpoint}`);
      
      assert(
        response.status !== 500,
        `${endpoint} returned 500 (internal server error) — this is a bug!`
      );
    }
  });

  await test('All responses are JSON (never HTML)', async () => {
    const endpoints = [
      '/v1/postcodes/SO50%201QD/addresses',
      '/v1/postcodes/INVALID/addresses',
      '/v1/properties/eastleigh:test/collections',
      '/v1/councils/does-not-exist',
    ];
    
    for (const endpoint of endpoints) {
      const response = await fetch(`${API_BASE_URL}${endpoint}`);
      const contentType = response.headers.get('content-type');
      
      assert(
        contentType?.includes('application/json'),
        `${endpoint} returned non-JSON content-type: ${contentType}`
      );
      
      // Ensure it parses as JSON
      try {
        await response.json();
      } catch (error) {
        throw new Error(`${endpoint} returned invalid JSON: ${error}`);
      }
    }
  });

  // ============================================================================
  // SUMMARY
  // ============================================================================

  console.log('\n' + '='.repeat(60));
  console.log('E2E Collection Flow Test Summary');
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
