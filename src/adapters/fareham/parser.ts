/**
 * Fareham Borough Council - Bartec Response Parser
 * 
 * Parses Bartec Collective SOAP/XML responses into normalized collection events.
 * Handles Bartec-specific service codes and date formats.
 * 
 * @module adapters/fareham/parser
 */

import {
  ServiceType,
  CollectionEvent,
  CollectionService,
} from '../base/adapter.interface.js';
import type {
  FarehamBartecResponse,
  FarehamService,
  BartecSoapResponse,
} from './types.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Parse Bartec XML response into structured data.
 * Handles multiple possible response structures from Bartec API.
 */
export function parseBartecResponse(soapResponse: BartecSoapResponse): FarehamBartecResponse {
  // Extract Features_GetResult from SOAP envelope
  const result = soapResponse?.Envelope?.Body?.Features_GetResponse?.Features_GetResult;
  
  if (!result) {
    return { error: 'No Features_GetResult in SOAP response' };
  }
  
  // Bartec responses can vary - handle common structures
  const response: FarehamBartecResponse = {
    uprn: extractValue(result, ['UPRN', 'Uprn', 'uprn']),
    address: extractValue(result, ['Address', 'address', 'FullAddress']),
    postcode: extractValue(result, ['Postcode', 'postcode', 'PostCode']),
    services: parseServices(result),
  };
  
  return response;
}

/**
 * Extract value from object using multiple possible key names.
 */
function extractValue(obj: any, keys: string[]): string | undefined {
  for (const key of keys) {
    if (obj && obj[key] !== undefined) {
      return String(obj[key]);
    }
  }
  return undefined;
}

/**
 * Parse services array from Bartec result.
 */
function parseServices(result: any): FarehamService[] {
  const services: FarehamService[] = [];
  
  // Try different possible service array locations
  const serviceArray = 
    result?.Services?.Service ||
    result?.Service ||
    result?.Collections?.Collection ||
    result?.Features?.Feature;
  
  if (!serviceArray) return services;
  
  // Handle both single object and array
  const items = Array.isArray(serviceArray) ? serviceArray : [serviceArray];
  
  for (const item of items) {
    services.push({
      serviceCode: extractValue(item, ['ServiceCode', 'Code', 'Type']),
      serviceName: extractValue(item, ['ServiceName', 'Name', 'Description']),
      serviceType: extractValue(item, ['ServiceType', 'Type']),
      nextCollection: extractValue(item, ['NextCollection', 'CollectionDate', 'Date']),
      frequency: extractValue(item, ['Frequency', 'Schedule']),
      container: extractValue(item, ['Container', 'ContainerType', 'BinType']),
      color: extractValue(item, ['Color', 'Colour', 'BinColour']),
      round: extractValue(item, ['Round', 'RoundCode']),
      status: extractValue(item, ['Status', 'Active']),
      notes: extractValue(item, ['Notes', 'Message']),
    });
  }
  
  return services;
}

/**
 * Map Bartec service code to canonical ServiceType.
 */
export function mapBartecServiceType(service: FarehamService): ServiceType {
  const code = (service.serviceCode || service.serviceType || '').toUpperCase();
  const name = (service.serviceName || '').toLowerCase();
  
  // Check service code first
  if (code.match(/^(RES|REFUSE|RESIDUAL|WASTE)$/)) {
    return ServiceType.GENERAL_WASTE;
  }
  
  if (code.match(/^(REC|RECYCLE|RECYCLING|DRY)$/)) {
    return ServiceType.RECYCLING;
  }
  
  if (code.match(/^(GW|GARDEN|GREEN)$/)) {
    return ServiceType.GARDEN_WASTE;
  }
  
  if (code.match(/^(FOOD|FW|ORG)$/)) {
    return ServiceType.FOOD_WASTE;
  }
  
  if (code.match(/^(GLASS|GL)$/)) {
    return ServiceType.GLASS;
  }
  
  // Fallback to name matching
  if (name.includes('refuse') || name.includes('general') || name.includes('rubbish')) {
    return ServiceType.GENERAL_WASTE;
  }
  
  if (name.includes('recycl')) {
    return ServiceType.RECYCLING;
  }
  
  if (name.includes('garden')) {
    return ServiceType.GARDEN_WASTE;
  }
  
  if (name.includes('food')) {
    return ServiceType.FOOD_WASTE;
  }
  
  if (name.includes('glass')) {
    return ServiceType.GLASS;
  }
  
  // Log unknown service codes for investigation
  console.warn(`[Fareham] Unknown Bartec service code: ${code} (${name})`);
  
  return ServiceType.OTHER;
}

/**
 * Parse Bartec date string to ISO 8601.
 */
export function parseBartecDate(dateStr: string | undefined): string | null {
  if (!dateStr) return null;
  
  const cleaned = dateStr.trim();
  
  // ISO format
  if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) {
    return cleaned.split('T')[0];
  }
  
  // DD/MM/YYYY
  const ukMatch = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (ukMatch) {
    const [, day, month, year] = ukMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  // Try parsing as timestamp
  const timestamp = Date.parse(cleaned);
  if (!isNaN(timestamp)) {
    return new Date(timestamp).toISOString().split('T')[0];
  }
  
  return null;
}

/**
 * Parse Bartec response into CollectionEvents.
 */
export function parseCollectionEvents(response: FarehamBartecResponse): CollectionEvent[] {
  const events: CollectionEvent[] = [];
  
  if (!response.services || response.services.length === 0) {
    return events;
  }
  
  const today = new Date().toISOString().split('T')[0];
  
  for (const service of response.services) {
    const serviceType = mapBartecServiceType(service);
    const collectionDate = parseBartecDate(service.nextCollection);
    
    if (!collectionDate) {
      console.warn(`[Fareham] No valid collection date for service: ${service.serviceCode}`);
      continue;
    }
    
    events.push({
      eventId: `fareham-${collectionDate}-${serviceType}`,
      serviceId: `fareham-${serviceType}`,
      serviceType,
      collectionDate,
      timeWindowStart: undefined,
      timeWindowEnd: undefined,
      isConfirmed: true,
      isRescheduled: false,
      isPast: collectionDate < today,
      notes: service.notes,
    });
  }
  
  return events;
}

/**
 * Parse Bartec response into CollectionServices.
 */
export function parseCollectionServices(response: FarehamBartecResponse): CollectionService[] {
  const services: CollectionService[] = [];
  
  if (!response.services || response.services.length === 0) {
    return services;
  }
  
  for (const service of response.services) {
    const serviceType = mapBartecServiceType(service);
    
    services.push({
      serviceId: `fareham-${serviceType}`,
      serviceType,
      serviceNameRaw: service.serviceName || service.serviceCode || '',
      serviceNameDisplay: formatServiceName(serviceType),
      frequency: service.frequency,
      containerType: service.container,
      containerColour: service.color,
      isActive: service.status !== 'INACTIVE' && service.status !== 'SUSPENDED',
      requiresSubscription: serviceType === ServiceType.GARDEN_WASTE,
      notes: service.notes,
    });
  }
  
  return services;
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
 * Calculate confidence score based on response completeness.
 */
export function calculateConfidence(response: FarehamBartecResponse): number {
  let score = 0.5;
  
  if (response.uprn) score += 0.1;
  if (response.address) score += 0.1;
  if (response.services && response.services.length > 0) {
    score += 0.2;
    
    // Check if services have dates
    const withDates = response.services.filter(s => s.nextCollection).length;
    if (withDates > 0) {
      score += (withDates / response.services.length) * 0.2;
    }
  }
  
  return Math.min(score, 1.0);
}
