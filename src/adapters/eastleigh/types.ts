/**
 * Eastleigh Borough Council - Raw API Response Types
 * 
 * These types represent the untrusted upstream response structure.
 * Permissive by design — upstream may change without notice.
 * 
 * @module adapters/eastleigh/types
 */

/**
 * Raw Oracle APEX response from Eastleigh waste calendar endpoint.
 * Based on discovery: my.eastleigh.gov.uk/apex/EBC_Waste_Calendar?UPRN=<uprn>
 * 
 * Structure is inferred — actual response may vary.
 * Parser must handle missing fields gracefully.
 */
export interface EastleighRawResponse {
  /** UPRN of the property */
  uprn?: string | number;
  
  /** Property address (may be full or partial) */
  address?: string;
  
  /** Postcode */
  postcode?: string;
  
  /** Collection schedule data (structure varies) */
  collections?: EastleighCollection[] | null;
  
  /** Error message if UPRN not found */
  error?: string;
  
  /** Status indicator */
  status?: string;
  
  /** Any additional metadata */
  metadata?: Record<string, unknown>;
  
  /** Alternative field names observed in the wild */
  collectionSchedule?: EastleighCollection[];
  schedule?: EastleighCollection[];
  bins?: EastleighCollection[];
}

/**
 * Individual collection event from Eastleigh API.
 * Field names are inferred and may differ in actual responses.
 */
export interface EastleighCollection {
  /** Service/bin type (e.g., "Refuse", "Recycling", "Garden") */
  service?: string;
  serviceType?: string;
  binType?: string;
  type?: string;
  
  /** Collection date (format varies: ISO, DD/MM/YYYY, etc.) */
  collectionDate?: string;
  date?: string;
  nextCollection?: string;
  
  /** Optional time window */
  collectionTime?: string;
  
  /** Frequency description */
  frequency?: string;
  
  /** Container information */
  containerType?: string;
  containerColour?: string;
  binColour?: string;
  
  /** Whether service is active */
  active?: boolean;
  isActive?: boolean;
  
  /** Rescheduling information */
  rescheduled?: boolean;
  originalDate?: string;
  rescheduleReason?: string;
  
  /** Additional notes */
  notes?: string;
  message?: string;
}

/**
 * UPRN validation result.
 */
export interface UprnValidation {
  valid: boolean;
  normalized?: string;
  error?: string;
}

/**
 * Eastleigh HTML response fallback type.
 * If endpoint returns HTML instead of JSON, we need to parse DOM.
 */
export interface EastleighHtmlResponse {
  html: string;
  statusCode: number;
  headers: Record<string, string>;
}
