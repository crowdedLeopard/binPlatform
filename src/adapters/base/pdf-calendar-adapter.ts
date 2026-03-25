/**
 * PDF Calendar Base Adapter
 * 
 * Shared base adapter for councils using downloadable PDF calendars.
 * Provides PDF download, validation, and text extraction utilities.
 * 
 * Used by councils that publish collection schedules as PDF calendars
 * organized by area/round (e.g., East Hampshire, Gosport, Havant).
 * 
 * @module adapters/base/pdf-calendar-adapter
 */

import pdf from 'pdf-parse';
import type { ServiceType } from './adapter.interface.js';
import { FailureCategory } from './adapter.interface.js';
import crypto from 'crypto';

/**
 * PDF download configuration.
 */
export interface PdfDownloadConfig {
  /** Maximum PDF size in bytes (default: 5MB) */
  maxSizeBytes: number;
  
  /** Request timeout in milliseconds */
  timeout: number;
  
  /** Allowed domains for PDF downloads */
  allowedDomains: string[];
  
  /** User agent for requests */
  userAgent: string;
}

/**
 * PDF metadata extracted from download.
 */
export interface PdfMetadata {
  /** SHA-256 hash of PDF content */
  contentHash: string;
  
  /** File size in bytes */
  sizeBytes: number;
  
  /** Number of pages */
  pageCount: number;
  
  /** PDF metadata fields */
  info?: {
    title?: string;
    author?: string;
    creator?: string;
    producer?: string;
    creationDate?: string;
    modificationDate?: string;
  };
}

/**
 * Downloaded PDF with extracted content.
 */
export interface DownloadedPdf {
  /** Raw PDF buffer */
  buffer: Buffer;
  
  /** Extracted text content */
  text: string;
  
  /** PDF metadata */
  metadata: PdfMetadata;
  
  /** Download URL */
  url: string;
  
  /** Download timestamp */
  downloadedAt: string;
}

/**
 * Parsed collection date from PDF calendar.
 */
export interface PdfCollectionDate {
  /** Collection date (ISO 8601) */
  date: string;
  
  /** Service type (inferred from context) */
  serviceType: ServiceType;
  
  /** Confidence in extraction (0-1) */
  confidence: number;
  
  /** Source text that yielded this date */
  sourceText?: string;
}

const DEFAULT_CONFIG: PdfDownloadConfig = {
  maxSizeBytes: 5 * 1024 * 1024, // 5MB
  timeout: 30000,
  allowedDomains: [],
  userAgent: 'HampshireBinData/1.0 (PDF Calendar Fetcher)',
};

/**
 * Base class for PDF calendar adapters.
 * Provides secure PDF download and text extraction.
 */
export abstract class PdfCalendarBaseAdapter {
  protected config: PdfDownloadConfig;
  
