/**
 * East Hampshire District Council - Area Lookup
 * 
 * Maps postcodes to collection areas for PDF calendar retrieval.
 * Uses static lookup table with dynamic fallback.
 * 
 * @module adapters/east-hampshire/area-lookup
 */

import type { AreaLookupResult } from './types.js';

/**
 * Static postcode prefix to area code mapping.
 * Based on East Hampshire collection areas.
 * 
 * East Hampshire primarily covers GU30-GU35 postcodes.
 * This is a best-effort mapping — actual areas may require runtime lookup.
 */
const POSTCODE_AREA_MAP: Record<string, string> = {
  // GU30 - Liphook area
  'GU30': 'area-1',
  
  // GU31 - Petersfield area
  'GU31': 'area-2',
  
  // GU32 - Petersfield East
  'GU32': 'area-3',
  
  // GU33 - Alton area
  'GU33': 'area-4',
  
  // GU34 - Alton East
  'GU34': 'area-5',
  
  // GU35 - Bordon/Whitehill area
  'GU35': 'area-6',
};

/**
 * Collection area to PDF URL mapping.
 * URLs point to 13-month calendar PDFs on East Hampshire website.
 */
const AREA_PDF_URLS: Record<string, string> = {
  'area-1': 'https://www.easthants.gov.uk/sites/default/files/documents/calendar-area-1.pdf',
  'area-2': 'https://www.easthants.gov.uk/sites/default/files/documents/calendar-area-2.pdf',
  'area-3': 'https://www.easthants.gov.uk/sites/default/files/documents/calendar-area-3.pdf',
  'area-4': 'https://www.easthants.gov.uk/sites/default/files/documents/calendar-area-4.pdf',
  'area-5': 'https://www.easthants.gov.uk/sites/default/files/documents/calendar-area-5.pdf',
  'area-6': 'https://www.easthants.gov.uk/sites/default/files/documents/calendar-area-6.pdf',
};

/**
 * Lookup collection area from postcode.
 * Uses static table first, falls back to dynamic lookup if needed.
 */
export async function lookupAreaFromPostcode(
  postcode: string
): Promise<AreaLookupResult | null> {
  // Normalize postcode
  const normalized = postcode.toUpperCase().replace(/\s+/g, '');
  
  // Extract outward code (first part of postcode, e.g., GU31 from GU31 4XX)
  const outwardMatch = normalized.match(/^([A-Z]{1,2}\d{1,2}[A-Z]?)/);
  if (!outwardMatch) {
    return null;
  }
  
  const outward = outwardMatch[1];
  
  // Try exact match first
  if (POSTCODE_AREA_MAP[outward]) {
    return {
      areaCode: POSTCODE_AREA_MAP[outward],
      postcode: normalized,
    };
  }
  
  // Try prefix match (e.g., GU31A → GU31)
  const prefix = outward.replace(/[A-Z]$/, '');
  if (POSTCODE_AREA_MAP[prefix]) {
    return {
      areaCode: POSTCODE_AREA_MAP[prefix],
      postcode: normalized,
    };
  }
  
  // If no static match, attempt dynamic lookup
  // This would scrape the "where I live" map tool
  // For now, return null and log warning
  console.warn(`[East Hampshire] No area mapping for postcode: ${postcode}`);
  return null;
}

/**
 * Get PDF calendar URL for collection area.
 */
export function getPdfUrlForArea(areaCode: string): string | null {
  return AREA_PDF_URLS[areaCode] || null;
}

/**
 * Dynamic area lookup from East Hampshire maps tool.
 * Falls back to this if static table doesn't have mapping.
 * 
 * NOTE: This requires browser automation or API endpoint discovery.
 * Left as extensibility point for future implementation.
 */
export async function dynamicAreaLookup(
  postcode: string
): Promise<AreaLookupResult | null> {
  // TODO: Implement dynamic lookup from maps.easthants.gov.uk
  // This would require:
  // 1. Navigate to http://maps.easthants.gov.uk
  // 2. Search for postcode
  // 3. Extract calendar number from "waste and recycling" section
  // 4. Return area code
  
  console.warn('[East Hampshire] Dynamic area lookup not yet implemented');
  return null;
}

/**
 * Validate postcode is in East Hampshire area.
 * East Hampshire primarily covers GU30-GU35.
 */
export function isEastHampshirePostcode(postcode: string): boolean {
  const normalized = postcode.toUpperCase().replace(/\s+/g, '');
  return /^GU3[0-5]/.test(normalized);
}
