// TODO: East Hampshire District Council adapter
import { BaseAdapter } from '../base/base-adapter.js';
import { AdapterMetadata, AdapterHealth, PropertyQuery, CollectionSchedule } from '../base/interface.js';

export class EastHampshireAdapter extends BaseAdapter {
  readonly metadata: AdapterMetadata = {
    councilId: 'east-hampshire',
    councilName: 'East Hampshire District Council',
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
