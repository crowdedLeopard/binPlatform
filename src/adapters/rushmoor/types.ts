/**
 * Rushmoor Borough Council - Raw Response Types
 * 
 * These types represent untrusted upstream responses from Rushmoor's
 * bin collection lookup system (HTML form or XHR endpoint).
 * 
 * @module adapters/rushmoor/types
 */

/**
 * Raw Rushmoor XHR/JSON response (if JSON endpoint exists).
 */
export interface RushmoorRawResponse {
  /** Property address */
  address?: string;
  
  /** Postcode */
  postcode?: string;
  
  /** Collection schedule */
  collections?: RushmoorCollection[];
  schedule?: RushmoorCollection[];
  bins?: RushmoorCollection[];
  
  /** Error message */
  error?: string;
  message?: string;
  
  /** Property identifier */
  propertyId?: string;
  uprn?: string | number;
}

/**
 * Individual collection from Rushmoor.
 */
export interface RushmoorCollection {
  /** Service type (e.g., "Green bin", "Blue bin", "Food waste") */
  service?: string;
  binType?: string;
  type?: string;
  wasteType?: string;
  
  /** Collection date */
  collectionDate?: string;
  nextCollection?: string;
  date?: string;
  
  /** Container information */
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
}

/**
 * Address candidate from postcode lookup.
 */
export interface RushmoorAddress {
  /** Full address string */
  address?: string;
  addressLine?: string;
  fullAddress?: string;
  
  /** Property identifier */
  propertyId?: string;
  id?: string;
  uprn?: string | number;
  
  /** Postcode */
  postcode?: string;
  
  /** Address components */
  houseNumber?: string;
  houseName?: string;
  street?: string;
  town?: string;
}

/**
 * HTML form structure (if using form submission).
 */
export interface RushmoorFormData {
  /** CSRF token from form */
  csrfToken?: string;
  
  /** Form action URL */
  actionUrl?: string;
  
  /** Postcode input field name */
  postcodeFieldName?: string;
  
  /** Address select field name */
  addressFieldName?: string;
  
  /** Other hidden fields */
  hiddenFields?: Record<string, string>;
}

/**
 * Parsed HTML response containing collection data.
 */
export interface RushmoorHtmlData {
  /** Collection schedule extracted from HTML */
  collections: RushmoorCollection[];
  
  /** Property address */
  address?: string;
  
  /** Warnings during parsing */
  warnings: string[];
}
