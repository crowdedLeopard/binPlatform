/**
 * East Hampshire District Council - PDF Parser
 * 
 * Parses PDF calendar files to extract collection dates and service types.
 * Handles 13-month calendar PDFs with multiple service types.
 * 
 * @module adapters/east-hampshire/parser
 */

import {
  ServiceType,
  CollectionEvent,
  CollectionService,
} from '../base/adapter.interface.js';
import type { EastHampshirePdfSchedule, PdfCollection } from './types.js';
import type { DownloadedPdf } from '../base/pdf-calendar-adapter.js';

/**
 * Parse PDF calendar into collection schedule.
 */
export function parsePdfCalendar(
  pdf: DownloadedPdf,
  areaCode: string,
  postcode: string
): EastHampshirePdfSchedule {
  const warnings: string[] = [];
  const collections: PdfCollection[] = [];
  
  // Extract all dates from PDF text
  const dates = extractDatesFromText(pdf.text);
  
  if (dates.length === 0) {
    warnings.push('No collection dates found in PDF');
  }
  
  // For each date, infer service type from surrounding context
  for (const date of dates) {
    const position = pdf.text.indexOf(date);
    if (position < 0) continue;
    
    const serviceType = inferServiceTypeFromContext(pdf.text, position);
    const sourceText = pdf.text.substring(
      Math.max(0, position - 50),
      Math.min(pdf.text.length, position + 50)
    );
    
    collections.push({
      date,
      serviceType: serviceType as string,
      confidence: 0.75, // PDF parsing is inherently less certain than API data
      sourceText,
    });
  }
  
  return {
    areaCode,
    postcode,
    collections,
    pdfMetadata: {
      url: pdf.url,
      hash: pdf.metadata.contentHash,
      downloadedAt: pdf.downloadedAt,
    },
    warnings,
  };
}

/**
 * Extract dates from PDF text.
 * Looks for common UK date formats.
 */
function extractDatesFromText(text: string): string[] {
  const dates: string[] = [];
  
  // Pattern 1: DD/MM/YYYY or DD-MM-YYYY
  const slashDates = text.matchAll(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/g);
  for (const match of slashDates) {
    const [, day, month, year] = match;
    const date = parseDate(`${day}/${month}/${year}`);
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
    const date = parseMonthDate(parseInt(day), month, parseInt(year));
    if (date) dates.push(date);
  }
  
  // Deduplicate and sort
  const uniqueDates = Array.from(new Set(dates));
  return uniqueDates.sort();
}

/**
 * Parse date to ISO 8601 format.
 */
function parseDate(dateStr: string): string | null {
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
function parseMonthDate(day: number, monthName: string, year: number): string | null {
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
 * Infer service type from PDF text context around a date.
 * PDF calendars typically have section headers like "Black Bin", "Recycling", etc.
 */
function inferServiceTypeFromContext(text: string, position: number): ServiceType {
  // Extract context (200 chars before and after)
  const contextStart = Math.max(0, position - 200);
  const contextEnd = Math.min(text.length, position + 200);
  const context = text.substring(contextStart, contextEnd).toLowerCase();
  
  // Check for service type keywords
  if (context.match(/\b(refuse|rubbish|general|waste|black|residual)\b/)) {
    return ServiceType.GENERAL_WASTE;
  }
  
  if (context.match(/\b(recycl|blue|green box|mixed|dry)\b/)) {
    return ServiceType.RECYCLING;
  }
  
  if (context.match(/\b(garden|green|brown)\b/)) {
    return ServiceType.GARDEN_WASTE;
  }
  
  if (context.match(/\b(food|caddy|kitchen)\b/)) {
    return ServiceType.FOOD_WASTE;
  }
  
  if (context.match(/\b(glass)\b/)) {
    return ServiceType.GLASS;
  }
  
  return ServiceType.OTHER;
}

/**
 * Parse PDF schedule into CollectionEvents.
 */
export function parseCollectionEvents(schedule: EastHampshirePdfSchedule): CollectionEvent[] {
  const events: CollectionEvent[] = [];
  const today = new Date().toISOString().split('T')[0];
  
  for (const collection of schedule.collections) {
    events.push({
      eventId: `east-hampshire-${collection.date}-${collection.serviceType}`,
      serviceId: `east-hampshire-${collection.serviceType}`,
      serviceType: collection.serviceType as ServiceType,
      collectionDate: collection.date,
      timeWindowStart: undefined,
      timeWindowEnd: undefined,
      isConfirmed: true,
      isRescheduled: false,
      isPast: collection.date < today,
      notes: collection.sourceText,
    });
  }
  
  return events;
}

/**
 * Parse PDF schedule into CollectionServices.
 */
export function parseCollectionServices(schedule: EastHampshirePdfSchedule): CollectionService[] {
  const serviceMap = new Map<ServiceType, CollectionService>();
  
  for (const collection of schedule.collections) {
    const serviceType = collection.serviceType as ServiceType;
    
    if (!serviceMap.has(serviceType)) {
      serviceMap.set(serviceType, {
        serviceId: `east-hampshire-${serviceType}`,
        serviceType,
        serviceNameRaw: collection.serviceName || serviceType,
        serviceNameDisplay: formatServiceName(serviceType),
        frequency: undefined, // Not available from PDF
        containerType: undefined,
        containerColour: undefined,
        isActive: true,
        requiresSubscription: serviceType === ServiceType.GARDEN_WASTE,
        notes: 'Extracted from PDF calendar',
      });
    }
  }
  
  return Array.from(serviceMap.values());
}

/**
 * Format service type as display name.
 */
function formatServiceName(serviceType: ServiceType): string {
  const mapping: Record<ServiceType, string> = {
    [ServiceType.GENERAL_WASTE]: 'General Waste',
    [ServiceType.RECYCLING]: 'Recycling',
    [ServiceType.GARDEN_WASTE]: 'Garden Waste',
    [ServiceType.FOOD_WASTE]: 'Food Waste',
    [ServiceType.GLASS]: 'Glass',
    [ServiceType.PAPER]: 'Paper',
    [ServiceType.PLASTIC]: 'Plastic',
    [ServiceType.TEXTILES]: 'Textiles',
    [ServiceType.BULKY_WASTE]: 'Bulky Waste',
    [ServiceType.CLINICAL_WASTE]: 'Clinical Waste',
    [ServiceType.HAZARDOUS_WASTE]: 'Hazardous Waste',
    [ServiceType.ELECTRICAL_WASTE]: 'Electrical Waste',
    [ServiceType.OTHER]: 'Other Waste',
  };
  
  return mapping[serviceType] || 'Unknown';
}

/**
 * Calculate confidence score based on PDF parsing completeness.
 */
export function calculateConfidence(schedule: EastHampshirePdfSchedule): number {
  let score = 0.5;
  
  if (schedule.collections.length > 0) {
    score += 0.2;
    
    // More collections = higher confidence
    if (schedule.collections.length > 5) score += 0.1;
    if (schedule.collections.length > 10) score += 0.1;
    
    // Service type diversity
    const uniqueTypes = new Set(schedule.collections.map(c => c.serviceType)).size;
    if (uniqueTypes > 1) score += 0.1;
  }
  
  if (schedule.warnings.length === 0) {
    score += 0.1;
  }
  
  return Math.min(score, 1.0);
}
