/**
 * Hart District Council - Raw Response Types
 * 
 * @module adapters/hart/types
 */

export interface HartRawResponse {
  address?: string;
  postcode?: string;
  collections?: HartCollection[];
  schedule?: HartCollection[];
  bins?: HartCollection[];
  error?: string;
  message?: string;
  propertyId?: string;
  uprn?: string | number;
}

export interface HartCollection {
  service?: string;
  binType?: string;
  type?: string;
  wasteType?: string;
  collectionDate?: string;
  nextCollection?: string;
  date?: string;
  containerColour?: string;
  binColour?: string;
  colour?: string;
  containerType?: string;
  frequency?: string;
  collectionDay?: string;
  dayOfWeek?: string;
  notes?: string;
  message?: string;
}

export interface HartAddress {
  address?: string;
  addressLine?: string;
  fullAddress?: string;
  propertyId?: string;
  id?: string;
  uprn?: string | number;
  postcode?: string;
  houseNumber?: string;
  houseName?: string;
  street?: string;
  town?: string;
}

/**
 * JSON response from Hart API.
 * Response is an array with single object containing HTML in 'data' field.
 */
export type HartJsonResponse = Array<{ data: string }>;

/**
 * Parsed HTML table data.
 */
export interface HartHtmlData {
  /** UPRN */
  uprn: string;
  
  /** Collection schedule extracted from HTML table */
  collections: Array<{ services: string[]; date: string }>;
  
  /** Warnings during parsing */
  warnings: string[];
}

