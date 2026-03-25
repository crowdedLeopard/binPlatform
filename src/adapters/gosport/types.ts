/**
 * Gosport Borough Council - Raw Response Types
 * 
 * @module adapters/gosport/types
 */

export interface GosportRawResponse {
  address?: string;
  postcode?: string;
  collections?: GosportCollection[];
  schedule?: GosportCollection[];
  bins?: GosportCollection[];
  error?: string;
  message?: string;
  propertyId?: string;
  uprn?: string | number;
}

export interface GosportCollection {
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

export interface GosportAddress {
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

export interface GosportFormData {
  csrfToken?: string;
  actionUrl?: string;
  postcodeFieldName?: string;
  addressFieldName?: string;
  hiddenFields?: Record<string, string>;
}

export interface GosportHtmlData {
  collections: GosportCollection[];
  address?: string;
  warnings: string[];
}
