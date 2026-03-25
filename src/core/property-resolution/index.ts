/**
 * Hampshire Bin Collection Data Platform
 * Property Resolution Service
 * 
 * Implements layered property resolution flow as per ADR-005.
 * Manages property identity, council routing, and address resolution.
 */

import { randomUUID } from 'node:crypto';
import type {
  PropertyLookupInput,
  PropertyIdentity,
  AddressCandidateResult,
  AddressCandidate,
  CollectionEventResult,
  CollectionServiceResult,
  CouncilAdapter,
} from '../../adapters/base/adapter.interface';
import {
  normalisePostcode,
  isValidPostcode,
  isHampshirePostcode,
  resolveCouncil,
  extractPrefix,
} from './postcode-utils';

const MAX_HOUSE_IDENTIFIER_LENGTH = 50;
const HOUSE_IDENTIFIER_SAFE_CHARS = /^[a-zA-Z0-9\s,.\-/]+$/;

export interface PropertyResolutionResult {
  success: boolean;
  data?: {
    propertyId: string;
    address: string;
    postcode: string;
    councilId: string;
    councilLocalId: string;
    uprn?: string;
    candidates?: AddressCandidate[];
    autoResolved: boolean;
  };
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  metadata: {
    requestId: string;
    processedAt: string;
    validationTime: number;
    resolutionTime: number;
  };
}

export interface CollectionScheduleResult {
  success: boolean;
  data?: {
    propertyId: string;
    events: CollectionEventResult;
    services: CollectionServiceResult;
    sourceCouncil: string;
    cachedUntil?: string;
  };
  error?: {
    code: string;
    message: string;
  };
  metadata: {
    requestId: string;
    processedAt: string;
  };
}

export class PropertyResolutionService {
  private adapterRegistry: Map<string, CouncilAdapter> = new Map();
  private redisCache?: any; // Redis client (to be injected)
  private database?: any;    // Database client (to be injected)

  constructor(
    adapters: CouncilAdapter[],
    options?: {
      redisCache?: any;
      database?: any;
    }
  ) {
    for (const adapter of adapters) {
      this.adapterRegistry.set(adapter.councilId, adapter);
    }
    this.redisCache = options?.redisCache;
    this.database = options?.database;
  }

