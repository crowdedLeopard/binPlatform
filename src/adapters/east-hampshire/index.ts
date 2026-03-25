/**
 * East Hampshire District Council Adapter
 * 
 * Production-quality adapter for East Hampshire waste collection data using PDF calendars.
 * Implements postcode-based area lookup and PDF calendar parsing.
 * 
 * Method: PDF Calendar System (13-month calendars by collection area)
 * Input: Postcode → Area Code → PDF Calendar → Parsed Dates
 * 
 * @module adapters/east-hampshire
 */

import type {
  CouncilAdapter,
  CouncilCapabilities,
  PropertyLookupInput,
  PropertyIdentity,
  AddressCandidateResult,
  CollectionServiceResult,
  CollectionEventResult,
  DateRange,
  AdapterHealth,
  AdapterSecurityProfile,
  AcquisitionMetadata,
  BaseResult,
} from '../base/adapter.interface.js';
import {
  LookupMethod,
  FailureCategory,
  ExecutionRiskLevel,
  HealthStatus,
  ServiceType,
} from '../base/adapter.interface.js';
import { PdfCalendarBaseAdapter } from '../base/pdf-calendar-adapter.js';
import {
  lookupAreaFromPostcode,
  getPdfUrlForArea,
  isEastHampshirePostcode,
} from './area-lookup.js';
import type { EastHampshirePdfSchedule } from './types.js';
import {
  parsePdfCalendar,
  parseCollectionEvents,
  parseCollectionServices,
  calculateConfidence,
} from './parser.js';
import { v4 as uuidv4 } from 'uuid';

const ADAPTER_VERSION = '1.0.0';

export class EastHampshireAdapter extends PdfCalendarBaseAdapter implements CouncilAdapter {
  readonly councilId = 'east-hampshire';
  
  constructor() {
    super({
      maxSizeBytes: 5 * 1024 * 1024, // 5MB
      timeout: 30000,
      allowedDomains: ['easthants.gov.uk', 'www.easthants.gov.uk'],
      userAgent: 'HampshireBinData/1.0 (PDF Calendar Fetcher)',
    });
  }
  
  async discoverCapabilities(): Promise<CouncilCapabilities> {
    return {
      councilId: this.councilId,
      councilName: 'East Hampshire District Council',
      councilWebsite: 'https://www.easthants.gov.uk',
      supportsAddressLookup: true,
      supportsCollectionServices: true,
      supportsCollectionEvents: true,
      providesUprn: false,
      primaryLookupMethod: LookupMethod.PDF_CALENDAR,
      maxEventRangeDays: 395, // 13-month calendars
      supportedServiceTypes: [
        ServiceType.GENERAL_WASTE,
        ServiceType.RECYCLING,
        ServiceType.GARDEN_WASTE,
        ServiceType.FOOD_WASTE,
        ServiceType.GLASS,
      ],
      limitations: [
        'Requires postcode in East Hampshire area (GU30-GU35)',
        'PDF parsing less accurate than API data',
        '13-month calendar coverage only',
        'Service type inference from context',
      ],
      rateLimitRpm: 10, // Conservative due to PDF downloads
      adapterLastUpdated: '2026-03-25',
      isProductionReady: true,
    };
  }
  
  async resolveAddresses(input: PropertyLookupInput): Promise<AddressCandidateResult> {
    const metadata = this.createMetadata();
    
    // Validate postcode is in East Hampshire area
    if (!isEastHampshirePostcode(input.postcode)) {
      return this.failureResult(
        metadata,
        FailureCategory.NOT_FOUND,
        `Postcode ${input.postcode} is not in East Hampshire area (GU30-GU35)`
      );
    }
    
    // Lookup collection area
    const areaResult = await lookupAreaFromPostcode(input.postcode);
    
    if (!areaResult) {
      return this.failureResult(
        metadata,
        FailureCategory.NOT_FOUND,
        `No collection area found for postcode ${input.postcode}`
      );
    }
    
    metadata.completedAt = new Date().toISOString();
    metadata.durationMs = Date.now() - new Date(metadata.startedAt).getTime();
    
    return {
      success: true,
      data: [
        {
          councilLocalId: areaResult.areaCode,
          uprn: undefined,
          addressRaw: input.addressFragment || `Area ${areaResult.areaCode}`,
          addressNormalised: `Area ${areaResult.areaCode}`,
          addressDisplay: `Collection Area ${areaResult.areaCode}`,
          postcode: input.postcode,
          confidence: 0.9,
        },
      ],
      acquisitionMetadata: metadata,
      confidence: 0.9,
      warnings: ['Address resolution limited to collection area — no specific address match'],
      securityWarnings: [],
      fromCache: false,
    };
  }
  
