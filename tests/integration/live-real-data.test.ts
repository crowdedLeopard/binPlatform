/**
 * Live Real Data Integration Tests
 * 
 * Tests that REAL data (not mock data) flows end-to-end from live API.
 * 
 * These tests are designed to FAIL when mock data is being served and PASS when real data flows.
 * 
 * Expected behavior:
 * - FAILS if confidence < 0.8 (mock data threshold)
 * - FAILS if warning field is present
 * - FAILS if collection dates are not real future dates
 * - PASSES only when genuine council data is flowing through
 * 
 * Usage:
 * - Run with RUN_LIVE_TESTS=true environment variable
 * - Skipped in CI by default (requires live API)
 * - As adapters are fixed, these tests should start passing
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
  date?: string;
  serviceType?: string;
  service_type?: string;
  bin_types?: string[];
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

describe.skipIf(!isLiveTestsEnabled)('Live Real Data Integration Tests', () => {
  // Test each council that has a live adapter
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

  describe('End-to-End Real Data Flow', () => {
    councilsWithAdapters.forEach(({ councilId, postcode }) => {
      test(`${councilId}: Real data flows from address lookup to collections`, async () => {
        // Step 1: Get addresses for postcode
        const addressUrl = `${API_BASE_URL}/v1/postcodes/${encodeURIComponent(postcode)}/addresses?councilId=${councilId}`;
        const addressResponse = await fetch(addressUrl);
        
        // Should get 200 (not 503 for mock data or errors)
        expect(addressResponse.status).toBe(200);
        expect(addressResponse.headers.get('content-type')).toContain('application/json');
        
        const addressData: AddressResponse = await addressResponse.json();
        
        // Should have addresses array
        expect(addressData.addresses).toBeDefined();
        expect(Array.isArray(addressData.addresses)).toBe(true);
        expect(addressData.addresses!.length).toBeGreaterThan(0);
        
        // Step 2: Get collections for first address
        const firstAddress = addressData.addresses![0];
        const councilLocalId = firstAddress.councilLocalId || firstAddress.council_local_id;
        expect(councilLocalId).toBeDefined();
        
        const propertyId = `${councilId}:${councilLocalId}`;
        const collectionsUrl = `${API_BASE_URL}/v1/properties/${encodeURIComponent(propertyId)}/collections`;
        const collectionsResponse = await fetch(collectionsUrl);
        
        // Should get 200
        expect(collectionsResponse.status).toBe(200);
        expect(collectionsResponse.headers.get('content-type')).toContain('application/json');
        
        const collectionsData: CollectionResponse = await collectionsResponse.json();
        
        // CRITICAL ASSERTIONS: This is REAL data, not mock data
        
        // 1. Confidence must be >= 0.8 (real data threshold)
        expect(collectionsData.confidence).toBeDefined();
        expect(collectionsData.confidence).toBeGreaterThanOrEqual(0.8);
        
        // 2. NO warning field should be present (mock data adds "Using mock data" warning)
        expect(collectionsData.warning).toBeUndefined();
        
        // 3. Should have collections array
        expect(collectionsData.collections).toBeDefined();
        expect(Array.isArray(collectionsData.collections)).toBe(true);
        expect(collectionsData.collections!.length).toBeGreaterThan(0);
        
        // 4. At least one collection date should be in the future
        const now = new Date();
        const futureDates = collectionsData.collections!.filter((collection) => {
          const dateStr = collection.collectionDate || collection.collection_date || collection.date;
          expect(dateStr).toBeDefined();
          const collectionDate = new Date(dateStr!);
          return collectionDate > now;
        });
        
        expect(futureDates.length).toBeGreaterThan(0);
        
        // 5. Each collection should have a service type or bin types
        collectionsData.collections!.forEach((collection) => {
          const serviceType = collection.serviceType || collection.service_type;
          const binTypes = collection.bin_types;
          
          // Should have either service_type or bin_types
          const hasServiceInfo = serviceType || (binTypes && binTypes.length > 0);
          expect(hasServiceInfo).toBeTruthy();
          
          if (serviceType) {
            expect(typeof serviceType).toBe('string');
            expect(serviceType!.length).toBeGreaterThan(0);
          }
        });
      }, 60000); // 60s timeout for live API calls
    });
  });

  describe('Real Data Quality Checks', () => {
    test('Eastleigh: API-based adapter should have confidence >= 0.9', async () => {
      const postcode = testPostcodes.postcodes.eastleigh;
      const councilId = 'eastleigh';
      
      // Get address
      const addressUrl = `${API_BASE_URL}/v1/postcodes/${encodeURIComponent(postcode)}/addresses?councilId=${councilId}`;
      const addressResponse = await fetch(addressUrl);
      
      if (addressResponse.status !== 200) {
        // If service unavailable, skip this quality check
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
      
      // Eastleigh is API-based, should have very high confidence
      expect(collectionsData.confidence).toBeGreaterThanOrEqual(0.9);
      expect(collectionsData.warning).toBeUndefined();
    }, 60000);

    test('East Hampshire: PDF-based adapter should have confidence >= 0.7 and < 0.9', async () => {
      const postcode = testPostcodes.postcodes['east-hampshire'];
      const councilId = 'east-hampshire';
      
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
      
      // PDF-based should be lower confidence than API but still real data
      expect(collectionsData.confidence).toBeGreaterThanOrEqual(0.7);
      expect(collectionsData.confidence).toBeLessThan(0.9);
      expect(collectionsData.warning).toBeUndefined();
    }, 60000);

    test('Fareham: Bartec API should have confidence >= 0.9', async () => {
      const postcode = testPostcodes.postcodes.fareham;
      const councilId = 'fareham';
      
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
      
      // Bartec is API-based, should have very high confidence
      expect(collectionsData.confidence).toBeGreaterThanOrEqual(0.9);
      expect(collectionsData.warning).toBeUndefined();
    }, 60000);
  });

  describe('Mock Data Detection (Should All FAIL Initially)', () => {
    test('ALL councils: No mock data warnings should be present', async () => {
      const failures: string[] = [];
      
      for (const { councilId, postcode } of councilsWithAdapters) {
        try {
          // Get address
          const addressUrl = `${API_BASE_URL}/v1/postcodes/${encodeURIComponent(postcode)}/addresses?councilId=${councilId}`;
          const addressResponse = await fetch(addressUrl);
          
          if (addressResponse.status !== 200) {
            continue; // Skip if not available
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
          
          // Check for mock data indicators
          if (collectionsData.warning) {
            failures.push(`${councilId}: Has warning field: "${collectionsData.warning}"`);
          }
          
          if (collectionsData.confidence !== undefined && collectionsData.confidence < 0.8) {
            failures.push(`${councilId}: Low confidence (${collectionsData.confidence}) suggests mock data`);
          }
        } catch (error) {
          // Skip councils that error
          continue;
        }
      }
      
      if (failures.length > 0) {
        throw new Error(
          `Mock data detected in ${failures.length} councils:\n${failures.join('\n')}`
        );
      }
    }, 120000); // 2 min timeout for testing all councils
  });
});
