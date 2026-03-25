/**
 * Hampshire Bin Collection Data Platform
 * Postcode Utilities
 * 
 * Utilities for UK postcode validation, normalisation, and Hampshire council resolution.
 */

const UK_POSTCODE_REGEX = /^([A-Z]{1,2}\d{1,2}[A-Z]?)\s?(\d[A-Z]{2})$/i;

const HAMPSHIRE_POSTCODE_MAP: Record<string, string[]> = {
  'basingstoke-deane': ['RG21', 'RG22', 'RG23', 'RG24', 'RG25', 'RG26', 'RG27', 'RG28', 'RG29'],
  'east-hampshire': ['GU30', 'GU31', 'GU32', 'GU33', 'GU34', 'GU35'],
  'eastleigh': ['SO50', 'SO51', 'SO52', 'SO53'],
  'fareham': ['PO14', 'PO15', 'PO16', 'PO17'],
  'gosport': ['PO12', 'PO13'],
  'hart': ['GU11', 'GU12', 'GU13', 'GU14', 'GU17', 'GU46', 'GU51', 'GU52'],
  'havant': ['PO7', 'PO8', 'PO9'],
  'new-forest': ['SO40', 'SO41', 'SO42', 'SO43', 'SO45', 'BH23', 'BH24', 'BH25'],
  'portsmouth': ['PO1', 'PO2', 'PO3', 'PO4', 'PO5', 'PO6'],
  'rushmoor': ['GU9', 'GU10', 'GU11', 'GU12', 'GU14'],
  'southampton': ['SO14', 'SO15', 'SO16', 'SO17', 'SO18', 'SO19'],
  'test-valley': ['SP10', 'SP11', 'SP6', 'SO20', 'SO51'],
  'winchester': ['SO21', 'SO22', 'SO23', 'SO32'],
};

/**
 * Normalise a UK postcode to standard format.
 * @param raw - Raw postcode input
 * @returns Normalised postcode (uppercase, single space) or null if invalid
 * @example normalisePostcode('so238qt') // 'SO23 8QT'
 */
export function normalisePostcode(raw: string): string | null {
  const trimmed = raw.trim();
  const match = trimmed.match(UK_POSTCODE_REGEX);
  
  if (!match) {
    return null;
  }
  
  const outward = match[1].toUpperCase();
  const inward = match[2].toUpperCase();
  
  return `${outward} ${inward}`;
}

/**
 * Extract postcode prefix (outward code) from a postcode.
 * @param postcode - Normalised postcode
 * @returns Postcode prefix (e.g., 'SO23')
 * @example extractPrefix('SO23 8QT') // 'SO23'
 */
export function extractPrefix(postcode: string): string {
  const parts = postcode.split(' ');
  return parts[0];
}

/**
 * Check if a postcode is within Hampshire scope.
 * @param postcode - Normalised postcode
 * @returns True if postcode is in Hampshire
 */
export function isHampshirePostcode(postcode: string): boolean {
  const prefix = extractPrefix(postcode);
  
  for (const prefixes of Object.values(HAMPSHIRE_POSTCODE_MAP)) {
    if (prefixes.includes(prefix)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Resolve postcode prefix to council ID(s).
 * @param postcode - Normalised postcode
 * @returns Council ID or array of council IDs if ambiguous, null if not Hampshire
 * @example resolveCouncil('SO23 8QT') // 'winchester'
 * @example resolveCouncil('GU11 1AA') // ['hart', 'rushmoor']
 */
export function resolveCouncil(postcode: string): string | string[] | null {
  const prefix = extractPrefix(postcode);
  const matches: string[] = [];
  
  for (const [councilId, prefixes] of Object.entries(HAMPSHIRE_POSTCODE_MAP)) {
    if (prefixes.includes(prefix)) {
      matches.push(councilId);
    }
  }
  
  if (matches.length === 0) {
    return null;
  }
  
  if (matches.length === 1) {
    return matches[0];
  }
  
  return matches;
}

/**
 * Validate UK postcode format strictly.
 * @param postcode - Raw postcode to validate
 * @returns True if valid UK postcode format
 */
export function isValidPostcode(postcode: string): boolean {
  return UK_POSTCODE_REGEX.test(postcode.trim());
}

/**
 * Get all postcodes for a council.
 * @param councilId - Council identifier
 * @returns Array of postcode prefixes or null if council not found
 */
export function getCouncilPostcodes(councilId: string): string[] | null {
  return HAMPSHIRE_POSTCODE_MAP[councilId] || null;
}

/**
 * Get all Hampshire councils with metadata.
 * @returns Map of council IDs to postcode prefixes
 */
export function getHampshireCouncils(): Record<string, string[]> {
  return { ...HAMPSHIRE_POSTCODE_MAP };
}
