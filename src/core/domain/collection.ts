// TODO: Domain type for Collection
export interface Collection {
  id: string;
  propertyId: string;
  councilId: string;
  binType: string;
  nextCollectionDate: Date;
  frequency: 'weekly' | 'fortnightly' | 'monthly' | 'irregular';
  notes?: string;
  sourceUrl?: string;
  evidenceRef: string;
  acquiredAt: Date;
  expiresAt?: Date;
}

export interface BinType {
  code: string;
  name: string;
  description: string;
  color?: string;
  recyclingType?: 'general-waste' | 'recycling' | 'garden' | 'food' | 'glass' | 'other';
}
