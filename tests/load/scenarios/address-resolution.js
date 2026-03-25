/**
 * k6 Load Test Scenario: Address Resolution
 * 
 * Simulates expensive postcode→address lookups. These requests may trigger
 * upstream council API calls and are more resource-intensive.
 * 
 * Expected Result:
 * - p95 response time < 2s (slower than cached lookups)
 * - Enumeration detection doesn't false-positive on normal traffic
 * - No database connection exhaustion
 * - Platform remains responsive
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const addressLookupDuration = new Trend('address_lookup_duration');
const rateLimitCounter = new Counter('rate_limits');

// Test configuration
export const options = {
  // 10 virtual users for 2 minutes (smaller than cached scenario)
  vus: 10,
  duration: '2m',

  thresholds: {
    // More relaxed threshold for expensive operations
    http_req_duration: ['p(95)<2000'],
    'http_req_duration{p(99)}': ['p(99)<3000'],
    
    // Higher error tolerance (some addresses may not exist)
    http_req_failed: ['rate<0.05'],
    errors: ['rate<0.05'],
  },

  stages: [
    { duration: '20s', target: 5 },    // Gentle ramp-up
    { duration: '1m', target: 10 },    // Reach target
    { duration: '40s', target: 0 },    // Ramp down
  ],
};

// Hampshire postcodes for testing
const TEST_POSTCODES = [
  'SO50 1AA',  // Southampton - Eastleigh
  'SO16 7NP',  // Southampton - Southampton City
  'GU14 6AB',  // Farnborough - Rushmoor
  'PO1 1AA',   // Portsmouth
  'RG21 7AY',  // Basingstoke - Basingstoke & Deane
  'GU34 1AA',  // Alton - East Hampshire
  'PO12 1AA',  // Gosport
  'PO9 1AA',   // Havant
  'GU51 1AA',  // Fleet - Hart
  'RG27 8AA',  // Hook - Hart
  'SO23 8AA',  // Winchester
  'SO20 6AA',  // Stockbridge - Test Valley
  'BH24 1AA',  // Ringwood - New Forest
];

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API_KEY = __ENV.API_KEY || 'hbp_test_loadtest_12345678abcdefgh';

export default function () {
  // Select random postcode
  const postcode = TEST_POSTCODES[Math.floor(Math.random() * TEST_POSTCODES.length)];

  const startTime = Date.now();

  const response = http.get(
    `${BASE_URL}/v1/postcodes/${encodeURIComponent(postcode)}/addresses`,
    {
      headers: {
        'X-API-Key': API_KEY,
        'Accept': 'application/json',
      },
      tags: {
        name: 'ResolveAddress',
        scenario: 'address-resolution',
      },
    }
  );

  const duration = Date.now() - startTime;
  addressLookupDuration.add(duration);

  // Check response
  const result = check(response, {
    'status is 200 or 404': (r) => r.status === 200 || r.status === 404,
    'not rate limited': (r) => r.status !== 429,
    'response time < 2s': (r) => r.timings.duration < 2000,
    'valid JSON response': (r) => {
      try {
        JSON.parse(r.body);
        return true;
      } catch {
        return false;
      }
    },
  });

  if (!result) {
    errorRate.add(1);
  } else {
    errorRate.add(0);
  }

  // Track rate limiting (should be rare in normal traffic)
  if (response.status === 429) {
    rateLimitCounter.add(1);
    console.warn(`Rate limited on postcode: ${postcode}`);
  }

  // Longer think time (address lookups are less frequent)
  sleep(2);
}

export function teardown(data) {
  console.log('Address resolution test complete.');
}

/**
 * Expected behavior:
 * - Most requests succeed (200)
 * - Some postcodes may return 404 (not in Hampshire, not found)
 * - Very few 429s (rate limiting shouldn't trigger on normal traffic)
 * - p95 < 2s even for upstream calls
 * 
 * Example output:
 * 
 * ✓ status is 200 or 404
 * ✓ not rate limited
 * ✓ response time < 2s
 * ✓ valid JSON response
 * 
 * checks.........................: 98.50% ✓ 788      ✗ 12
 * http_req_duration..............: avg=850ms min=120ms med=720ms max=1850ms p(95)=1650ms p(99)=1820ms
 * http_reqs......................: 800    13.3/s
 * rate_limits....................: 2      (rare)
 */
