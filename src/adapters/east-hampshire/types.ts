/**
 * East Hampshire District Council - Types
 * 
 * Type definitions for PDF calendar-based collection schedule data.
 * East Hampshire uses downloadable PDF calendars organized by collection area.
 * 
 * @module adapters/east-hampshire/types
 */

/**
 * Area lookup result mapping postcode to collection area.
 */
export interface AreaLookupResult {
  /** Collection area code/number */
  areaCode: string;
  
  /** Area name/description */
  areaName?: string;
  
  /** Postcode or postcode prefix */
  postcode: string;
  
  /** Collection day (Monday, Tuesday, etc.) */
  collectionDay?: string;
  
  /** Round identifier */
  round?: string;
}

/**
 * PDF calendar metadata for a specific area.
 */
export interface PdfCalendarInfo {
  /** Collection area code */
  areaCode: string;
  
  /** PDF download URL */
  url: string;
  
  /** Calendar validity period start */
  validFrom?: string;
  
  /** Calendar validity period end */
  validTo?: string;
  
  /** Collection day */
  collectionDay?: string;
}

/**
 * Parsed collection schedule from PDF.
 */
export interface EastHampshirePdfSchedule {
  /** Collection area code */
  areaCode: string;
  
  /** Postcode */
  postcode: string;
  
  /** Collection events extracted from PDF */
  collections: PdfCollection[];
  
  /** PDF metadata */
  pdfMetadata: {
    /** PDF URL */
    url: string;
    
    /** Content hash (for change detection) */
    hash: string;
    
    /** Downloaded at timestamp */
    downloadedAt: string;
    
    /** PDF validity period */
    validPeriod?: {
      from: string;
      to: string;
    };
  };
  
  /** Warnings from parsing */
  warnings: string[];
}

/**
 * Individual collection event from PDF.
 */
export interface PdfCollection {
  /** Collection date (ISO 8601) */
  date: string;
  
  /** Service type (inferred from PDF context) */
  serviceType: string;
  
  /** Service name from PDF */
  serviceName?: string;
  
  /** Confidence in extraction (0-1) */
  confidence: number;
  
  /** Source text from PDF */
  sourceText?: string;
}
