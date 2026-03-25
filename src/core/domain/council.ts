// TODO: Domain type for Council
export interface Council {
  id: string;
  name: string;
  region: string;
  website: string;
  contactEmail?: string;
  contactPhone?: string;
  adapterStatus: 'active' | 'inactive' | 'development';
  lastSync?: Date;
}
