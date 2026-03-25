// TODO: Data normalisation logic
// - Normalize dates from various formats
// - Normalize bin types across councils
// - Normalize addresses
// - Validate and clean data

export interface NormalisationResult<T> {
  normalised: T;
  warnings: string[];
  rawValue: unknown;
}

export function normaliseDate(rawDate: unknown): NormalisationResult<Date> {
  // TODO: Parse various date formats from council data
  // Handle DD/MM/YYYY, YYYY-MM-DD, ISO8601, etc.
  throw new Error('Not implemented');
}

export function normaliseBinType(rawType: string, councilId: string): NormalisationResult<string> {
  // TODO: Map council-specific bin types to standard types
  throw new Error('Not implemented');
}

export function normaliseAddress(rawAddress: unknown): NormalisationResult<{
  line1: string;
  line2?: string;
  city: string;
  postcode: string;
}> {
  // TODO: Parse and normalize address components
  throw new Error('Not implemented');
}
