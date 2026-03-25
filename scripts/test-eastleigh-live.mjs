/**
 * Test the Eastleigh adapter with a real UPRN
 * Run with: node scripts/test-eastleigh-live.mjs
 */

// Known test UPRN from the adapter code
const TEST_UPRN = '100060321174';
const EASTLEIGH_ENDPOINT = 'https://my.eastleigh.gov.uk/apex/EBC_Waste_Calendar';

console.log('🧪 Testing Eastleigh API directly...\n');
console.log(`Endpoint: ${EASTLEIGH_ENDPOINT}`);
console.log(`Test UPRN: ${TEST_UPRN}\n`);

const url = `${EASTLEIGH_ENDPOINT}?UPRN=${TEST_UPRN}`;
console.log(`Full URL: ${url}\n`);

try {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': 'HampshireBinData/1.0 (Municipal Service)',
      'Accept': 'application/json, text/html, */*',
      'Accept-Language': 'en-GB,en;q=0.9',
      'Referer': 'https://www.eastleigh.gov.uk/waste-bins-and-recycling/collection-dates',
    },
  });

  console.log(`Status: ${response.status} ${response.statusText}`);
  console.log(`Content-Type: ${response.headers.get('content-type')}`);
  console.log(`Content-Length: ${response.headers.get('content-length')}\n`);

  const text = await response.text();
  console.log('Raw Response (first 2000 chars):\n');
  console.log(text.substring(0, 2000));
  console.log('\n...\n');

  // Try parsing as JSON
  try {
    const json = JSON.parse(text);
    console.log('\n✅ Response is valid JSON');
    console.log('\nParsed JSON structure:');
    console.log(JSON.stringify(json, null, 2).substring(0, 3000));
  } catch (e) {
    console.log('\n❌ Response is NOT JSON - likely HTML');
    
    // Check for common HTML indicators
    if (text.includes('<html') || text.includes('<!DOCTYPE')) {
      console.log('Response appears to be HTML document');
      
      // Look for error messages
      if (text.includes('404') || text.includes('Not Found')) {
        console.log('⚠️  Possible 404 error in HTML');
      }
      if (text.includes('error') || text.includes('Error')) {
        console.log('⚠️  HTML contains "error"');
      }
    }
  }

} catch (error) {
  console.error('❌ Request failed:', error.message);
  console.error(error);
}
