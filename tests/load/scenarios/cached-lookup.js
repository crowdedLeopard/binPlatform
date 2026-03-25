/**
 * k6 Load Test Scenario: Cached Collection Lookup
 * 
 * Simulates normal production traffic where most requests hit cached data.
 * This represents the happy path where the platform serves data from cache
 * without triggering upstream adapter calls.
 * 
 * Expected Result:
 * - p95 response time < 200ms
 * - Error rate < 0.1%
 * - Sustained throughput > 1000 req/s
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const cacheLookupDuration = new Trend('cache_lookup_duration');

// Test configuration
export const options = {
  // 50 virtual users for 5 minutes
  vus: 50,
  duration: '5m',

  // Performance thresholds (test fails if these are not met)
  thresholds: {
    // 95th percentile must be under 200ms
    http_req_duration: ['p(95)<200'],
    
    // 99th percentile must be under 500ms
    'http_req_duration{p(99)}': ['p(99)<500'],
    
    // Error rate must be under 0.1%
    http_req_failed: ['rate<0.001'],
    
    // Custom error rate metric
    errors: ['rate<0.001'],
    
    // At least 1000 requests per second sustained
    http_reqs: ['rate>1000'],
  },

  // Graceful ramp-up and ramp-down
  stages: [
    { duration: '30s', target: 10 },   // Warm up
    { duration: '1m', target: 50 },    // Ramp to full load
    { duration: '3m', target: 50 },    // Sustain load
    { duration: '30s', target: 0 },    // Ramp down
  ],
};

// Test data: Common property IDs that should be cached
const TEST_PROPERTY_IDS = [
  '550e8400-e29b-41d4-a716-446655440000',
  '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  '9a3c4d5e-6f7a-8b9c-0d1e-2f3a4b5c6d7e',
];

// Base URL from environment or default to localhost
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API_KEY = __ENV.API_KEY || 'hbp_test_loadtest_12345678abcdefgh';

export function setup() {
  // Warm up cache before starting main test
  console.log('Warming up cache...');
  
  TEST_PROPERTY_IDS.forEach(propertyId => {
    http.get(
      `${BASE_URL}/v1/properties/${propertyId}/collections`,
      {
        headers: {
          'X-API-Key': API_KEY,
        },
      }
    );
  });

  console.log('Cache warm-up complete. Starting load test...');
}

export default function () {
  // Select random property from test set (all should be cached)
  const propertyId = TEST_PROPERTY_IDS[Math.floor(Math.random() * TEST_PROPERTY_IDS.length)];

  const startTime = Date.now();

  const response = http.get(
    `${BASE_URL}/v1/properties/${propertyId}/collections`,
    {
      headers: {
        'X-API-Key': API_KEY,
        'Accept': 'application/json',
      },
      tags: {
        name: 'GetCollections',
        scenario: 'cached-lookup',
      },
    }
  );

  const duration = Date.now() - startTime;
  cacheLookupDuration.add(duration);

  // Assertions
  const result = check(response, {
    'status is 200': (r) => r.status === 200,
    'response has collections': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.data);
      } catch {
        return false;
      }
    },
    'response time < 200ms': (r) => r.timings.duration < 200,
    'has cache headers': (r) => r.headers['X-Cache-Hit'] !== undefined,
  });

  if (!result) {
    errorRate.add(1);
  } else {
    errorRate.add(0);
  }

  // Simulate realistic think time (100ms between requests)
  sleep(0.1);
}

export function teardown(data) {
  console.log('Load test complete.');
  console.log(`Total requests: ${data}`);
}

/**
 * Example output:
 * 
 * ✓ status is 200
 * ✓ response has collections
 * ✓ response time < 200ms
 * ✓ has cache headers
 * 
 * checks.........................: 100.00% ✓ 150000    ✗ 0
 * data_received..................: 45 MB   150 kB/s
 * data_sent......................: 18 MB   60 kB/s
 * http_req_duration..............: avg=85ms  min=42ms med=78ms max=195ms p(95)=142ms p(99)=178ms
 * http_reqs......................: 150000  1666/s
 * iteration_duration.............: avg=185ms min=142ms med=178ms max=295ms p(95)=242ms p(99)=278ms
 * vus............................: 50      min=0      max=50
 * vus_max........................: 50      min=50     max=50
 */
