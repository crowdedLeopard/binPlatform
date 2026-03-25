/**
 * UPRN Resolution Service
 * 
 * Resolves UK postcodes to UPRNs (Unique Property Reference Numbers) using:
 * 1. postcodes.io (free) — validates postcode, returns council name
 * 2. OS Places API (requires key) — returns real addresses with UPRNs
 * 
 * Falls back to synthetic IDs when OS Places API key not available.
 */

export interface UprnLookupResult {
  uprn: string;
  address: string;
  postcode: string;
  councilId: string;
  confidence: number;
}

/**
 * Postcode.io API response structure
 */
interface PostcodesIoResult {
  status: number;
  result: {
    postcode: string;
    admin_district: string;
    latitude: number;
    longitude: number;
    country: string;
  } | null;
}

/**
 * OS Places API response structure
 */
interface OsPlacesResult {
  header: {
    totalresults: number;
  };
  results?: Array<{
    DPA?: {
      UPRN: string;
      ADDRESS: string;
      POSTCODE: string;
      LOCAL_CUSTODIAN_CODE: number;
    };
  }>;
}

/**
 * Map postcodes.io admin_district names to our council IDs
 */
const ADMIN_DISTRICT_TO_COUNCIL_ID: Record<string, string> = {
  'Basingstoke and Deane': 'basingstoke-deane',
  'East Hampshire': 'east-hampshire',
  'Eastleigh': 'eastleigh',
  'Fareham': 'fareham',
  'Gosport': 'gosport',
  'Hart': 'hart',
  'Havant': 'havant',
  'New Forest': 'new-forest',
  'Portsmouth': 'portsmouth',
  'Rushmoor': 'rushmoor',
  'Southampton': 'southampton',
  'Test Valley': 'test-valley',
  'Winchester': 'winchester',
};

/**
 * Normalize postcode to standard format (uppercase with space)
 */
function normalizePostcode(postcode: string): string {
  return postcode.toUpperCase().replace(/\s+/g, ' ').trim();
}

/**
 * Validate UK postcode format
 */
function isValidPostcodeFormat(postcode: string): boolean {
  const ukPostcodeRegex = /^([A-Z]{1,2}\d{1,2}[A-Z]?)\s(\d[A-Z]{2})$/;
  return ukPostcodeRegex.test(postcode);
}

/**
 * Fetch postcode data from postcodes.io
 * Returns council name and validates postcode exists
 */
async function fetchPostcodeInfo(postcode: string): Promise<{ councilId: string; latitude: number; longitude: number } | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const encodedPostcode = encodeURIComponent(postcode.replace(/\s+/g, ''));
    const response = await fetch(`https://api.postcodes.io/postcodes/${encodedPostcode}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Hampshire-Bin-Platform/1.0' },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 404) {
        return null; // Postcode not found
      }
      throw new Error(`postcodes.io returned ${response.status}`);
    }

    const data = await response.json() as PostcodesIoResult;
    
    if (!data.result || !data.result.admin_district) {
      return null;
    }

    const councilId = ADMIN_DISTRICT_TO_COUNCIL_ID[data.result.admin_district];
    if (!councilId) {
      // Not a Hampshire council
      return null;
    }

    return {
      councilId,
      latitude: data.result.latitude,
      longitude: data.result.longitude,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if ((error as Error).name === 'AbortError') {
      throw new Error('postcodes.io request timeout');
    }
    throw error;
  }
}

/**
 * Fetch addresses from OS Places API
 */
async function fetchOsPlacesAddresses(postcode: string, apiKey: string): Promise<OsPlacesResult | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const encodedPostcode = encodeURIComponent(postcode);
    const url = `https://api.os.uk/search/places/v1/postcode?postcode=${encodedPostcode}&key=${apiKey}`;
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Hampshire-Bin-Platform/1.0' },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`OS Places API returned ${response.status}`);
    }

    const data = await response.json() as OsPlacesResult;
    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    if ((error as Error).name === 'AbortError') {
      throw new Error('OS Places API request timeout');
    }
    throw error;
  }
}

/**
 * Generate synthetic property IDs for fallback mode
 */
function generateSyntheticAddresses(postcode: string, councilId: string, count: number = 5): UprnLookupResult[] {
  const results: UprnLookupResult[] = [];
  
  for (let i = 1; i <= count; i++) {
    results.push({
      uprn: `synthetic_${councilId}_${postcode.replace(/\s+/g, '')}_${i}`,
      address: `${i} Example Street, ${councilId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`,
      postcode,
      councilId,
      confidence: 0.5, // Lower confidence for synthetic data
    });
  }
  
  return results;
}

/**
 * Resolve postcode to UPRN addresses.
 * 
 * Strategy:
 * 1. Validate postcode format
 * 2. Call postcodes.io to validate and get council name
 * 3. If OS_PLACES_API_KEY is set, call OS Places API for real UPRNs
 * 4. Otherwise, fall back to synthetic property IDs
 * 
 * @param postcode - UK postcode (with or without space)
 * @returns Array of matching addresses with UPRNs
 */
export async function resolvePostcodeToUprn(postcode: string): Promise<UprnLookupResult[]> {
  const normalized = normalizePostcode(postcode);
  
  // Validate format before any external calls
  if (!isValidPostcodeFormat(normalized)) {
    throw new Error('Invalid UK postcode format');
  }

  // Step 1: Get council ID from postcodes.io
  const postcodeInfo = await fetchPostcodeInfo(normalized);
  if (!postcodeInfo) {
    // Postcode not found or not in Hampshire
    return [];
  }

  const { councilId } = postcodeInfo;

  // Step 2: Try OS Places API if key available
  const osPlacesApiKey = process.env.OS_PLACES_API_KEY;
  
  if (osPlacesApiKey) {
    try {
      const osPlacesData = await fetchOsPlacesAddresses(normalized, osPlacesApiKey);
      
      if (osPlacesData && osPlacesData.results && osPlacesData.results.length > 0) {
        const addresses: UprnLookupResult[] = osPlacesData.results
          .filter(result => result.DPA) // Only use Delivery Point Address records
          .map(result => ({
            uprn: result.DPA!.UPRN,
            address: result.DPA!.ADDRESS,
            postcode: result.DPA!.POSTCODE,
            councilId,
            confidence: 1.0, // High confidence for OS Places data
          }));

        return addresses;
      }
    } catch (error) {
      // Log warning but continue to fallback
      console.warn(`OS Places API error for ${normalized}: ${(error as Error).message}`);
    }
  } else {
    // Log warning if OS Places API key not configured
    console.warn('OS_PLACES_API_KEY not set — using synthetic property IDs. Set env var for real UPRN lookup.');
  }

  // Step 3: Fallback to synthetic addresses
  return generateSyntheticAddresses(normalized, councilId);
}

/**
 * Determine which council ID a postcode belongs to.
 * Uses postcodes.io for accurate council detection.
 */
export async function determineCouncilFromPostcode(postcode: string): Promise<string | null> {
  const normalized = normalizePostcode(postcode);
  
  if (!isValidPostcodeFormat(normalized)) {
    return null;
  }

  const postcodeInfo = await fetchPostcodeInfo(normalized);
  return postcodeInfo?.councilId || null;
}
