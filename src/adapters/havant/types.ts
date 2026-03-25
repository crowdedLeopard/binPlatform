/**
 * Havant Borough Council - Raw Response Types
 * 
 * @module adapters/havant/types
 */

export interface HavantRawResponse {
  address?: string;
  postcode?: string;
  area?: 'north' | 'south'; // Havant has North/South split
  collections?: HavantCollection[];
  schedule?: HavantCollection[];
  bins?: HavantCollection[];
  error?: string;
  message?: string;
  propertyId?: string;
  uprn?: string | number;
}

export interface HavantCollection {
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
  week?: 'A' | 'B'; // Alternate weekly service
  notes?: string;
  message?: string;
}

export interface HavantAddress {
  address?: string;
  addressLine?: string;
  fullAddress?: string;
  propertyId?: string;
  id?: string;
  uprn?: string | number;
  postcode?: string;
  area?: 'north' | 'south';
  houseNumber?: string;
  houseName?: string;
  street?: string;
  town?: string;
}

export interface HavantFormData {
  csrfToken?: string;
  actionUrl?: string;
  postcodeFieldName?: string;
  addressFieldName?: string;
  hiddenFields?: Record<string, string>;
}

export interface HavantHtmlData {
  collections: HavantCollection[];
  address?: string;
  area?: 'north' | 'south';
  warnings: string[];
}
