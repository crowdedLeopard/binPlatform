/**
 * Mock Collection Data for Testing
 * 
 * Provides realistic mock collection data for councils that have
 * bot protection or while we're developing the adapters.
 */

import type { CollectionEvent } from '../adapters/base/adapter.interface.js';
import { ServiceType } from '../adapters/base/adapter.interface.js';

/**
 * Generate upcoming collection dates for a property.
 * Returns the next 8 weeks of collections (fortnightly schedule).
 */
export function generateMockCollections(uprn: string, councilId: string): CollectionEvent[] {
  const events: CollectionEvent[] = [];
  const today = new Date();
  
  // Seed the random pattern based on UPRN (so same UPRN always gets same schedule)
  const seed = parseInt(uprn.slice(-4)) % 14;
  
  // Next general waste collection (fortnightly, starting from seed offset)
  for (let week = 0; week < 8; week += 2) {
    const date = new Date(today);
    date.setDate(today.getDate() + seed + (week * 7));
    
    events.push({
      eventId: `mock-${councilId}-${uprn}-gw-${week}`,
      serviceId: `${councilId}-general-waste`,
      serviceType: ServiceType.GENERAL_WASTE,
      collectionDate: date.toISOString().split('T')[0],
      isConfirmed: true,
      isRescheduled: false,
      isPast: false,
      notes: 'Black bin collection'
    });
  }
  
  // Recycling (alternate fortnights from general waste)
  for (let week = 1; week < 8; week += 2) {
    const date = new Date(today);
    date.setDate(today.getDate() + seed + (week * 7));
    
    events.push({
      eventId: `mock-${councilId}-${uprn}-rec-${week}`,
      serviceId: `${councilId}-recycling`,
      serviceType: ServiceType.RECYCLING,
      collectionDate: date.toISOString().split('T')[0],
      isConfirmed: true,
      isRescheduled: false,
      isPast: false,
      notes: 'Blue bin - paper, cardboard, plastic bottles, cans'
    });
  }
  
  // Food waste (weekly)
  for (let week = 0; week < 8; week++) {
    const date = new Date(today);
    date.setDate(today.getDate() + seed + (week * 7));
    
    events.push({
      eventId: `mock-${councilId}-${uprn}-food-${week}`,
      serviceId: `${councilId}-food-waste`,
      serviceType: ServiceType.FOOD_WASTE,
      collectionDate: date.toISOString().split('T')[0],
      isConfirmed: true,
      isRescheduled: false,
      isPast: false,
      notes: 'Food caddy collection'
    });
  }
  
  // Sort by date
  events.sort((a, b) => a.collectionDate.localeCompare(b.collectionDate));
  
  return events;
}
