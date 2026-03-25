/**
 * Test Valley Borough Council - Raw Response Types
 */
export interface TestValleyRawResponse {
  address?: string;
  postcode?: string;
  uprn?: string | number;
  collections?: TestValleyCollection[];
  schedule?: TestValleyCollection[];
  error?: string;
  propertyId?: string;
}

export interface TestValleyCollection {
  service?: string;
  binType?: string;
  type?: string;
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

export interface TestValleyAddress {
  address?: string;
  addressLine?: string;
  fullAddress?: string;
  propertyId?: string;
  id?: string;
  uprn?: string | number;
  postcode?: string;
  houseNumber?: string;
  street?: string;
  town?: string;
}

export interface TestValleyHtmlData {
  collections: TestValleyCollection[];
  address?: string;
  warnings: string[];
}
