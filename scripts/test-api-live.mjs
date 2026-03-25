/**
 * Quick test of the API endpoints
 */

import { buildServer } from '../dist/api/server.js';

async function test() {
  console.log('Starting server...');
  const server = await buildServer();
  
  try {
    await server.listen({ port: 3003, host: '127.0.0.1' });
    console.log('✓ Server listening on port 3003\n');
    
    // Test 1: Health endpoint
    console.log('TEST 1: Health endpoint');
    const healthResp = await server.inject({ method: 'GET', url: '/health' });
    console.log(`Status: ${healthResp.statusCode}`);
    console.log(`Body: ${healthResp.body}\n`);
    
    // Test 2: Postcode lookup - Eastleigh
    console.log('TEST 2: Postcode lookup (SO50 5PN - Eastleigh)');
    const postcodeResp = await server.inject({ method: 'GET', url: '/v1/postcodes/SO50%205PN/addresses' });
    console.log(`Status: ${postcodeResp.statusCode}`);
    const postcodeData = JSON.parse(postcodeResp.body);
    console.log(`Found ${postcodeData.count} addresses`);
    console.log(`First address:`, postcodeData.addresses[0]);
    console.log('');
    
    // Test 3: Get collections for the first property
    if (postcodeData.addresses && postcodeData.addresses.length > 0) {
      const propertyId = postcodeData.addresses[0].id;
      console.log(`TEST 3: Get collections for property ${propertyId}`);
      const collectionsResp = await server.inject({ method: 'GET', url: `/v1/properties/${encodeURIComponent(propertyId)}/collections` });
      console.log(`Status: ${collectionsResp.statusCode}`);
      const collectionsData = JSON.parse(collectionsResp.body);
      console.log(`Response:`, JSON.stringify(collectionsData, null, 2));
    }
    
    console.log('\n✅ All tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  } finally {
    await server.close();
    console.log('\nServer closed');
  }
}

test().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
