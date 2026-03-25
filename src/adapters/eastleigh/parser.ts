/**
 * Eastleigh Borough Council - Response Parser
 * 
 * Parses untrusted upstream responses into normalised collection events.
 * All input is treated as untrusted and validated.
 * 
 * @module adapters/eastleigh/parser
 */

import {
  ServiceType,
  CollectionEvent,
  CollectionService,
  AddressCandidate,
} from '../base/adapter.interface.js';
import type {
  EastleighRawResponse,
  EastleighCollection,
  UprnValidation,
} from './types.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Validate and normalise UPRN input.
 * UPRNs are numeric identifiers, typically 12 digits but can vary.
 */
export function validateUprn(uprn: string | number): UprnValidation {
  const uprnStr = String(uprn).trim();
  
  // Basic validation: numeric, 1-12 digits
  if (!/^\d{1,12}$/.test(uprnStr)) {
    return {
      valid: false,
      error: 'UPRN must be numeric and 1-12 digits',
    };
  }
  
  const uprnNum = parseInt(uprnStr, 10);
  if (uprnNum < 1 || uprnNum > 999999999999) {
    return {
      valid: false,
      error: 'UPRN out of valid range',
    };
  }
  
  return {
    valid: true,
    normalized: uprnStr,
  };
}

/**
 * Map Eastleigh service names to canonical ServiceType enum.
 * Case-insensitive matching with fallback to OTHER.
 */
export function mapServiceType(rawType: string | undefined): ServiceType {
  if (!rawType) return ServiceType.OTHER;
  
  const normalized = rawType.toLowerCase().trim();
  
  // Refuse/Rubbish patterns
  if (normalized.includes('refuse') || 
      normalized.includes('rubbish') ||
      normalized.includes('general waste') ||
      normalized.includes('black bin')) {
    return ServiceType.GENERAL_WASTE;
  }
  
  // Recycling patterns
  if (normalized.includes('recycl') ||
      normalized.includes('blue bin') ||
      normalized.includes('mixed recycl')) {
    return ServiceType.RECYCLING;
  }
  
  // Garden waste patterns
  if (normalized.includes('garden') ||
      normalized.includes('green waste') ||
      normalized.includes('brown bin')) {
    return ServiceType.GARDEN_WASTE;
  }
  
  // Food waste patterns
  if (normalized.includes('food') ||
      normalized.includes('caddy')) {
    return ServiceType.FOOD_WASTE;
  }
  
  // Glass patterns
  if (normalized.includes('glass')) {
    return ServiceType.GLASS;
  }
  
  return ServiceType.OTHER;
}

/**
 * Parse date from various possible formats returned by Eastleigh.
 * Returns ISO 8601 date string (YYYY-MM-DD) or null if invalid.
 */
export function parseCollectionDate(rawDate: string | undefined): string | null {
  if (!rawDate) return null;
  
  const cleaned = rawDate.trim();
  
  // Try ISO format first (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    const date = new Date(cleaned);
    if (!isNaN(date.getTime())) {
      return cleaned;
    }
  }
  
  // Try DD/MM/YYYY format (common UK format)
  const ukMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ukMatch) {
    const [, day, month, year] = ukMatch;
    const date = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  }
  
  // Try MM/DD/YYYY format (less common but possible)
  const usMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    const [, month, day, year] = usMatch;
    const date = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  }
  
  // Try parsing as timestamp
  const timestamp = Date.parse(cleaned);
  if (!isNaN(timestamp)) {
    return new Date(timestamp).toISOString().split('T')[0];
  }
  
  return null;
}

/**
 * Parse raw Eastleigh collection into normalised CollectionEvent.
 */
