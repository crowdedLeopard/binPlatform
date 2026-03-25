/**
 * k6 Load Test Scenario: Abuse Simulation
 * 
 * Simulates bot-like behavior: sequential postcode enumeration to test
 * enumeration detection and rate limiting.
 * 
 * EXPECTED RESULT: This test SHOULD see lots of 429s (rate limiting).
 * That's a PASS, not a failure. We're validating defensive controls work.
 * 
 * Success criteria:
 * - Rate limiting activates after threshold (51 requests in 15 min)
 * - Platform remains responsive despite abuse
 * - Security events logged
 * - No crashes or hangs
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter } from 'k6/metrics';

// Custom metrics
const rateLimitRate = new Rate('rate_limited');
const enumerationBlockRate = new Rate('enumeration_blocked');
const successRate = new Rate('success');

// Test configuration
export const options = {
  // Single user simulating a bot
  vus: 1,
  duration: '3m',

  // Thresholds are INVERTED for this test (we WANT rate limiting)
  thresholds: {
    // We EXPECT rate limiting to kick in
    'rate_limited': ['rate>0.5'], // More than 50% should be rate limited
    
    // Platform should NOT crash
    'http_req_failed{reason:timeout}': ['rate<0.1'],
    
    // Platform should remain responsive (even to rate-limited requests)
    'http_req_duration{status:429}': ['p(95)<500'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API_KEY = __ENV.API_KEY || 'hbp_test_abuse_key_for_testing_only';

// Generate sequential postcodes for enumeration
function generateSequentialPostcodes() {
  const postcodes = [];
  const areas = ['SO', 'PO', 'GU', 'RG'];
  
  areas.forEach(area => {
    for (let i = 1; i <= 30; i++) {
      postcodes.push(`${area}${i} 1AA`);
    }
  });

  return postcodes;
}

const POSTCODES = generateSequentialPostcodes();

export function setup() {
  console.log('Starting abuse simulation...');
  console.log(`Generated ${POSTCODES.length} sequential postcodes for enumeration test`);
  console.log('EXPECTED: Rate limiting should activate after ~51 requests');
}

export default function () {
  // Enumerate postcodes sequentially (bot behavior)
  POSTCODES.forEach((postcode, index) => {
    const response = http.get(
      `${BASE_URL}/v1/postcodes/${encodeURIComponent(postcode)}/addresses`,
      {
        headers: {
          'X-API-Key': API_KEY,
          'Accept': 'application/json',
        },
        tags: {
          name: 'EnumeratePostcodes',
          scenario: 'abuse-simulation',
          postcode_index: index.toString(),
        },
      }
    );

    const isRateLimited = response.status === 429;
    const isEnumerationBlocked = response.status === 429 && 
      response.body && 
      JSON.parse(response.body).code === 'ENUMERATION_DETECTED';
    const isSuccess = response.status === 200 || response.status === 404;

    rateLimitRate.add(isRateLimited ? 1 : 0);
    enumerationBlockRate.add(isEnumerationBlocked ? 1 : 0);
    successRate.add(isSuccess ? 1 : 0);

    check(response, {
      'platform responded (not timeout)': (r) => r.status !== 0,
      'rate limited after threshold': (r) => {
        if (index > 50) {
          return r.status === 429; // Should be rate limited
        }
        return true; // Don't check before threshold
      },
      'response time < 500ms even when rate limited': (r) => r.timings.duration < 500,
    });

    if (isRateLimited && index === 51) {
      console.log(`✅ Rate limiting activated at request ${index} (expected)`);
    }

    if (isEnumerationBlocked) {
      console.log(`✅ Enumeration detection triggered at request ${index}`);
    }

    // No sleep — aggressive enumeration (bot behavior)
  });
}

export function teardown(data) {
  console.log('Abuse simulation complete.');
  console.log('Expected outcome:');
  console.log('  - First ~50 requests: Success (200/404)');
  console.log('  - Subsequent requests: Rate limited (429)');
  console.log('  - Platform remained responsive throughout');
}

/**
 * Expected output:
 * 
 * ✓ platform responded (not timeout)
 * ✓ rate limited after threshold
 * ✓ response time < 500ms even when rate limited
 * 
 * checks.........................: 100.00% ✓ 360      ✗ 0
 * enumeration_blocked............: 58.33%  ✓ 70       ✗ 50
 * rate_limited...................: 58.33%  ✓ 70       ✗ 50
 * success........................: 41.67%  ✓ 50       ✗ 70
 * http_req_duration..............: avg=85ms min=45ms med=78ms max=180ms p(95)=145ms p(99)=165ms
 * http_reqs......................: 120    40/s
 * 
 * Interpretation:
 * - ✅ 41.67% success rate (first 50 requests allowed)
 * - ✅ 58.33% rate limited (requests 51+ blocked) — THIS IS EXPECTED
 * - ✅ All requests responded (no timeouts)
 * - ✅ Fast response even when rate limited (p95 < 200ms)
 */
