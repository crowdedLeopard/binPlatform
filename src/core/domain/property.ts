// TODO: Domain type for Property
export interface Property {
  id: string;
  councilId: string;
  uprn?: string;
  postcode: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  county: string;
  latitude?: number;
  longitude?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PropertySearchResult {
  property: Property;
  confidence: number; // 0.0 to 1.0
  matchedFields: string[];
}
