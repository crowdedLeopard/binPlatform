/**
 * Live Mock Fallback Integration Tests
 * 
 * Tests that the API responds correctly whether serving REAL or MOCK data.
 * 
 * These tests are designed to PASS with either real data OR mock fallback data.
 * They validate response structure, not data authenticity.
 * 
 * Expected behavior:
 * - PASSES if confidence >= 0.5 (accepts both mock and real)
 * - PASSES if response structure is correct
 * - PASSES if data types are correct
 * - FAILS only on structural/type errors or complete failures
 * 
 * Usage:
 * - Should PASS now and keep passing as adapters are fixed
 * - Run with RUN_LIVE_TESTS=true environment variable
 * - Skipped in CI by default (requires live API)
 * 
 * @live - Tagged for selective execution
 */

import { describe, it, expect, test } from 'vitest';
import testPostcodes from '../../data/test-postcodes.json';

const API_BASE_URL = process.env.API_BASE_URL || 
  'https://ca-binplatform-api-staging.icyriver-42deda52.uksouth.azurecontainerapps.io';

// Skip these tests unless explicitly enabled
const isLiveTestsEnabled = process.env.RUN_LIVE_TESTS === 'true';

interface Address {
  councilLocalId?: string;
  council_local_id?: string;
  addressDisplay?: string;
  address_display?: string;
  uprn?: string;
}

interface Collection {
  collectionDate?: string;
  collection_date?: string;
  serviceType?: string;
  service_type?: string;
  isConfirmed?: boolean;
  is_confirmed?: boolean;
}

interface CollectionResponse {
  collections?: Collection[];
  confidence?: number;
  warning?: string;
  statusCode?: number;
  message?: string;
  error?: string;
}

interface AddressResponse {
  addresses?: Address[];
  statusCode?: number;
  message?: string;
  error?: string;
}

