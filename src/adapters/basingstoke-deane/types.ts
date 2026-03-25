/**
 * Basingstoke & Deane Borough Council - Raw Response Types
 * 
 * These types represent untrusted upstream responses from Basingstoke's
 * bin collection lookup system (HTML form submission).
 * 
 * @module adapters/basingstoke-deane/types
 */

/**
 * Raw Basingstoke XHR/JSON response (if JSON endpoint exists).
 */
export interface BasingstokeRawResponse {
  /** Property address */
  address?: string;
  
  /** Postcode */
  postcode?: string;
  
  /** Collection schedule */
  collections?: BasingstokeCollection[];
  schedule?: BasingstokeCollection[];
  bins?: BasingstokeCollection[];
  
  /** Error message */
  error?: string;
  message?: string;
  
  /** Property identifier */
  propertyId?: string;
  uprn?: string | number;
}

/**
 * Individual collection from Basingstoke.
 */
export interface BasingstokeCollection {
  /** Service type (e.g., "Rubbish", "Recycling", "Food waste", "Garden waste") */
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
  containerType?: string;
  
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
export interface BasingstokeAddress {
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
export interface BasingstokeFormData {
  /** CSRF token from form */
  csrfToken?: string;
  
  /** Form action URL */
  actionUrl?: string;
  
  /** Postcode input field name */
  postcodeFieldName?: string;
  
  /** Street input field name */
  streetFieldName?: string;
  
  /** House name/number field name */
  houseFieldName?: string;
  
  /** Address select field name */
  addressFieldName?: string;
  
  /** Other hidden fields */
  hiddenFields?: Record<string, string>;
}

/**
 * Parsed HTML response containing collection data.
 */
export interface BasingstokeHtmlData {
  /** UPRN */
  uprn: string;
  
  /** Collection schedule extracted from HTML */
  collections: Array<{ service: string; dates: string[] }>;
  
  /** Warnings during parsing */
  warnings: string[];
}