  async getCollectionServices(input: PropertyIdentity): Promise<CollectionServiceResult> {
    const metadata = this.createMetadata();
    
    try {
      const schedule = await this.fetchPdfSchedule(
        input.councilLocalId,
        input.postcode,
        metadata
      );
      
      if (!schedule) {
        return this.failureResult(
          metadata,
          FailureCategory.NOT_FOUND,
          'Failed to fetch PDF calendar'
        );
      }
      
      const services = parseCollectionServices(schedule);
      
      metadata.completedAt = new Date().toISOString();
      metadata.durationMs = Date.now() - new Date(metadata.startedAt).getTime();
      
      return {
        success: true,
        data: services,
        acquisitionMetadata: metadata,
        sourceEvidenceRef: schedule.pdfMetadata.hash,
        confidence: calculateConfidence(schedule),
        warnings: schedule.warnings,
        securityWarnings: [],
        fromCache: false,
      };
    } catch (error) {
      return this.handleError(metadata, error);
    }
  }
  
  async getCollectionEvents(
    input: PropertyIdentity,
    range?: DateRange
  ): Promise<CollectionEventResult> {
    const metadata = this.createMetadata();
    
    try {
      const schedule = await this.fetchPdfSchedule(
        input.councilLocalId,
        input.postcode,
        metadata
      );
      
      if (!schedule) {
        return this.failureResult(
          metadata,
          FailureCategory.NOT_FOUND,
          'Failed to fetch PDF calendar'
        );
      }
      
      let events = parseCollectionEvents(schedule);
      
      // Filter by date range if provided
      if (range) {
        events = events.filter(event => 
          event.collectionDate >= range.from && event.collectionDate <= range.to
        );
      }
      
      metadata.completedAt = new Date().toISOString();
      metadata.durationMs = Date.now() - new Date(metadata.startedAt).getTime();
      
      return {
        success: true,
        data: events,
        acquisitionMetadata: metadata,
        sourceEvidenceRef: schedule.pdfMetadata.hash,
        confidence: calculateConfidence(schedule),
        warnings: schedule.warnings,
        securityWarnings: [],
        fromCache: false,
      };
    } catch (error) {
      return this.handleError(metadata, error);
    }
  }
  
  async verifyHealth(): Promise<AdapterHealth> {
    const testPostcode = 'GU31 4AA'; // Petersfield test postcode
    const metadata = this.createMetadata();
    
    try {
      const areaResult = await lookupAreaFromPostcode(testPostcode);
      
      if (!areaResult) {
        return {
          councilId: this.councilId,
          status: HealthStatus.DEGRADED,
          lastFailureAt: new Date().toISOString(),
          lastFailureCategory: FailureCategory.NOT_FOUND,
          lastFailureMessage: 'Area lookup failed for test postcode',
          successRate24h: 0.5,
          avgResponseTimeMs24h: 0,
          acquisitionCount24h: 1,
          checkedAt: new Date().toISOString(),
          upstreamReachable: true,
          schemaDriftDetected: false,
        };
      }
      
      return {
        councilId: this.councilId,
        status: HealthStatus.HEALTHY,
        lastSuccessAt: new Date().toISOString(),
        successRate24h: 1.0,
        avgResponseTimeMs24h: metadata.durationMs || 0,
        acquisitionCount24h: 1,
        checkedAt: new Date().toISOString(),
        upstreamReachable: true,
        schemaDriftDetected: false,
      };
    } catch (error) {
      return {
        councilId: this.councilId,
        status: HealthStatus.UNHEALTHY,
        lastFailureAt: new Date().toISOString(),
        lastFailureCategory: FailureCategory.UNKNOWN,
        lastFailureMessage: error instanceof Error ? error.message : 'Unknown error',
        successRate24h: 0.0,
        avgResponseTimeMs24h: 0,
        acquisitionCount24h: 0,
        checkedAt: new Date().toISOString(),
        upstreamReachable: false,
        schemaDriftDetected: false,
      };
    }
  }
  