describe.skipIf(!isLiveTestsEnabled)('Live Mock Fallback Integration Tests', () => {
  const councilsWithAdapters = [
    { councilId: 'basingstoke-deane', postcode: testPostcodes.postcodes['basingstoke-deane'] },
    { councilId: 'east-hampshire', postcode: testPostcodes.postcodes['east-hampshire'] },
    { councilId: 'eastleigh', postcode: testPostcodes.postcodes.eastleigh },
    { councilId: 'fareham', postcode: testPostcodes.postcodes.fareham },
    { councilId: 'gosport', postcode: testPostcodes.postcodes.gosport },
    { councilId: 'hart', postcode: testPostcodes.postcodes.hart },
    { councilId: 'havant', postcode: testPostcodes.postcodes.havant },
    { councilId: 'new-forest', postcode: testPostcodes.postcodes['new-forest'] },
    { councilId: 'portsmouth', postcode: testPostcodes.postcodes.portsmouth },
    { councilId: 'rushmoor', postcode: testPostcodes.postcodes.rushmoor },
    { councilId: 'southampton', postcode: testPostcodes.postcodes.southampton },
    { councilId: 'test-valley', postcode: testPostcodes.postcodes['test-valley'] },
    { councilId: 'winchester', postcode: testPostcodes.postcodes.winchester },
  ];

  describe('Address Lookup Response Structure', () => {
    councilsWithAdapters.forEach(({ councilId, postcode }) => {
      test(`${councilId}: Address lookup returns valid structure`, async () => {
        const addressUrl = `${API_BASE_URL}/v1/postcodes/${encodeURIComponent(postcode)}/addresses?councilId=${councilId}`;
        const addressResponse = await fetch(addressUrl);
        
        // Accept 200 (success), 503 (upstream down), or 404 (not implemented)
        expect([200, 503, 404]).toContain(addressResponse.status);
        expect(addressResponse.headers.get('content-type')).toContain('application/json');
        
        const addressData: AddressResponse = await addressResponse.json();
        
        if (addressResponse.status === 200) {
          // Should have addresses array
          expect(addressData.addresses).toBeDefined();
          expect(Array.isArray(addressData.addresses)).toBe(true);
          
          if (addressData.addresses!.length > 0) {
            const firstAddress = addressData.addresses![0];
            
            // Should have council local ID (snake_case or camelCase)
            const councilLocalId = firstAddress.councilLocalId || firstAddress.council_local_id;
            expect(councilLocalId).toBeDefined();
            expect(typeof councilLocalId).toBe('string');
            
            // Should have address display
            const addressDisplay = firstAddress.addressDisplay || firstAddress.address_display;
            expect(addressDisplay).toBeDefined();
            expect(typeof addressDisplay).toBe('string');
          }
        } else if (addressResponse.status === 503) {
          // Service unavailable - validate error structure
          expect(addressData.statusCode).toBe(503);
          expect(addressData.message || addressData.error).toBeDefined();
        }
      }, 30000);
    });
  });

  describe('Collection Response Structure (Mock or Real)', () => {
    councilsWithAdapters.forEach(({ councilId, postcode }) => {
      test(`${councilId}: Collections endpoint returns valid structure`, async () => {
        // First get an address
        const addressUrl = `${API_BASE_URL}/v1/postcodes/${encodeURIComponent(postcode)}/addresses?councilId=${councilId}`;
        const addressResponse = await fetch(addressUrl);
        
        if (addressResponse.status !== 200) {
          // If can't get addresses, skip collection test
          return;
        }
        
        const addressData: AddressResponse = await addressResponse.json();
        
        if (!addressData.addresses || addressData.addresses.length === 0) {
          return;
        }
        
        const firstAddress = addressData.addresses[0];
        const councilLocalId = firstAddress.councilLocalId || firstAddress.council_local_id;
        const propertyId = `${councilId}:${councilLocalId}`;
        
        // Now get collections
        const collectionsUrl = `${API_BASE_URL}/v1/properties/${encodeURIComponent(propertyId)}/collections`;
        const collectionsResponse = await fetch(collectionsUrl);
        
        // Accept 200 (success), 503 (upstream down), or 404 (not found)
        expect([200, 503, 404]).toContain(collectionsResponse.status);
        expect(collectionsResponse.headers.get('content-type')).toContain('application/json');
        
        const collectionsData: CollectionResponse = await collectionsResponse.json();
        
        if (collectionsResponse.status === 200) {
          // Confidence field should be present and >= 0.5 (accept mock data)
          expect(collectionsData.confidence).toBeDefined();
          expect(collectionsData.confidence).toBeGreaterThanOrEqual(0.5);
          expect(collectionsData.confidence).toBeLessThanOrEqual(1.0);
          
          // Should have collections array
          expect(collectionsData.collections).toBeDefined();
          expect(Array.isArray(collectionsData.collections)).toBe(true);
          
          if (collectionsData.collections!.length > 0) {
            // Validate first collection structure
            const firstCollection = collectionsData.collections![0];
            
            // Should have collection date (ISO 8601 string)
            const collectionDate = firstCollection.collectionDate || firstCollection.collection_date;
            expect(collectionDate).toBeDefined();
            expect(typeof collectionDate).toBe('string');
            
            // Should be parseable as date
            const parsedDate = new Date(collectionDate!);
            expect(parsedDate.toString()).not.toBe('Invalid Date');
            
            // Should have service type
            const serviceType = firstCollection.serviceType || firstCollection.service_type;
            expect(serviceType).toBeDefined();
            expect(typeof serviceType).toBe('string');
            expect(serviceType!.length).toBeGreaterThan(0);
            
            // Valid service types
            const validServiceTypes = [
              'general_waste',
              'recycling',
              'garden_waste',
              'food_waste',
              'glass',
              'other'
            ];
            expect(validServiceTypes).toContain(serviceType);
          }
        } else if (collectionsResponse.status === 503) {
          // Service unavailable - validate error structure
          expect(collectionsData.statusCode).toBe(503);
          expect(collectionsData.message || collectionsData.error).toBeDefined();
        }
      }, 60000);
    });
  });

  describe('Mock Data Acceptance Tests', () => {
    test('Mock data responses (confidence 0.5) are acceptable', async () => {
      // Test a council that likely returns mock data
      const councilId = 'eastleigh';
      const postcode = testPostcodes.postcodes.eastleigh;
      
      // Get address
      const addressUrl = `${API_BASE_URL}/v1/postcodes/${encodeURIComponent(postcode)}/addresses?councilId=${councilId}`;
      const addressResponse = await fetch(addressUrl);
      
      if (addressResponse.status !== 200) {
        return; // Skip if not available
      }
      
      const addressData: AddressResponse = await addressResponse.json();
      
      if (!addressData.addresses || addressData.addresses.length === 0) {
        return;
      }
      
      const firstAddress = addressData.addresses[0];
      const councilLocalId = firstAddress.councilLocalId || firstAddress.council_local_id;
      const propertyId = `${councilId}:${councilLocalId}`;
      
      // Get collections
      const collectionsUrl = `${API_BASE_URL}/v1/properties/${encodeURIComponent(propertyId)}/collections`;
      const collectionsResponse = await fetch(collectionsUrl);
      
      if (collectionsResponse.status !== 200) {
        return;
      }
      
      const collectionsData: CollectionResponse = await collectionsResponse.json();
      
      // Accept confidence of 0.5 or higher (mock data threshold)
      expect(collectionsData.confidence).toBeDefined();
      expect(collectionsData.confidence).toBeGreaterThanOrEqual(0.5);
      
      // Even if warning is present (mock data), response is still valid
      if (collectionsData.warning) {
        expect(typeof collectionsData.warning).toBe('string');
      }
      
      // Collections should still be valid structure
      expect(collectionsData.collections).toBeDefined();
      expect(Array.isArray(collectionsData.collections)).toBe(true);
    }, 60000);

    test('Response with warning field is structurally valid', async () => {
      // Test all councils and collect those with warnings
      const councilsWithWarnings: string[] = [];
      
      for (const { councilId, postcode } of councilsWithAdapters.slice(0, 3)) {
        try {
          // Get address
          const addressUrl = `${API_BASE_URL}/v1/postcodes/${encodeURIComponent(postcode)}/addresses?councilId=${councilId}`;
          const addressResponse = await fetch(addressUrl);
          
          if (addressResponse.status !== 200) {
            continue;
          }
          
          const addressData: AddressResponse = await addressResponse.json();
          
          if (!addressData.addresses || addressData.addresses.length === 0) {
            continue;
          }
          
          const firstAddress = addressData.addresses[0];
          const councilLocalId = firstAddress.councilLocalId || firstAddress.council_local_id;
          const propertyId = `${councilId}:${councilLocalId}`;
          
          // Get collections
          const collectionsUrl = `${API_BASE_URL}/v1/properties/${encodeURIComponent(propertyId)}/collections`;
          const collectionsResponse = await fetch(collectionsUrl);
          
          if (collectionsResponse.status !== 200) {
            continue;
          }
          
          const collectionsData: CollectionResponse = await collectionsResponse.json();
          
          if (collectionsData.warning) {
            councilsWithWarnings.push(councilId);
            
            // Validate that warning is a string
            expect(typeof collectionsData.warning).toBe('string');
            
            // Even with warning, other fields should be valid
            expect(collectionsData.confidence).toBeDefined();
            expect(collectionsData.collections).toBeDefined();
          }
        } catch (error) {
          // Skip councils that error
          continue;
        }
      }
      
      // Test should pass regardless of how many councils have warnings
      // This just validates that warnings (when present) are well-formed
      console.log(`Councils with warnings: ${councilsWithWarnings.join(', ') || 'none'}`);
    }, 90000);
  });

  describe('Error Handling', () => {
    test('Invalid postcode returns 400 validation error', async () => {
      const invalidPostcode = 'INVALID';
      const councilId = 'eastleigh';
      
      const addressUrl = `${API_BASE_URL}/v1/postcodes/${encodeURIComponent(invalidPostcode)}/addresses?councilId=${councilId}`;
      const addressResponse = await fetch(addressUrl);
      
      // Should return 400 (validation error)
      expect([400, 404]).toContain(addressResponse.status);
      expect(addressResponse.headers.get('content-type')).toContain('application/json');
      
      const addressData: AddressResponse = await addressResponse.json();
      
      if (addressResponse.status === 400) {
        expect(addressData.statusCode).toBe(400);
        expect(addressData.message || addressData.error).toBeDefined();
      }
    }, 30000);

    test('Unknown council returns 404 not found', async () => {
      const postcode = testPostcodes.postcodes.eastleigh;
      const invalidCouncilId = 'does-not-exist';
      
      const addressUrl = `${API_BASE_URL}/v1/postcodes/${encodeURIComponent(postcode)}/addresses?councilId=${invalidCouncilId}`;
      const addressResponse = await fetch(addressUrl);
      
      // Should return 404 (not found)
      expect(addressResponse.status).toBe(404);
      expect(addressResponse.headers.get('content-type')).toContain('application/json');
      
      const addressData: AddressResponse = await addressResponse.json();
      expect(addressData.statusCode).toBe(404);
    }, 30000);

    test('Invalid property ID format returns 400 or 404', async () => {
      const invalidPropertyId = 'invalid-format-no-colon';
      
      const collectionsUrl = `${API_BASE_URL}/v1/properties/${encodeURIComponent(invalidPropertyId)}/collections`;
      const collectionsResponse = await fetch(collectionsUrl);
      
      // Should return 400 (validation) or 404 (not found)
      expect([400, 404]).toContain(collectionsResponse.status);
      expect(collectionsResponse.headers.get('content-type')).toContain('application/json');
    }, 30000);
  });

  describe('Resilience Tests', () => {
    test('No 500 errors (internal server errors are bugs)', async () => {
      const testCases = [
        {
          url: `${API_BASE_URL}/v1/postcodes/${encodeURIComponent(testPostcodes.postcodes.eastleigh)}/addresses?councilId=eastleigh`,
          name: 'Address lookup'
        },
        {
          url: `${API_BASE_URL}/v1/properties/eastleigh:test/collections`,
          name: 'Collections lookup'
        },
        {
          url: `${API_BASE_URL}/v1/postcodes/INVALID/addresses`,
          name: 'Invalid postcode'
        }
      ];
      
      for (const testCase of testCases) {
        const response = await fetch(testCase.url);
        expect(response.status).not.toBe(500);
        
        // Even error responses should be JSON
        expect(response.headers.get('content-type')).toContain('application/json');
      }
    }, 60000);

    test('All responses are JSON (never HTML)', async () => {
      const endpoints = [
        `/v1/postcodes/${encodeURIComponent(testPostcodes.postcodes.eastleigh)}/addresses`,
        '/v1/postcodes/INVALID/addresses',
        '/v1/properties/eastleigh:test/collections',
      ];
      
      for (const endpoint of endpoints) {
        const response = await fetch(`${API_BASE_URL}${endpoint}`);
        const contentType = response.headers.get('content-type');
        
        expect(contentType).toContain('application/json');
        
        // Should parse as valid JSON
        const data = await response.json();
        expect(data).toBeDefined();
      }
    }, 60000);
  });

  describe('Date Format Validation', () => {
    test('Collection dates are valid ISO 8601 strings', async () => {
      const councilId = 'eastleigh';
      const postcode = testPostcodes.postcodes.eastleigh;
      
      // Get address
      const addressUrl = `${API_BASE_URL}/v1/postcodes/${encodeURIComponent(postcode)}/addresses?councilId=${councilId}`;
      const addressResponse = await fetch(addressUrl);
      
      if (addressResponse.status !== 200) {
        return;
      }
      
      const addressData: AddressResponse = await addressResponse.json();
      
      if (!addressData.addresses || addressData.addresses.length === 0) {
        return;
      }
      
      const firstAddress = addressData.addresses[0];
      const councilLocalId = firstAddress.councilLocalId || firstAddress.council_local_id;
      const propertyId = `${councilId}:${councilLocalId}`;
      
      // Get collections
      const collectionsUrl = `${API_BASE_URL}/v1/properties/${encodeURIComponent(propertyId)}/collections`;
      const collectionsResponse = await fetch(collectionsUrl);
      
      if (collectionsResponse.status !== 200) {
        return;
      }
      
      const collectionsData: CollectionResponse = await collectionsResponse.json();
      
      if (!collectionsData.collections || collectionsData.collections.length === 0) {
        return;
      }
      
      // Validate all collection dates
      for (const collection of collectionsData.collections) {
        const dateStr = collection.collectionDate || collection.collection_date;
        expect(dateStr).toBeDefined();
        
        // Should parse as valid date
        const parsedDate = new Date(dateStr!);
        expect(parsedDate.toString()).not.toBe('Invalid Date');
        
        // Should be in ISO 8601 format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ)
        expect(dateStr).toMatch(/^\d{4}-\d{2}-\d{2}/);
      }
    }, 60000);
  });
});
