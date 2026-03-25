/**
 * Portsmouth City Council - Raw Response Types
 * 
 * Types for untrusted upstream responses from Portsmouth's Granicus platform.
 * Portsmouth uses a Granicus portal (my.portsmouth.gov.uk) which may require
 * session management and CSRF token handling.
 * 
 * @module adapters/portsmouth/types
 */

/**
 * Raw Portsmouth collection response (from Granicus portal or hidden API).
 */
export interface PortsmouthRawResponse {
  /** Property address */
  address?: string;
  
  /** Postcode */
  postcode?: string;
  
  /** UPRN if provided */
  uprn?: string | number;
  
  /** Collection schedule */
  collections?: PortsmouthCollection[];
  schedule?: PortsmouthCollection[];
  bins?: PortsmouthCollection[];
  
  /** Error message */
  error?: string;
  message?: string;
  
  /** Property identifier */
  propertyId?: string;
  councilReference?: string;
  
  /** Session/CSRF tokens if needed */
  sessionId?: string;
  csrfToken?: string;
}

/**
 * Individual collection from Portsmouth.
 */
export interface PortsmouthCollection {
  /** Service type (e.g., "General Waste", "Recycling", "Garden Waste") */
  service?: string;
  binType?: string;
  type?: string;
  wasteType?: string;
  
  /** Collection date */
  collectionDate?: string;
  nextCollection?: string;
  date?: string;
  
  /** Container information */
  containerType?: string;
  containerColour?: string;
  binColour?: string;
  colour?: string;
  
  /** Frequency */
  frequency?: string;
  
  /** Day of week */
  collectionDay?: string;
  dayOfWeek?: string;
  
  /** Notes */
  notes?: string;
  message?: string;
  
  /** Whether rescheduled (e.g., bank holidays) */
  isRescheduled?: boolean;
  rescheduled?: boolean;
  
  /** Original date if rescheduled */
  originalDate?: string;
}

/**
 * Address candidate from Portsmouth postcode/property lookup.
 */
export interface PortsmouthAddress {
  /** Full address string */
  address?: string;
  addressLine?: string;
  fullAddress?: string;
  
  /** Property identifier */
  propertyId?: string;
  id?: string;
  uprn?: string | number;
  councilReference?: string;
  
  /** Postcode */
  postcode?: string;
  
  /** Address components */
  houseNumber?: string;
  houseName?: string;
  street?: string;
  locality?: string;
  town?: string;
}

/**
 * Parsed HTML/DOM data from Portsmouth Granicus portal.
 */
export interface PortsmouthHtmlData {
  /** Collection schedule extracted from DOM */
  collections: PortsmouthCollection[];
  
  /** Property address */
  address?: string;
  
  /** Warnings during parsing */
  warnings: string[];
}

/**
 * Granicus portal specific metadata.
 */
export interface GranicusPortalData {
  /** Session ID for Granicus platform */
  sessionId?: string;
  
  /** CSRF token for form submissions */
  csrfToken?: string;
  
  /** Whether session requires renewal */
  sessionExpired?: boolean;
  
  /** Portal version or build */
  portalVersion?: string;
}

/**
 * Portsmouth API endpoint response (if discovered).
 */
export interface PortsmouthApiResponse {
  /** Success status */
  success?: boolean;
  
  /** Status code */
  statusCode?: number;
  
  /** Response data */
  data?: {
    address?: string;
    postcode?: string;
    collections?: PortsmouthCollection[];
    services?: Array<{
      name: string;
      frequency: string;
      nextCollection?: string;
    }>;
  };
  
  /** Error details */
  error?: {
    message?: string;
    code?: string;
    details?: string;
  };
}
