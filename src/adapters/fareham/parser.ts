/**
 * Fareham Borough Council - JSON Response Parser
 * 
 * Parses Fareham's public JSON API responses into normalized collection events.
 * Handles date formats like "26/03/2026 (Refuse) and 02/04/2026 (Recycling)".
 * 
 * @module adapters/fareham/parser
 */

import {
  ServiceType,
  CollectionEvent,
  CollectionService,
} from '../base/adapter.interface.js';
import type {
  FarehamAddressRow,
} from './types.js';

/**
 * Normalize service type string to canonical ServiceType.
 */
export function normalizeServiceType(serviceType: string): ServiceType {
  const normalized = serviceType.toLowerCase();
  
  if (normalized.includes('refuse') || normalized.includes('general') || normalized.includes('rubbish') || normalized.includes('waste')) {
    return ServiceType.GENERAL_WASTE;
  }
  if (normalized.includes('recycl')) {
    return ServiceType.RECYCLING;
  }
  if (normalized.includes('garden')) {
    return ServiceType.GARDEN_WASTE;
  }
  if (normalized.includes('food') || normalized.includes('organic')) {
    return ServiceType.FOOD_WASTE;
  }
  if (normalized.includes('glass')) {
    return ServiceType.GLASS;
  }
  
  return ServiceType.OTHER;
}

/**
 * Parse date in DD/MM/YYYY format to ISO 8601 (YYYY-MM-DD).
 */
function parseFarehamDate(dateStr: string): string | null {
  const cleaned = dateStr.trim();
  
  // Handle "today" keyword
  if (cleaned.toLowerCase() === 'today') {
    return new Date().toISOString().split('T')[0];
  }
  
  // DD/MM/YYYY format
  const match = cleaned.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  return null;
}

/**
 * Extract collection events from BinCollectionInformation field.
 * Format: "26/03/2026 (Refuse) and 02/04/2026 (Recycling)"
 */
function parseCollectionInformation(info: string): Array<{ date: string; type: string }> {
  const results: Array<{ date: string; type: string }> = [];
  
  // Match patterns like "26/03/2026 (Refuse)" or "today (Recycling)"
  const regex = /(\d{1,2}\/\d{1,2}\/\d{4}|today)\s*\(([^)]+)\)/gi;
  let match;
  
  while ((match = regex.exec(info)) !== null) {
    const dateStr = match[1];
    const typeStr = match[2];
    const isoDate = parseFarehamDate(dateStr);
    
    if (isoDate) {
      results.push({ date: isoDate, type: typeStr });
    }
  }
  
  return results;
}

/**
 * Extract garden waste date from field.
 * Format: "Thursday 02/04/2026" or just "02/04/2026"
 */
function parseGardenWasteDate(dateStr: string): string | null {
  const match = dateStr.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
  if (match) {
    return parseFarehamDate(match[1]);
  }
  return null;
}

/**
 * Parse Fareham JSON row into CollectionEvents.
 */
export function parseCollectionEvents(row: FarehamAddressRow): CollectionEvent[] {
  const events: CollectionEvent[] = [];
  const today = new Date().toISOString().split('T')[0];
  
  // Parse main bin collection information
  if (row.BinCollectionInformation) {
    const collections = parseCollectionInformation(row.BinCollectionInformation);
    
    for (const collection of collections) {
      const serviceType = normalizeServiceType(collection.type);
      
      events.push({
        eventId: `fareham-${collection.date}-${serviceType}`,
        serviceId: `fareham-${serviceType}`,
        serviceType,
        collectionDate: collection.date,
        timeWindowStart: undefined,
        timeWindowEnd: undefined,
        isConfirmed: true,
        isRescheduled: false,
        isPast: collection.date < today,
        notes: undefined,
      });
    }
  }
  
  // Handle legacy format (DomesticBinDay)
  if (row.DomesticBinDay && !row.BinCollectionInformation) {
    const collections = parseCollectionInformation(row.DomesticBinDay);
    
    for (const collection of collections) {
      const serviceType = normalizeServiceType(collection.type);
      
      events.push({
        eventId: `fareham-${collection.date}-${serviceType}`,
        serviceId: `fareham-${serviceType}`,
        serviceType,
        collectionDate: collection.date,
        timeWindowStart: undefined,
        timeWindowEnd: undefined,
        isConfirmed: true,
        isRescheduled: false,
        isPast: collection.date < today,
        notes: undefined,
      });
    }
  }
  
  // Parse garden waste (try all possible field names)
  const gardenWasteField = 
    row['GardenWasteBinDay<br/>(seenotesabove)'] || 
    row.GardenWasteDay || 
    row.GardenWasteBinDay;
    
  if (gardenWasteField) {
    const gardenDate = parseGardenWasteDate(gardenWasteField);
    if (gardenDate) {
      events.push({
        eventId: `fareham-${gardenDate}-${ServiceType.GARDEN_WASTE}`,
        serviceId: `fareham-${ServiceType.GARDEN_WASTE}`,
        serviceType: ServiceType.GARDEN_WASTE,
        collectionDate: gardenDate,
        timeWindowStart: undefined,
        timeWindowEnd: undefined,
        isConfirmed: true,
        isRescheduled: false,
        isPast: gardenDate < today,
        notes: 'Subscription service',
      });
    }
  }
  
  // Sort events by date
  events.sort((a, b) => a.collectionDate.localeCompare(b.collectionDate));
  
  return events;
}

