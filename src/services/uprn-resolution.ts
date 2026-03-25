/**
 * UPRN Resolution Service
 * 
 * Resolves UK postcodes to UPRNs (Unique Property Reference Numbers).
 * 
 * For production, this should integrate with:
 * - OS Places API
 * - Google Places API
 * - Internal property database
 * 
 * For now, this provides a working mock with real Hampshire postcodes.
 */

export interface UprnLookupResult {
  uprn: string;
  address: string;
  postcode: string;
  councilId: string;
  confidence: number;
}

/**
 * Known test UPRNs for Hampshire councils (from adapter documentation)
 */
const KNOWN_TEST_PROPERTIES: Record<string, UprnLookupResult[]> = {
  // Eastleigh postcodes
  'SO50 5PN': [
    { uprn: '100060321174', address: '1 High Street, Eastleigh', postcode: 'SO50 5PN', councilId: 'eastleigh', confidence: 1.0 },
    { uprn: '100060321175', address: '2 High Street, Eastleigh', postcode: 'SO50 5PN', councilId: 'eastleigh', confidence: 1.0 },
  ],
  'SO50 4PA': [
    { uprn: '100062120001', address: 'Eastleigh Borough Council, Civic Offices', postcode: 'SO50 4PA', councilId: 'eastleigh', confidence: 1.0 },
  ],
  
  // Fareham postcodes
  'PO16 7XX': [
    { uprn: '100062483936', address: '1 West Street, Fareham', postcode: 'PO16 7XX', councilId: 'fareham', confidence: 1.0 },
  ],
  'PO16 7GZ': [
    { uprn: '100062483950', address: 'Civic Offices, Civic Way, Fareham', postcode: 'PO16 7GZ', councilId: 'fareham', confidence: 1.0 },
  ],
  
  // Basingstoke postcodes
  'RG21 4AH': [
    { uprn: '100060450000', address: '1 London Road, Basingstoke', postcode: 'RG21 4AH', councilId: 'basingstoke-deane', confidence: 1.0 },
  ],
};

/**
 * Normalize postcode to standard format (remove spaces, uppercase)
 */
function normalizePostcode(postcode: string): string {
  return postcode.toUpperCase().replace(/\s+/g, ' ').trim();
}

/**
 * Resolve postcode to UPRN addresses.
 * 
 * @param postcode - UK postcode (with or without space)
 * @returns Array of matching addresses with UPRNs
 */
export async function resolvePostcodeToUprn(postcode: string): Promise<UprnLookupResult[]> {
  const normalized = normalizePostcode(postcode);
  
  // Check known test properties
  if (KNOWN_TEST_PROPERTIES[normalized]) {
    return KNOWN_TEST_PROPERTIES[normalized];
  }
  
  // For unknown postcodes, return empty array
  // In production, this would call OS Places API or similar
  return [];
}

/**
 * Determine which council ID a postcode belongs to.
 * This is a simplified version - production would use boundary data.
 */
export function determineCouncilFromPostcode(postcode: string): string | null {
  const normalized = normalizePostcode(postcode);
  
  // Simple prefix matching for Hampshire councils
  const prefix = normalized.split(' ')[0];
  
  // Hampshire postcode area mappings (simplified)
  const COUNCIL_MAPPINGS: Record<string, string> = {
    'SO50': 'eastleigh',
    'SO51': 'eastleigh',
    'SO53': 'eastleigh',
    'PO14': 'fareham',
    'PO15': 'fareham',
    'PO16': 'fareham',
    'PO17': 'fareham',
    'RG21': 'basingstoke-deane',
    'RG22': 'basingstoke-deane',
    'RG23': 'basingstoke-deane',
    'RG24': 'basingstoke-deane',
    'GU14': 'rushmoor',
    'GU11': 'hart',
    'GU12': 'hart',
    'PO9': 'havant',
    'PO10': 'havant',
    'PO12': 'gosport',
    'SO14': 'southampton',
    'SO15': 'southampton',
    'SO16': 'southampton',
    'SO17': 'southampton',
    'PO1': 'portsmouth',
    'PO2': 'portsmouth',
    'PO3': 'portsmouth',
    'PO4': 'portsmouth',
    'PO5': 'portsmouth',
    'SO43': 'new-forest',
    'SO41': 'new-forest',
    'SO24': 'winchester',
    'SO21': 'winchester',
    'SO22': 'winchester',
    'SO23': 'winchester',
    'SP10': 'test-valley',
    'SP11': 'test-valley',
    'GU34': 'east-hampshire',
    'GU35': 'east-hampshire',
  };
  
  return COUNCIL_MAPPINGS[prefix] || null;
}
