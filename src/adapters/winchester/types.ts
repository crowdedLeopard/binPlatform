/**
 * Winchester City Council - Raw Response Types
 * 
 * Types for untrusted upstream responses from Winchester's React SPA.
 * Winchester uses a JavaScript-rendered interface (my.winchester.gov.uk/icollectionday/).
 * 
 * @module adapters/winchester/types
 */

/**
 * Raw Winchester collection response (from React SPA or XHR endpoint).
 */
export interface WinchesterRawResponse {
  /** Property address */
  address?: string;
  
  /** Postcode */
  postcode?: string;
  
  /** UPRN if provided */
  uprn?: string | number;
  
  /** Collection schedule */
  collections?: WinchesterCollection[];
  schedule?: WinchesterCollection[];
  bins?: WinchesterCollection[];
  
  /** Error message */
  error?: string;
  message?: string;
  
  /** Property identifier */
  propertyId?: string;
  councilReference?: string;
}

/**
 * Individual collection from Winchester.
 */
export interface WinchesterCollection {
  /** Service type (e.g., "Refuse", "Recycling", "Food", "Garden") */
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
 * Address candidate from Winchester postcode lookup.
 */
export interface WinchesterAddress {
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
 * Parsed HTML/DOM data from Winchester React SPA.
 */
export interface WinchesterHtmlData {
  /** Collection schedule extracted from DOM */
  collections: WinchesterCollection[];
  
  /** Property address */
  address?: string;
  
  /** Warnings during parsing */
  warnings: string[];
}

/**
 * Winchester React component state (if discoverable).
 */
export interface WinchesterReactState {
  /** Property data */
  property?: {
    address?: string;
    postcode?: string;
    uprn?: string;
    propertyId?: string;
  };
  
  /** Collections array */
  collections?: WinchesterCollection[];
  
  /** Loading state */
  loading?: boolean;
  
  /** Error state */
  error?: string;
}