/**
 * Parse Fareham JSON row into CollectionServices.
 */
export function parseCollectionServices(row: FarehamAddressRow): CollectionService[] {
  const services: CollectionService[] = [];
  const seen = new Set<ServiceType>();
  
  // Determine which services are available based on fields present
  
  // Parse main bin collection information
  if (row.BinCollectionInformation) {
    const collections = parseCollectionInformation(row.BinCollectionInformation);
    
    for (const collection of collections) {
      const serviceType = normalizeServiceType(collection.type);
      
      if (!seen.has(serviceType)) {
        seen.add(serviceType);
        
        services.push({
          serviceId: `fareham-${serviceType}`,
          serviceType,
          serviceNameRaw: collection.type,
          serviceNameDisplay: formatServiceName(serviceType),
          frequency: 'Weekly or Fortnightly', // Fareham alternates
          containerType: serviceType === ServiceType.RECYCLING ? 'Blue bin' : serviceType === ServiceType.GENERAL_WASTE ? 'Green bin' : undefined,
          containerColour: serviceType === ServiceType.RECYCLING ? 'Blue' : serviceType === ServiceType.GENERAL_WASTE ? 'Green' : undefined,
          isActive: true,
          requiresSubscription: false,
          notes: undefined,
        });
      }
    }
  }
  
  // Handle legacy format
  if (row.DomesticBinDay && !row.BinCollectionInformation) {
    const collections = parseCollectionInformation(row.DomesticBinDay);
    
    for (const collection of collections) {
      const serviceType = normalizeServiceType(collection.type);
      
      if (!seen.has(serviceType)) {
        seen.add(serviceType);
        
        services.push({
          serviceId: `fareham-${serviceType}`,
          serviceType,
          serviceNameRaw: collection.type,
          serviceNameDisplay: formatServiceName(serviceType),
          frequency: 'Weekly or Fortnightly',
          containerType: undefined,
          containerColour: undefined,
          isActive: true,
          requiresSubscription: false,
          notes: undefined,
        });
      }
    }
  }
  
  // Add garden waste if present
  const gardenWasteField = 
    row['GardenWasteBinDay<br/>(seenotesabove)'] || 
    row.GardenWasteDay || 
    row.GardenWasteBinDay;
    
  if (gardenWasteField && !seen.has(ServiceType.GARDEN_WASTE)) {
    seen.add(ServiceType.GARDEN_WASTE);
    
    services.push({
      serviceId: `fareham-${ServiceType.GARDEN_WASTE}`,
      serviceType: ServiceType.GARDEN_WASTE,
      serviceNameRaw: 'Garden Waste',
      serviceNameDisplay: 'Garden Waste (Clip & Collect)',
      frequency: 'Fortnightly',
      containerType: undefined,
      containerColour: undefined,
      isActive: true,
      requiresSubscription: true,
      notes: 'Subscription required - see https://www.fareham.gov.uk/waste_collection_and_recycling/garden_waste_and_composting/gardenwastecollection.aspx',
    });
  }
  
  return services;
}

/**
 * Format service type as display name.
 */
function formatServiceName(serviceType: ServiceType): string {
  const mapping: Record<ServiceType, string> = {
    [ServiceType.GENERAL_WASTE]: 'General Waste (Refuse)',
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
