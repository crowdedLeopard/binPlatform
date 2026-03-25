/**
 * Portsmouth City Council - Response Parser
 * 
 * Parses untrusted upstream responses (Granicus portal or JSON API) into normalised events.
 * Portsmouth uses Granicus platform which may have session and cookie requirements.
 * 
 * @module adapters/portsmouth/parser
 */

import {
  ServiceType,
  CollectionEvent,
  CollectionService,
  AddressCandidate,
} from '../base/adapter.interface.js';
import type {
  PortsmouthRawResponse,
  PortsmouthCollection,
  PortsmouthAddress,
  PortsmouthHtmlData,
} from './types.js';

/**
 * Map Portsmouth service names to canonical ServiceType enum.
 */
export function mapServiceType(rawType: string | undefined): ServiceType {
  if (!rawType) return ServiceType.OTHER;
  
  const normalized = rawType.toLowerCase().trim();
  
  // General waste patterns
  if (normalized.includes('refuse') ||
      normalized.includes('rubbish') ||
      normalized.includes('general') ||
      normalized.includes('grey bin') ||
      normalized.includes('household') ||
      normalized.includes('waste') ||
      normalized.includes('residual')) {
    return ServiceType.GENERAL_WASTE;
  }
  
  // Recycling patterns
  if (normalized.includes('recycl') ||
      normalized.includes('blue bin') ||
      normalized.includes('mixed recycling') ||
      normalized.includes('commingled')) {
    return ServiceType.RECYCLING;
  }
  
  // Garden waste patterns
  if (normalized.includes('garden') ||
      normalized.includes('brown bin') ||
      normalized.includes('garden waste') ||
      normalized.includes('green bin') ||
      normalized.includes('green waste')) {
    return ServiceType.GARDEN_WASTE;
  }
  
  // Food waste patterns
  if (normalized.includes('food') ||
      normalized.includes('food waste') ||
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
 * Parse date from Portsmouth format.
 */
export function parseCollectionDate(rawDate: string | undefined): string | null {
  if (!rawDate) return null;
  
  const cleaned = rawDate.trim();
  
  // ISO format (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return cleaned;
  }
  
  // DD/MM/YYYY format
  const ukMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ukMatch) {
    const [, day, month, year] = ukMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  // DD-MM-YYYY format
  const dashMatch = cleaned.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashMatch) {
    const [, day, month, year] = dashMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  // Day name with date (e.g., "Monday 1st April 2024")
  const dayNameMatch = cleaned.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)(?:\s+(\d{4}))?/i);
  if (dayNameMatch) {
    const [, day, monthName, year] = dayNameMatch;
    const month = parseMonthName(monthName);
    if (month !== null) {
      const currentYear = new Date().getFullYear();
      const fullYear = year || currentYear;
      return `${fullYear}-${String(month).padStart(2, '0')}-${day.padStart(2, '0')}`;
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
 * Parse month name to number (1-12).
 */
function parseMonthName(monthName: string): number | null {
  const months: Record<string, number> = {
    january: 1, jan: 1,
    february: 2, feb: 2,
    march: 3, mar: 3,
    april: 4, apr: 4,
    may: 5,
    june: 6, jun: 6,
    july: 7, jul: 7,
    august: 8, aug: 8,
    september: 9, sep: 9, sept: 9,
    october: 10, oct: 10,
    november: 11, nov: 11,
    december: 12, dec: 12,
  };
  
  return months[monthName.toLowerCase()] || null;
}

/**
 * Parse individual Portsmouth collection into CollectionEvent.
 */
export function parseCollectionEvent(
  raw: PortsmouthCollection,
  index: number
): CollectionEvent | null {
  const rawServiceType = raw.service || raw.binType || raw.type || raw.wasteType;
  const serviceType = mapServiceType(rawServiceType);
  
  const rawDate = raw.collectionDate || raw.nextCollection || raw.date;
  const collectionDate = parseCollectionDate(rawDate);
  
  if (!collectionDate) {
    return null;
  }
  
  const today = new Date().toISOString().split('T')[0];
  const isPast = collectionDate < today;
  
  const isRescheduled = raw.isRescheduled || raw.rescheduled || false;
  const originalDate = raw.originalDate ? parseCollectionDate(raw.originalDate) : undefined;
  
  return {
    eventId: `portsmouth-${collectionDate}-${serviceType}-${index}`,
    serviceId: `portsmouth-${serviceType}`,
    serviceType,
    collectionDate,
    timeWindowStart: undefined,
    timeWindowEnd: undefined,
    isConfirmed: true,
    isRescheduled,
    originalDate,
    isPast,
    notes: raw.notes || raw.message,
  };
}

/**
 * Parse Portsmouth response into collection events.
 */
export function parseCollectionEvents(
  response: PortsmouthRawResponse | PortsmouthHtmlData
): CollectionEvent[] {
  const events: CollectionEvent[] = [];
  
  const collections = 
    'collections' in response ? response.collections :
    'schedule' in response ? response.schedule :
    'bins' in response ? response.bins :
    [];
  
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
 * Parse collection services from response.
 */
export function parseCollectionServices(
  response: PortsmouthRawResponse | PortsmouthHtmlData
): CollectionService[] {
  const events = parseCollectionEvents(response);
  const serviceMap = new Map<ServiceType, CollectionService>();
  
  events.forEach((event) => {
    if (!serviceMap.has(event.serviceType)) {
      const collections = 
        'collections' in response ? response.collections :
        'schedule' in response ? response.schedule :
        'bins' in response ? response.bins :
        [];
      
      const rawCollection = collections?.find(c => 
        mapServiceType(c.service || c.binType || c.type || c.wasteType) === event.serviceType
      );
      
      serviceMap.set(event.serviceType, {
        serviceId: event.serviceId,
        serviceType: event.serviceType,
        serviceNameRaw: rawCollection?.service || rawCollection?.binType || event.serviceType,
        serviceNameDisplay: formatServiceName(event.serviceType),
        frequency: rawCollection?.frequency,
        containerType: rawCollection?.containerType,
        containerColour: rawCollection?.containerColour || rawCollection?.binColour || rawCollection?.colour,
        isActive: true,
        requiresSubscription: event.serviceType === ServiceType.GARDEN_WASTE,
        notes: rawCollection?.notes,
      });
    }
  });
  
  return Array.from(serviceMap.values());
}

/**
 * Format service type as display name.
 */
function formatServiceName(serviceType: ServiceType): string {
  const mapping: Record<ServiceType, string> = {
    [ServiceType.GENERAL_WASTE]: 'General Waste',
    [ServiceType.RECYCLING]: 'Recycling',
    [ServiceType.GLASS]: 'Glass',
    [ServiceType.FOOD_WASTE]: 'Food Waste',
    [ServiceType.GARDEN_WASTE]: 'Garden Waste',
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
 * Parse address candidates from Portsmouth address lookup.
 */
export function parseAddressCandidates(
  addresses: PortsmouthAddress[],
  postcode: string
): AddressCandidate[] {
  return addresses.map((addr) => {
    const addressRaw = addr.address || addr.addressLine || addr.fullAddress || '';
    const addressNormalised = addressRaw.toLowerCase().trim();
    
    return {
      councilLocalId: addr.propertyId || addr.id || String(addr.uprn || ''),
      uprn: addr.uprn ? String(addr.uprn) : undefined,
      addressRaw,
      addressNormalised,
      addressDisplay: addressRaw,
      postcode: addr.postcode || postcode,
      confidence: 1.0,
    };
  });
}

/**
 * Validate Portsmouth postcode format.
 * Portsmouth serves postcodes: PO1-PO6
 */
export function validatePostcode(postcode: string): { valid: boolean; normalized?: string; error?: string } {
  const cleaned = postcode.trim().toUpperCase().replace(/\s+/g, '');
  
  // UK postcode regex
  const postcodeRegex = /^[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}$/i;
  
  if (!postcodeRegex.test(postcode)) {
    return {
      valid: false,
      error: 'Invalid UK postcode format',
    };
  }
  
  // Normalize with space
  const normalized = cleaned.replace(/^([A-Z]{1,2}\d{1,2}[A-Z]?)(\d[A-Z]{2})$/, '$1 $2');
  
  // Validate Portsmouth postcodes (PO1-PO6)
  const portsmouthPrefixes = ['PO1', 'PO2', 'PO3', 'PO4', 'PO5', 'PO6'];
  const prefix = normalized.substring(0, 3);
  
  if (!portsmouthPrefixes.includes(prefix)) {
    return {
      valid: false,
      error: `Postcode ${normalized} is not in Portsmouth area (PO1-PO6)`,
    };
  }
  
  return {
    valid: true,
    normalized,
  };
}

/**
 * Calculate confidence score based on data completeness.
 */
export function calculateConfidence(
  response: PortsmouthRawResponse | PortsmouthHtmlData
): number {
  let score = 0.5;
  
  if ('address' in response && response.address) score += 0.1;
  if ('postcode' in response && response.postcode) score += 0.1;
  if ('uprn' in response && response.uprn) score += 0.1;
  
  const collections = 
    'collections' in response ? response.collections :
    'schedule' in response ? response.schedule :
    'bins' in response ? response.bins :
    [];
  
  if (collections && Array.isArray(collections)) {
    score += 0.1;
    if (collections.length > 1) score += 0.1;
  }
  
  return Math.min(score, 1.0);
}