  async securityProfile(): Promise<AdapterSecurityProfile> {
    return {
      councilId: this.councilId,
      riskLevel: ExecutionRiskLevel.MEDIUM,
      requiresBrowserAutomation: false,
      executesJavaScript: false,
      externalDomains: ['easthants.gov.uk', 'www.easthants.gov.uk'],
      handlesCredentials: false,
      securityConcerns: [
        'PDF parsing — uses pdf-parse library (no code execution)',
        'PDF size limited to 5MB',
        'Content-type validation before parsing',
        'Domain allowlisting enforced',
      ],
      lastSecurityReview: '2026-03-25',
      isSandboxed: true,
      networkIsolation: 'allowlist_only',
      requiredPermissions: ['network_egress_https'],
    };
  }
  
  /**
   * Fetch and parse PDF calendar for collection area.
   */
  private async fetchPdfSchedule(
    areaCode: string,
    postcode: string,
    metadata: AcquisitionMetadata
  ): Promise<EastHampshirePdfSchedule | null> {
    // Check kill switch
    if (process.env.ADAPTER_KILL_SWITCH_EAST_HAMPSHIRE === 'true') {
      throw new Error('Adapter disabled via kill switch');
    }
    
    // Get PDF URL for area
    const pdfUrl = getPdfUrlForArea(areaCode);
    if (!pdfUrl) {
      throw new Error(`No PDF URL configured for area: ${areaCode}`);
    }
    
    try {
      // Download PDF
      const pdf = await this.downloadPdf(pdfUrl);
      
      metadata.httpRequestCount = 1;
      metadata.bytesReceived = pdf.metadata.sizeBytes;
      
      // Validate PDF security
      this.validatePdfSecurity(pdf.buffer);
      
      // Parse PDF calendar
      const schedule = parsePdfCalendar(pdf, areaCode, postcode);
      
      return schedule;
    } catch (error) {
      console.error(`[East Hampshire] PDF fetch failed for area ${areaCode}:`, error);
      throw error;
    }
  }
  
  private createMetadata(): AcquisitionMetadata {
    return {
      attemptId: uuidv4(),
      adapterId: this.councilId,
      councilId: this.councilId,
      lookupMethod: LookupMethod.PDF_CALENDAR,
      startedAt: new Date().toISOString(),
      completedAt: '',
      durationMs: 0,
      httpRequestCount: 0,
      bytesReceived: 0,
      usedBrowserAutomation: false,
      adapterVersion: ADAPTER_VERSION,
      executionEnvironment: process.env.HOSTNAME || 'unknown',
      riskLevel: ExecutionRiskLevel.MEDIUM,
      cacheHit: false,
    };
  }
  
  private failureResult<T>(
    metadata: AcquisitionMetadata,
    category: FailureCategory,
    message: string
  ): BaseResult<T> {
    metadata.completedAt = new Date().toISOString();
    metadata.durationMs = Date.now() - new Date(metadata.startedAt).getTime();
    
    return {
      success: false,
      acquisitionMetadata: metadata,
      confidence: 0,
      warnings: [],
      securityWarnings: [],
      failureCategory: category,
      errorMessage: message,
      fromCache: false,
    };
  }
  
  private handleError<T>(metadata: AcquisitionMetadata, error: unknown): BaseResult<T> {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return this.failureResult(metadata, FailureCategory.ADAPTER_ERROR, message);
  }
}
