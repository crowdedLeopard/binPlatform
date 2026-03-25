/**
 * Hampshire Bin Collection Data Platform
 * Adapter Response Sanitisation
 * 
 * Sanitises all output from adapters before returning to callers.
 * Prevents XSS, injection attacks, and data leakage.
 * 
 * ALL adapters must use this sanitisation layer.
 * 
 * @module adapters/base/sanitise
 */

import type {
  CollectionEvent,
  CollectionService,
  AddressCandidate,
  ServiceType,
} from './adapter.interface.js';

// Maximum field lengths to prevent DoS
const MAX_TITLE_LENGTH = 200;
const MAX_NOTES_LENGTH = 500;
const MAX_ADDRESS_LENGTH = 300;
const MAX_SERVICE_NAME_LENGTH = 150;

// Canonical service types (any other values are rejected)
const VALID_SERVICE_TYPES: Set<string> = new Set([
  'general_waste',
  'recycling',
  'garden_waste',
  'food_waste',
  'glass',
  'paper',
  'plastic',
  'textiles',
  'bulky_waste',
  'clinical_waste',
  'hazardous_waste',
  'electrical_waste',
  'other',
]);

/**
 * Strip HTML tags from string to prevent XSS
 * Also removes dangerous keywords that might remain after tag removal
 */