  /**
   * Resolve property by postcode with optional house identifier.
   * Implements full layered resolution flow per ADR-005.
   */
  async resolveByPostcode(
    postcode: string,
    houseIdentifier?: string
  ): Promise<PropertyResolutionResult> {
    const requestId = randomUUID();
    const startTime = Date.now();
    
    // Step 1: Validate postcode format
    if (!isValidPostcode(postcode)) {
      return this.errorResult(
        requestId,
        'INVALID_POSTCODE',
        'Postcode format is invalid. UK postcodes must be in format XX## #XX',
        { postcode: postcode.substring(0, 10) },
        startTime
      );
    }

    // Step 2: Normalise postcode
    const normalisedPostcode = normalisePostcode(postcode);
    if (!normalisedPostcode) {
      return this.errorResult(
        requestId,
        'INVALID_POSTCODE',
        'Unable to normalise postcode',
        { postcode: postcode.substring(0, 10) },
        startTime
      );
    }

    // Step 3: Validate house identifier if provided
    let sanitisedHouse: string | undefined;
    if (houseIdentifier) {
      sanitisedHouse = this.sanitiseHouseIdentifier(houseIdentifier);
      if (!sanitisedHouse) {
        return this.errorResult(
          requestId,
          'INVALID_HOUSE_IDENTIFIER',
          'House identifier contains invalid characters or is too long',
          { maxLength: MAX_HOUSE_IDENTIFIER_LENGTH },
          startTime
        );
      }
    }

    // Step 4: Check if postcode is in Hampshire scope
    if (!isHampshirePostcode(normalisedPostcode)) {
      const prefix = extractPrefix(normalisedPostcode);
      return this.errorResult(
        requestId,
        'POSTCODE_NOT_HAMPSHIRE',
        'Postcode is outside Hampshire scope. This service only covers Hampshire councils.',
        { postcodePrefix: prefix },
        startTime
      );
    }

    const validationTime = Date.now() - startTime;

    // Step 5: Determine council(s)
    const councilResult = resolveCouncil(normalisedPostcode);
    if (!councilResult) {
      return this.errorResult(
        requestId,
        'COUNCIL_NOT_FOUND',
        'Unable to determine council for postcode',
        { postcode: normalisedPostcode },
        startTime
      );
    }

    const councils = Array.isArray(councilResult) ? councilResult : [councilResult];
    
    // Step 6: Query adapter(s) for addresses
    const resolutionStart = Date.now();
    const allCandidates: AddressCandidate[] = [];
    const errors: string[] = [];

    for (const councilId of councils) {
      const adapter = this.adapterRegistry.get(councilId);
      if (!adapter) {
        errors.push(`Adapter not found for council: ${councilId}`);
        continue;
      }

      // Check kill switch
      if (await this.isAdapterDisabled(councilId)) {
        errors.push(`Adapter disabled for council: ${councilId}`);
        continue;
      }

      try {
        const lookupInput: PropertyLookupInput = {
          postcode: normalisedPostcode,
          addressFragment: sanitisedHouse,
          correlationId: requestId,
        };

        const result = await adapter.resolveAddresses(lookupInput);
        
        if (result.success && result.data) {
          allCandidates.push(...result.data);
        } else {
          errors.push(`${councilId}: ${result.errorMessage || 'Unknown error'}`);
        }
      } catch (error) {
        errors.push(`${councilId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Step 7: Deduplicate by UPRN or address
    const dedupedCandidates = this.deduplicateCandidates(allCandidates);

    if (dedupedCandidates.length === 0) {
      return this.errorResult(
        requestId,
        'PROPERTY_NOT_FOUND',
        'No properties found for the provided postcode and address',
        { 
          postcode: normalisedPostcode,
          errors: errors.length > 0 ? errors : undefined,
        },
        startTime
      );
    }

    const resolutionTime = Date.now() - resolutionStart;

    // Step 8: Auto-resolve if single result
    if (dedupedCandidates.length === 1) {
      const candidate = dedupedCandidates[0];
      const propertyId = await this.resolveOrCreateProperty(candidate, councils[0]);

      // Cache resolved property
      await this.cachePropertyResolution(propertyId, candidate, normalisedPostcode);

      return {
        success: true,
        data: {
          propertyId,
          address: candidate.addressDisplay,
          postcode: candidate.postcode,
          councilId: councils[0],
          councilLocalId: candidate.councilLocalId,
          uprn: candidate.uprn,
          autoResolved: true,
        },
        metadata: {
          requestId,
          processedAt: new Date().toISOString(),
          validationTime,
          resolutionTime,
        },
      };
    }

    // Step 9: Return candidates for user selection
    return {
      success: true,
      data: {
        propertyId: '', // Not yet resolved
        address: '',
        postcode: normalisedPostcode,
        councilId: councils[0],
        councilLocalId: '',
        candidates: dedupedCandidates,
        autoResolved: false,
      },
      metadata: {
        requestId,
        processedAt: new Date().toISOString(),
        validationTime,
        resolutionTime,
      },
    };
  }

  /**
   * Resolve property by opaque property ID.
   */
  async resolveByPropertyId(propertyId: string): Promise<PropertyResolutionResult> {
    const requestId = randomUUID();
    const startTime = Date.now();

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(propertyId)) {
      return this.errorResult(
        requestId,
        'INVALID_PROPERTY_ID',
        'Property ID must be a valid UUID',
        {},
        startTime
      );
    }

    // Check cache first
    const cached = await this.getCachedProperty(propertyId);
    if (cached) {
      return {
        success: true,
        data: cached,
        metadata: {
          requestId,
          processedAt: new Date().toISOString(),
          validationTime: 0,
          resolutionTime: Date.now() - startTime,
        },
      };
    }

    // Lookup from database
    const property = await this.lookupPropertyById(propertyId);
    if (!property) {
      return this.errorResult(
        requestId,
        'PROPERTY_NOT_FOUND',
        'Property not found',
        { propertyId },
        startTime
      );
    }

    // Cache for next time
    await this.cachePropertyById(propertyId, property);

    return {
      success: true,
      data: property,
      metadata: {
        requestId,
        processedAt: new Date().toISOString(),
        validationTime: 0,
        resolutionTime: Date.now() - startTime,
      },
    };
  }

  /**
   * Get collection schedule for a resolved property.
   */
  async getCollectionSchedule(propertyId: string): Promise<CollectionScheduleResult> {
    const requestId = randomUUID();
    const startTime = Date.now();

    // Resolve property first
    const propertyResult = await this.resolveByPropertyId(propertyId);
    if (!propertyResult.success || !propertyResult.data) {
      return {
        success: false,
        error: propertyResult.error || {
          code: 'PROPERTY_NOT_FOUND',
          message: 'Property not found',
        },
        metadata: {
          requestId,
          processedAt: new Date().toISOString(),
        },
      };
    }

    const property = propertyResult.data;
    const adapter = this.adapterRegistry.get(property.councilId);
    
    if (!adapter) {
      return {
        success: false,
        error: {
          code: 'ADAPTER_NOT_FOUND',
          message: 'Council adapter not available',
        },
        metadata: {
          requestId,
          processedAt: new Date().toISOString(),
        },
      };
    }

    // Check kill switch
    if (await this.isAdapterDisabled(property.councilId)) {
      return {
        success: false,
        error: {
          code: 'ADAPTER_DISABLED',
          message: 'Council adapter is currently disabled',
        },
        metadata: {
          requestId,
          processedAt: new Date().toISOString(),
        },
      };
    }

    try {
      const propertyIdentity: PropertyIdentity = {
        councilLocalId: property.councilLocalId,
        uprn: property.uprn,
        address: property.address,
        postcode: property.postcode,
        correlationId: requestId,
      };

      const [events, services] = await Promise.all([
        adapter.getCollectionEvents(propertyIdentity),
        adapter.getCollectionServices(propertyIdentity),
      ]);

      return {
        success: true,
        data: {
          propertyId,
          events,
          services,
          sourceCouncil: property.councilId,
        },
        metadata: {
          requestId,
          processedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'ADAPTER_ERROR',
          message: error instanceof Error ? error.message : 'Unknown adapter error',
        },
        metadata: {
          requestId,
          processedAt: new Date().toISOString(),
        },
      };
    }
  }

  // Private helper methods

  private sanitiseHouseIdentifier(raw: string): string | null {
    const trimmed = raw.trim();
    
    if (trimmed.length === 0 || trimmed.length > MAX_HOUSE_IDENTIFIER_LENGTH) {
      return null;
    }

    // Strip HTML tags
    const noHtml = trimmed.replace(/<[^>]*>/g, '');
    
    // Check for safe characters only
    if (!HOUSE_IDENTIFIER_SAFE_CHARS.test(noHtml)) {
      return null;
    }

    return noHtml;
  }

  private deduplicateCandidates(candidates: AddressCandidate[]): AddressCandidate[] {
    const seen = new Set<string>();
    const result: AddressCandidate[] = [];

    for (const candidate of candidates) {
      // Prefer UPRN for deduplication
      const key = candidate.uprn || candidate.addressNormalised;
      
      if (!seen.has(key)) {
        seen.add(key);
        result.push(candidate);
      }
    }

    return result;
  }

  private async resolveOrCreateProperty(
    candidate: AddressCandidate,
    councilId: string
  ): Promise<string> {
    // Check if property exists by UPRN
    if (candidate.uprn) {
      const existing = await this.lookupPropertyByUprn(candidate.uprn);
      if (existing) return existing.propertyId;
    }

    // Check by council local ID
    const existingByLocalId = await this.lookupPropertyByCouncilLocalId(
      councilId,
      candidate.councilLocalId
    );
    if (existingByLocalId) return existingByLocalId.propertyId;

    // Check by normalised address
    const existingByAddress = await this.lookupPropertyByAddress(
      candidate.addressNormalised,
      candidate.postcode
    );
    if (existingByAddress) return existingByAddress.propertyId;

    // Create new property
    return await this.createProperty(candidate, councilId);
  }

  private async isAdapterDisabled(councilId: string): Promise<boolean> {
    // TODO: Check kill switch in database/Redis
    // For now, return false (all enabled)
    return false;
  }

  private async cachePropertyResolution(
    propertyId: string,
    candidate: AddressCandidate,
    postcode: string
  ): Promise<void> {
    // TODO: Implement Redis cache with 24h TTL
  }

  private async getCachedProperty(propertyId: string): Promise<any> {
    // TODO: Implement Redis cache lookup
    return null;
  }

  private async cachePropertyById(propertyId: string, property: any): Promise<void> {
    // TODO: Implement Redis cache with 24h TTL
  }

  private async lookupPropertyById(propertyId: string): Promise<any> {
    // TODO: Implement database lookup
    return null;
  }

  private async lookupPropertyByUprn(uprn: string): Promise<any> {
    // TODO: Implement database lookup
    return null;
  }

  private async lookupPropertyByCouncilLocalId(
    councilId: string,
    localId: string
  ): Promise<any> {
    // TODO: Implement database lookup
    return null;
  }

  private async lookupPropertyByAddress(
    addressNormalised: string,
    postcode: string
  ): Promise<any> {
    // TODO: Implement database lookup with fuzzy matching
    return null;
  }

  private async createProperty(candidate: AddressCandidate, councilId: string): Promise<string> {
    // TODO: Implement database insert
    return randomUUID();
  }

  private errorResult(
    requestId: string,
    code: string,
    message: string,
    details: Record<string, unknown>,
    startTime: number
  ): PropertyResolutionResult {
    return {
      success: false,
      error: {
        code,
        message,
        details,
      },
      metadata: {
        requestId,
        processedAt: new Date().toISOString(),
        validationTime: Date.now() - startTime,
        resolutionTime: 0,
      },
    };
  }
}
