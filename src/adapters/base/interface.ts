/**
 * Base adapter interface for council data acquisition
 * 
 * All council adapters must implement this interface.
 * See Holden's adapter interface specification for full details.
 * 
 * @interface CouncilAdapter
 */

export interface PropertyQuery {
  postcode?: string;
  uprn?: string;
  addressLine1?: string;
  addressLine2?: string;
}

export interface CollectionSchedule {
  propertyId: string;
  councilId: string;
  collections: Collection[];
  lastUpdated: Date;
  sourceUrl?: string;
  evidenceRef?: string;
}

export interface Collection {
  binType: string;
  nextCollectionDate: Date;
  frequency: string;
  notes?: string;
}

export interface AdapterMetadata {
  councilId: string;
  councilName: string;
  adapterType: 'api' | 'scrape' | 'hybrid';
  requiresAuth: boolean;
  rateLimit?: {
    maxRequests: number;
    windowMs: number;
  };
}

export interface AdapterHealth {
  healthy: boolean;
  lastSuccessfulRun?: Date;
  lastError?: string;
  consecutiveFailures: number;
}

/**
 * Base interface all adapters must implement
 */
export interface CouncilAdapter {
  /**
   * Adapter metadata
   */
  readonly metadata: AdapterMetadata;

  /**
   * Check if adapter is healthy and operational
   */
  healthCheck(): Promise<AdapterHealth>;

  /**
   * Query collection schedule for a property
   * @param query Property identifiers (postcode, UPRN, address)
   * @returns Collection schedule with evidence reference
   */
  getCollectionSchedule(query: PropertyQuery): Promise<CollectionSchedule>;

  /**
   * Cleanup resources (close browser, connections, etc.)
   */
  cleanup(): Promise<void>;
}
