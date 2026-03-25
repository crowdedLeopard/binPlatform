// TODO: gosport adapter
import { BaseAdapter } from '../base/base-adapter.js';
import { AdapterMetadata, AdapterHealth, PropertyQuery, CollectionSchedule } from '../base/interface.js';

export class Adapter extends BaseAdapter {
  readonly metadata: AdapterMetadata = {
    councilId: 'gosport',
    councilName: 'Council Name', // TODO: Set proper name
    adapterType: 'scrape',
    requiresAuth: false
  };

  async healthCheck(): Promise<AdapterHealth> {
    return { healthy: true, consecutiveFailures: 0 };
  }

  async getCollectionSchedule(query: PropertyQuery): Promise<CollectionSchedule> {
    throw new Error('Not implemented');
  }

  async cleanup(): Promise<void> {}
}