function stripHtml(text: string): string {
  // Remove all HTML tags
  let stripped = text.replace(/<[^>]*>/g, '');
  
  // Strip dangerous keywords that might appear in tag content
  // (e.g., <script>alert</script> becomes "alert" which is still dangerous)
  const dangerousKeywords = [
    /\balert\s*\(/gi,
    /\beval\s*\(/gi,
    /\bprompt\s*\(/gi,
    /\bconfirm\s*\(/gi,
    /document\s*\.\s*cookie/gi,
    /document\s*\.\s*write/gi,
    /window\s*\.\s*location/gi,
    /javascript\s*:/gi,
  ];
  
  for (const pattern of dangerousKeywords) {
    stripped = stripped.replace(pattern, '');
  }
  
  // Decode common HTML entities
  stripped = stripped
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
  
  return stripped;
}

/**
 * Normalise whitespace (collapse multiple spaces, trim)
 */
function normaliseWhitespace(text: string): string {
  return text
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .replace(/\r\n/g, '\n') // Normalise line endings
    .trim();
}

/**
 * Truncate string to maximum length
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Sanitise a generic string field
 */
function sanitiseString(
  text: string | undefined,
  maxLength: number
): string | undefined {
  if (!text) return undefined;
  
  // Strip HTML
  let sanitised = stripHtml(text);
  
  // Normalise whitespace
  sanitised = normaliseWhitespace(sanitised);
  
  // Truncate
  sanitised = truncate(sanitised, maxLength);
  
  return sanitised;
}

/**
 * Validate and sanitise ISO 8601 date string
 */
function sanitiseDate(date: string | undefined): string | undefined {
  if (!date) return undefined;
  
  // Validate ISO 8601 format (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  
  if (!dateRegex.test(date)) {
    console.warn('Invalid date format, expected YYYY-MM-DD', { date });
    return undefined;
  }
  
  // Validate date is valid
  const parsed = new Date(date);
  if (isNaN(parsed.getTime())) {
    console.warn('Invalid date value', { date });
    return undefined;
  }
  
  return date;
}

/**
 * Validate and sanitise ISO 8601 datetime string
 */
function sanitiseDateTime(dateTime: string | undefined): string | undefined {
  if (!dateTime) return undefined;
  
  // Validate ISO 8601 format
  const parsed = new Date(dateTime);
  if (isNaN(parsed.getTime())) {
    console.warn('Invalid datetime value', { dateTime });
    return undefined;
  }
  
  // Return in canonical ISO format
  return parsed.toISOString();
}

/**
 * Validate and sanitise time string (HH:MM)
 */
function sanitiseTime(time: string | undefined): string | undefined {
  if (!time) return undefined;
  
  // Validate HH:MM format
  const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
  
  if (!timeRegex.test(time)) {
    console.warn('Invalid time format, expected HH:MM', { time });
    return undefined;
  }
  
  return time;
}

/**
 * Validate service type is in canonical enum
 */
function validateServiceType(serviceType: string): ServiceType | undefined {
  if (!VALID_SERVICE_TYPES.has(serviceType)) {
    console.warn('Invalid service type, not in canonical enum', { serviceType });
    return undefined;
  }
  
  return serviceType as ServiceType;
}

/**
 * Sanitise collection event result
 * 
 * Validates all fields and strips dangerous content.
 * Returns sanitised event or undefined if critical fields are invalid.
 */
export function sanitiseCollectionEvent(
  event: CollectionEvent
): CollectionEvent | undefined {
  // Validate required fields
  if (!event.eventId || !event.serviceId || !event.collectionDate) {
    console.warn('Collection event missing required fields', {
      hasEventId: !!event.eventId,
      hasServiceId: !!event.serviceId,
      hasCollectionDate: !!event.collectionDate,
    });
    return undefined;
  }
  
  // Validate service type
  const serviceType = validateServiceType(event.serviceType);
  if (!serviceType) {
    return undefined;
  }
  
  // Sanitise date fields
  const collectionDate = sanitiseDate(event.collectionDate);
  if (!collectionDate) {
    return undefined;
  }
  
  const originalDate = sanitiseDate(event.originalDate);
  
  // Sanitise time fields
  const timeWindowStart = sanitiseTime(event.timeWindowStart);
  const timeWindowEnd = sanitiseTime(event.timeWindowEnd);
  
  // Sanitise string fields
  const notes = sanitiseString(event.notes, MAX_NOTES_LENGTH);
  const rescheduleReason = sanitiseString(event.rescheduleReason, MAX_NOTES_LENGTH);
  
  // Validate collection date is not too far in future (max 365 days)
  const collectionDateObj = new Date(collectionDate);
  const maxFutureDate = new Date();
  maxFutureDate.setDate(maxFutureDate.getDate() + 365);
  
  if (collectionDateObj > maxFutureDate) {
    console.warn('Collection date more than 365 days in future (implausible)', {
      collectionDate,
    });
    return undefined;
  }
  
  return {
    eventId: event.eventId.substring(0, 100), // Limit ID length
    serviceId: event.serviceId.substring(0, 100),
    serviceType,
    collectionDate,
    timeWindowStart,
    timeWindowEnd,
    isConfirmed: !!event.isConfirmed,
    isRescheduled: !!event.isRescheduled,
    originalDate,
    rescheduleReason,
    isPast: !!event.isPast,
    notes,
  };
}

/**
 * Sanitise collection service result
 * 
 * Validates all fields and strips dangerous content.
 */
export function sanitiseCollectionService(
  service: CollectionService
): CollectionService | undefined {
  // Validate required fields
  if (!service.serviceId || !service.serviceType) {
    console.warn('Collection service missing required fields', {
      hasServiceId: !!service.serviceId,
      hasServiceType: !!service.serviceType,
    });
    return undefined;
  }
  
  // Validate service type
  const serviceType = validateServiceType(service.serviceType);
  if (!serviceType) {
    return undefined;
  }
  
  // Sanitise string fields
  const serviceNameRaw = sanitiseString(service.serviceNameRaw, MAX_SERVICE_NAME_LENGTH);
  const serviceNameDisplay = sanitiseString(service.serviceNameDisplay, MAX_SERVICE_NAME_LENGTH);
  const frequency = sanitiseString(service.frequency, 100);
  const containerType = sanitiseString(service.containerType, 100);
  const containerColour = sanitiseString(service.containerColour, 50);
  const notes = sanitiseString(service.notes, MAX_NOTES_LENGTH);
  
  if (!serviceNameRaw || !serviceNameDisplay) {
    console.warn('Collection service missing service names');
    return undefined;
  }
  
  return {
    serviceId: service.serviceId.substring(0, 100),
    serviceType,
    serviceNameRaw,
    serviceNameDisplay,
    frequency,
    containerType,
    containerColour,
    isActive: !!service.isActive,
    requiresSubscription: !!service.requiresSubscription,
    notes,
  };
}

/**
 * Sanitise address candidate result
 * 
 * Validates all fields and strips dangerous content.
 */
export function sanitiseAddressCandidate(
  candidate: AddressCandidate
): AddressCandidate | undefined {
  // Validate required fields
  if (!candidate.councilLocalId || !candidate.addressDisplay || !candidate.postcode) {
    console.warn('Address candidate missing required fields', {
      hasCouncilLocalId: !!candidate.councilLocalId,
      hasAddressDisplay: !!candidate.addressDisplay,
      hasPostcode: !!candidate.postcode,
    });
    return undefined;
  }
  
  // Sanitise address fields
  const addressRaw = sanitiseString(candidate.addressRaw, MAX_ADDRESS_LENGTH);
  const addressNormalised = sanitiseString(candidate.addressNormalised, MAX_ADDRESS_LENGTH);
  const addressDisplay = sanitiseString(candidate.addressDisplay, MAX_ADDRESS_LENGTH);
  
  if (!addressRaw || !addressNormalised || !addressDisplay) {
    console.warn('Address candidate address fields invalid after sanitisation');
    return undefined;
  }
  
  // Sanitise postcode (basic validation)
  const postcode = candidate.postcode.trim().toUpperCase();
  if (!/^[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}$/.test(postcode)) {
    console.warn('Invalid UK postcode format', { postcode });
    return undefined;
  }
  
  // Validate confidence is in range 0-1
  let confidence = candidate.confidence;
  if (confidence < 0) confidence = 0;
  if (confidence > 1) confidence = 1;
  
  // Sanitise UPRN (if present)
  let uprn = candidate.uprn;
  if (uprn) {
    // UPRN should be numeric, max 12 digits
    if (!/^\d{1,12}$/.test(uprn)) {
      console.warn('Invalid UPRN format', { uprn });
      uprn = undefined;
    }
  }
  
  // Sanitise metadata (strip unknown fields)
  let metadata = candidate.metadata;
  if (metadata) {
    // Only allow safe primitive values
    const sanitisedMetadata: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(metadata)) {
      // Only allow alphanumeric keys
      if (!/^[a-zA-Z0-9_]+$/.test(key)) {
        continue;
      }
      
      // Only allow string, number, boolean values
      if (typeof value === 'string') {
        sanitisedMetadata[key] = sanitiseString(value, 200);
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        sanitisedMetadata[key] = value;
      }
      // Reject objects, arrays, null, undefined
    }
    
    metadata = sanitisedMetadata;
  }
  
  return {
    councilLocalId: candidate.councilLocalId.substring(0, 100),
    uprn,
    addressRaw,
    addressNormalised,
    addressDisplay,
    postcode,
    confidence,
    metadata,
  };
}

/**
 * Sanitise array of collection events
 * Filters out invalid events
 */
export function sanitiseCollectionEvents(
  events: CollectionEvent[]
): CollectionEvent[] {
  const sanitised = events
    .map(sanitiseCollectionEvent)
    .filter((event): event is CollectionEvent => event !== undefined);
  
  // Warn if events were dropped
  if (sanitised.length < events.length) {
    console.warn('Dropped invalid collection events during sanitisation', {
      original: events.length,
      sanitised: sanitised.length,
      dropped: events.length - sanitised.length,
    });
  }
  
  return sanitised;
}

/**
 * Sanitise array of collection services
 * Filters out invalid services
 */
export function sanitiseCollectionServices(
  services: CollectionService[]
): CollectionService[] {
  const sanitised = services
    .map(sanitiseCollectionService)
    .filter((service): service is CollectionService => service !== undefined);
  
  // Warn if services were dropped
  if (sanitised.length < services.length) {
    console.warn('Dropped invalid collection services during sanitisation', {
      original: services.length,
      sanitised: sanitised.length,
      dropped: services.length - sanitised.length,
    });
  }
  
  return sanitised;
}

/**
 * Sanitise array of address candidates
 * Filters out invalid candidates
 */
export function sanitiseAddressCandidates(
  candidates: AddressCandidate[]
): AddressCandidate[] {
  const sanitised = candidates
    .map(sanitiseAddressCandidate)
    .filter((candidate): candidate is AddressCandidate => candidate !== undefined);
  
  // Warn if candidates were dropped
  if (sanitised.length < candidates.length) {
    console.warn('Dropped invalid address candidates during sanitisation', {
      original: candidates.length,
      sanitised: sanitised.length,
      dropped: candidates.length - sanitised.length,
    });
  }
  
  return sanitised;
}
