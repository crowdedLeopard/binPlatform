// TODO: Property resolution logic
// - Fuzzy address matching
// - UPRN lookup and validation
// - Postcode to address resolution
// - Confidence scoring

import { PropertySearchResult } from '../domain/property.js';

export interface PropertyResolutionQuery {
  postcode?: string;
  uprn?: string;
  addressLine1?: string;
  councilId?: string;
}

export async function resolveProperty(
  query: PropertyResolutionQuery
): Promise<PropertySearchResult[]> {
  // TODO: Implement property resolution
  // - Search by UPRN (exact match, high confidence)
  // - Search by postcode + address (fuzzy match, variable confidence)
  // - Use external APIs (OS Places API, etc.) if needed
  // - Score matches by confidence
  throw new Error('Not implemented');
}

export function calculateConfidence(
  query: PropertyResolutionQuery,
  candidate: any
): number {
  // TODO: Score matching confidence (0.0 to 1.0)
  // - Exact UPRN match = 1.0
  // - Postcode + full address match = 0.9
  // - Postcode + partial address = 0.6-0.8
  // - Postcode only = 0.3-0.5
  return 0.0;
}
