/**
 * Hampshire Bin Collection Data Platform
 * Property & Collection API Routes
 * 
 * GET /v1/postcodes/:postcode/addresses - Resolve addresses by postcode
 * GET /v1/properties/:propertyId/collections - Get collection events
 * GET /v1/properties/:propertyId/services - Get collection services
 */

import { Hono } from 'hono';
import type { PropertyResolutionService } from '../../core/property-resolution';
import { invalidPostcode, invalidPropertyId, propertyNotFound, internalError } from '../errors';
import { getAuthContext } from '../middleware/auth';

export function createPropertyRoutes(resolutionService: PropertyResolutionService) {
  const app = new Hono();

  /**
   * GET /v1/postcodes/:postcode/addresses
   * Resolve addresses for a postcode with optional house identifier.
   * Rate limited: 10 requests/minute per IP
   * Cache: 1 hour for same postcode+house combination
   */
  app.get('/:postcode/addresses', async (c) => {
    const postcode = c.req.param('postcode');
    const house = c.req.query('house');
    const auth = getAuthContext(c);

    try {
      const result = await resolutionService.resolveByPostcode(postcode, house);

      if (!result.success) {
        if (result.error?.code === 'INVALID_POSTCODE') {
          throw invalidPostcode(postcode, auth.requestId);
        }
        
        if (result.error?.code === 'POSTCODE_NOT_HAMPSHIRE') {
          return c.json(
            {
              error: {
                code: result.error.code,
                message: result.error.message,
                requestId: auth.requestId,
                details: result.error.details,
              },
            },
            404
          );
        }

        if (result.error?.code === 'PROPERTY_NOT_FOUND') {
          throw propertyNotFound(auth.requestId);
        }

        throw internalError(auth.requestId);
      }

      // Auto-resolved to single property
      if (result.data?.autoResolved) {
        return c.json({
          property_id: result.data.propertyId,
          address: result.data.address,
          postcode: result.data.postcode,
          council_id: result.data.councilId,
          auto_resolved: true,
          metadata: {
            request_id: result.metadata.requestId,
            processed_at: result.metadata.processedAt,
          },
        });
      }

      // Multiple candidates - user must select
      return c.json({
        postcode: result.data?.postcode,
        candidates: result.data?.candidates?.map((candidate) => ({
          council_local_id: candidate.councilLocalId,
          uprn: candidate.uprn,
          address: candidate.addressDisplay,
          postcode: candidate.postcode,
          confidence: candidate.confidence,
        })),
        auto_resolved: false,
        metadata: {
          request_id: result.metadata.requestId,
          processed_at: result.metadata.processedAt,
        },
      });
    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        throw error;
      }
      throw internalError(auth.requestId);
    }
  });

  /**
   * GET /v1/properties/:propertyId/collections
   * Get collection events for a property.
   * Cache: 4 hours
   */
  app.get('/:propertyId/collections', async (c) => {
    const propertyId = c.req.param('propertyId');
    const auth = getAuthContext(c);

    try {
      const scheduleResult = await resolutionService.getCollectionSchedule(propertyId);

      if (!scheduleResult.success) {
        if (scheduleResult.error?.code === 'PROPERTY_NOT_FOUND') {
          throw propertyNotFound(auth.requestId);
        }

        if (scheduleResult.error?.code === 'INVALID_PROPERTY_ID') {
          throw invalidPropertyId(auth.requestId);
        }

        throw internalError(auth.requestId);
      }

      const events = scheduleResult.data?.events;
      const services = scheduleResult.data?.services;

      return c.json({
        property_id: propertyId,
        collections: events?.data?.map((event) => ({
          event_id: event.eventId,
          service_type: event.serviceType,
          collection_date: event.collectionDate,
          time_window: event.timeWindowStart && event.timeWindowEnd
            ? `${event.timeWindowStart}-${event.timeWindowEnd}`
            : undefined,
          is_confirmed: event.isConfirmed,
          is_rescheduled: event.isRescheduled,
          original_date: event.originalDate,
          reschedule_reason: event.rescheduleReason,
          notes: event.notes,
        })),
        source: {
          council: scheduleResult.data?.sourceCouncil,
          method: events?.acquisitionMetadata.lookupMethod,
          timestamp: events?.acquisitionMetadata.completedAt,
          confidence: events?.confidence,
          from_cache: events?.fromCache,
        },
        metadata: {
          request_id: scheduleResult.metadata.requestId,
          processed_at: scheduleResult.metadata.processedAt,
        },
        warnings: events?.warnings,
      });
    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        throw error;
      }
      throw internalError(auth.requestId);
    }
  });

  /**
   * GET /v1/properties/:propertyId/services
   * Get collection services available at a property.
   * Cache: 24 hours
   */
  app.get('/:propertyId/services', async (c) => {
    const propertyId = c.req.param('propertyId');
    const auth = getAuthContext(c);

    try {
      const scheduleResult = await resolutionService.getCollectionSchedule(propertyId);

      if (!scheduleResult.success) {
        if (scheduleResult.error?.code === 'PROPERTY_NOT_FOUND') {
          throw propertyNotFound(auth.requestId);
        }

        if (scheduleResult.error?.code === 'INVALID_PROPERTY_ID') {
          throw invalidPropertyId(auth.requestId);
        }

        throw internalError(auth.requestId);
      }

      const services = scheduleResult.data?.services;

      return c.json({
        property_id: propertyId,
        services: services?.data?.map((service) => ({
          service_id: service.serviceId,
          service_type: service.serviceType,
          name: service.serviceNameDisplay,
          frequency: service.frequency,
          container: {
            type: service.containerType,
            colour: service.containerColour,
          },
          is_active: service.isActive,
          requires_subscription: service.requiresSubscription,
          notes: service.notes,
        })),
        source: {
          council: scheduleResult.data?.sourceCouncil,
          method: services?.acquisitionMetadata.lookupMethod,
          timestamp: services?.acquisitionMetadata.completedAt,
          confidence: services?.confidence,
          from_cache: services?.fromCache,
        },
        metadata: {
          request_id: scheduleResult.metadata.requestId,
          processed_at: scheduleResult.metadata.processedAt,
        },
      });
    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        throw error;
      }
      throw internalError(auth.requestId);
    }
  });

  return app;
}