export function parseCollectionEvent(
  raw: EastleighCollection,
  index: number
): CollectionEvent | null {
  // Extract service type from any available field
  const rawServiceType = raw.service || raw.serviceType || raw.binType || raw.type;
  const serviceType = mapServiceType(rawServiceType);
  
  // Extract date from any available field
  const rawDate = raw.collectionDate || raw.date || raw.nextCollection;
  const collectionDate = parseCollectionDate(rawDate);
  
  if (!collectionDate) {
    // No valid date — cannot create event
    return null;
  }
  
  // Check if event is in the past
  const today = new Date().toISOString().split('T')[0];
  const isPast = collectionDate < today;
  
  return {
    eventId: `eastleigh-${collectionDate}-${serviceType}-${index}`,
    serviceId: `eastleigh-${serviceType}`,
    serviceType,
    collectionDate,
    timeWindowStart: undefined,
    timeWindowEnd: undefined,
    isConfirmed: true,
    isRescheduled: raw.rescheduled || false,
    originalDate: raw.originalDate,
    rescheduleReason: raw.rescheduleReason,
    isPast,
    notes: raw.notes || raw.message,
  };
}

/**
 * Parse raw Eastleigh response into array of CollectionEvents.
 * Handles multiple possible response structures gracefully.
 */
export function parseCollectionEvents(
  response: EastleighRawResponse
): CollectionEvent[] {
  const events: CollectionEvent[] = [];
  
  // Try different possible collection array fields
  const collections = 
    response.collections || 
    response.collectionSchedule || 
    response.schedule || 
    response.bins;
  
  if (!collections || !Array.isArray(collections)) {
    return events;
  }
  
  collections.forEach((raw, index) => {
    const event = parseCollectionEvent(raw, index);
    if (event) {
      events.push(event);
    }
  });
  
  return events;
}

/**
 * Parse Eastleigh response into CollectionServices.
 * Services are derived from unique service types in the schedule.
 */
export function parseCollectionServices(
  response: EastleighRawResponse
): CollectionService[] {
  const events = parseCollectionEvents(response);
  const serviceMap = new Map<ServiceType, CollectionService>();
  
  events.forEach((event) => {
    if (!serviceMap.has(event.serviceType)) {
      const collections = response.collections || response.collectionSchedule || [];
      const rawCollection = collections.find(c => 
        mapServiceType(c.service || c.serviceType || c.binType || c.type) === event.serviceType
      );
      
      serviceMap.set(event.serviceType, {
        serviceId: event.serviceId,
        serviceType: event.serviceType,
        serviceNameRaw: rawCollection?.service || rawCollection?.serviceType || event.serviceType,
        serviceNameDisplay: formatServiceName(event.serviceType),
        frequency: rawCollection?.frequency,
        containerType: rawCollection?.containerType,
        containerColour: rawCollection?.containerColour || rawCollection?.binColour,
        isActive: rawCollection?.active ?? rawCollection?.isActive ?? true,
        requiresSubscription: event.serviceType === ServiceType.GARDEN_WASTE,
        notes: rawCollection?.notes,
      });
    }
  });
  
  return Array.from(serviceMap.values());
}

/**
 * Format service type as display-friendly name.
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
 * Sanitise string values from upstream to prevent injection attacks.
 */
export function sanitiseString(value: unknown): string {
  if (typeof value !== 'string') {
    return String(value || '');
  }
  
  return value
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .substring(0, 500); // Limit length
}

/**
 * Calculate confidence score based on data completeness.
 */
export function calculateConfidence(response: EastleighRawResponse): number {
  let score = 0.5; // Base score
  
  // Has UPRN
  if (response.uprn) score += 0.1;
  
  // Has address
  if (response.address) score += 0.1;
  
  // Has collections
  const collections = response.collections || response.collectionSchedule || response.schedule;
  if (collections && Array.isArray(collections)) {
    score += 0.2;
    
    // Has multiple collections
    if (collections.length > 1) score += 0.1;
    
    // Collections have dates
    const withDates = collections.filter(c => 
      c.collectionDate || c.date || c.nextCollection
    ).length;
    if (withDates > 0) {
      score += (withDates / collections.length) * 0.1;
    }
  }
  
  return Math.min(score, 1.0);
}