  constructor(config: Partial<PdfDownloadConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * Download and parse PDF from URL.
   * Validates URL domain, content-type, and size before parsing.
   */
  protected async downloadPdf(url: string): Promise<DownloadedPdf> {
    // Validate URL is in allowed domains
    const urlObj = new URL(url);
    const isAllowed = this.config.allowedDomains.some(domain => 
      urlObj.hostname.endsWith(domain)
    );
    
    if (!isAllowed) {
      throw new Error(`PDF download blocked: ${urlObj.hostname} not in allowed domains`);
    }
    
    // Download with timeout and size limit
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout);
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': this.config.userAgent,
          'Accept': 'application/pdf',
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeout);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      // Validate content-type
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/pdf')) {
        throw new Error(`Invalid content-type: ${contentType} (expected application/pdf)`);
      }
      
      // Check content-length before downloading
      const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
      if (contentLength > this.config.maxSizeBytes) {
        throw new Error(`PDF too large: ${contentLength} bytes (max: ${this.config.maxSizeBytes})`);
      }
      
      // Download PDF buffer
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      // Verify size after download
      if (buffer.length > this.config.maxSizeBytes) {
        throw new Error(`PDF too large: ${buffer.length} bytes (max: ${this.config.maxSizeBytes})`);
      }
      
      // Parse PDF to extract text
      const pdfData = await pdf(buffer);
      
      // Calculate content hash
      const hash = crypto.createHash('sha256');
      hash.update(buffer);
      const contentHash = hash.digest('hex');
      
      return {
        buffer,
        text: pdfData.text,
        metadata: {
          contentHash,
          sizeBytes: buffer.length,
          pageCount: pdfData.numpages,
          info: pdfData.info,
        },
        url,
        downloadedAt: new Date().toISOString(),
      };
    } catch (error) {
      clearTimeout(timeout);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`PDF download timeout after ${this.config.timeout}ms`);
      }
      
      throw error;
    }
  }
  
  /**
   * Extract dates from PDF text using common patterns.
   * Looks for date formats commonly found in UK council calendars.
   */
  protected extractDatesFromText(text: string): string[] {
    const dates: string[] = [];
    
    // Pattern 1: DD/MM/YYYY or DD-MM-YYYY
    const slashDates = text.matchAll(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/g);
    for (const match of slashDates) {
      const [, day, month, year] = match;
      const date = this.parseDate(`${day}/${month}/${year}`);
      if (date) dates.push(date);
    }
    
    // Pattern 2: DD Month YYYY (e.g., "15 January 2026")
    const monthNames = 'January|February|March|April|May|June|July|August|September|October|November|December';
    const shortMonths = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec';
    const monthPattern = new RegExp(
      `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthNames}|${shortMonths})\\.?\\s+(\\d{4})\\b`,
      'gi'
    );
    
    const monthDates = text.matchAll(monthPattern);
    for (const match of monthDates) {
      const [, day, month, year] = match;
      const date = this.parseMonthDate(parseInt(day), month, parseInt(year));
      if (date) dates.push(date);
    }
    
    // Pattern 3: ISO format (YYYY-MM-DD) - less common but possible
    const isoDates = text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g);
    for (const match of isoDates) {
      const [, year, month, day] = match;
      const date = this.parseDate(`${day}/${month}/${year}`);
      if (date) dates.push(date);
    }
    
    // Deduplicate and sort
    const uniqueDates = Array.from(new Set(dates));
    return uniqueDates.sort();
  }
  
  /**
   * Parse date string to ISO 8601 format.
   */
  protected parseDate(dateStr: string): string | null {
    // Try DD/MM/YYYY format
    const match = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (match) {
      const [, day, month, year] = match;
      const date = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    }
    
    return null;
  }
  
  /**
   * Parse month name to date.
   */
  protected parseMonthDate(day: number, monthName: string, year: number): string | null {
    const monthMap: Record<string, number> = {
      'january': 1, 'jan': 1,
      'february': 2, 'feb': 2,
      'march': 3, 'mar': 3,
      'april': 4, 'apr': 4,
      'may': 5,
      'june': 6, 'jun': 6,
      'july': 7, 'jul': 7,
      'august': 8, 'aug': 8,
      'september': 9, 'sep': 9, 'sept': 9,
      'october': 10, 'oct': 10,
      'november': 11, 'nov': 11,
      'december': 12, 'dec': 12,
    };
    
    const month = monthMap[monthName.toLowerCase()];
    if (!month) return null;
    
    const date = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
    
    return null;
  }
  
  /**
   * Infer service type from surrounding text context.
   * PDF calendars often have headers like "Black Bin", "Recycling", etc.
   */
  protected inferServiceTypeFromContext(
    text: string,
    datePosition: number
  ): ServiceType {
    // Extract 200 characters before and after the date for context
    const contextStart = Math.max(0, datePosition - 200);
    const contextEnd = Math.min(text.length, datePosition + 200);
    const context = text.substring(contextStart, contextEnd).toLowerCase();
    
    // Check for service type keywords in context
    if (context.match(/\b(refuse|rubbish|general|waste|black|residual)\b/)) {
      return 'general_waste' as ServiceType;
    }
    
    if (context.match(/\b(recycl|blue|green box|mixed|dry)\b/)) {
      return 'recycling' as ServiceType;
    }
    
    if (context.match(/\b(garden|green|brown|organic)\b/)) {
      return 'garden_waste' as ServiceType;
    }
    
    if (context.match(/\b(food|caddy|kitchen)\b/)) {
      return 'food_waste' as ServiceType;
    }
    
    if (context.match(/\b(glass)\b/)) {
      return 'glass' as ServiceType;
    }
    
    return 'other' as ServiceType;
  }
  
  /**
   * Extract collection dates with service type inference.
   */
  protected extractCollectionDates(pdf: DownloadedPdf): PdfCollectionDate[] {
    const dates = this.extractDatesFromText(pdf.text);
    const collections: PdfCollectionDate[] = [];
    
    for (const date of dates) {
      // Find position in text to get context
      const position = pdf.text.indexOf(date);
      const serviceType = position >= 0 
        ? this.inferServiceTypeFromContext(pdf.text, position)
        : 'other' as ServiceType;
      
      collections.push({
        date,
        serviceType,
        confidence: 0.75, // PDF parsing is less certain than API data
        sourceText: position >= 0 
          ? pdf.text.substring(Math.max(0, position - 50), position + 50)
          : undefined,
      });
    }
    
    return collections;
  }
  
  /**
   * Validate PDF is not malicious.
   * Basic checks for JavaScript, embedded files, etc.
   */
  protected validatePdfSecurity(buffer: Buffer): void {
    const bufferStr = buffer.toString('utf-8', 0, Math.min(buffer.length, 10000));
    
    // Check for JavaScript (warning only, pdf-parse doesn't execute)
    if (bufferStr.includes('/JavaScript') || bufferStr.includes('/JS')) {
      console.warn('[PDF Security] PDF contains JavaScript (not executed by parser)');
    }
    
    // Check for embedded files
    if (bufferStr.includes('/EmbeddedFile')) {
      console.warn('[PDF Security] PDF contains embedded files');
    }
  }
}
