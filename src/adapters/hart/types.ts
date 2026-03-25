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

export interface HartFormData {
  csrfToken?: string;
  actionUrl?: string;
  postcodeFieldName?: string;
  addressFieldName?: string;
  hiddenFields?: Record<string, string>;
}

export interface HartHtmlData {
  collections: HartCollection[];
  address?: string;
  warnings: string[];
}
