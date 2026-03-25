/**
 * Hampshire Bin Collection Data Platform
 * Adapter Output Validator
 * 
 * Validates that every adapter response conforms to the canonical schema.
 * Runs after sanitisation, before returning to caller.
 * 
 * Validation failures add to parseWarnings rather than throwing.
 * Degraded result is better than no result.
 * 
 * @module adapters/base/adapter-validator
 */

import type {
  CollectionEvent,
  CollectionService,
  AddressCandidate,
  CollectionEventResult,
  CollectionServiceResult,
  AddressCandidateResult,
} from './adapter.interface.js';

interface ValidationResult {
  valid: boolean;
  warnings: string[];
}

/**
 * Validate confidence score is in valid range
 */
function validateConfidence(confidence: number): ValidationResult {
  const warnings: string[] = [];
  
  if (confidence < 0 || confidence > 1) {
    warnings.push(`Confidence score out of range: ${confidence} (expected 0.0-1.0)`);
    return { valid: false, warnings };
  }
  
  return { valid: true, warnings };
}

/**
 * Validate date is in the future (for collection events)
 */
function validateFutureDate(date: string): ValidationResult {
  const warnings: string[] = [];
  
  try {
    const dateObj = new Date(date);
    const now = new Date();
    
    // Set to start of day for fair comparison
    now.setHours(0, 0, 0, 0);
    dateObj.setHours(0, 0, 0, 0);
    
    if (dateObj < now) {
      warnings.push(`Collection date is in the past: ${date}`);
      return { valid: false, warnings };
    }
    
    return { valid: true, warnings };
  } catch (error) {
    warnings.push(`Invalid date format: ${date}`);
    return { valid: false, warnings };
  }
}

/**
 * Validate date is not too far in future (max 365 days)
 */
function validateReasonableFutureDate(date: string): ValidationResult {
  const warnings: string[] = [];
  
  try {
    const dateObj = new Date(date);
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 365);
    
    if (dateObj > maxDate) {
      warnings.push(`Collection date more than 365 days in future (implausible): ${date}`);
      return { valid: false, warnings };
    }
    
    return { valid: true, warnings };
  } catch (error) {
    warnings.push(`Invalid date format: ${date}`);
    return { valid: false, warnings };
  }
}

/**
 * Validate collection event
 */
function validateCollectionEvent(event: CollectionEvent): ValidationResult {
  const warnings: string[] = [];
  
  // Required fields
  if (!event.eventId) {
    warnings.push('Missing required field: eventId');
  }
  
  if (!event.serviceId) {
    warnings.push('Missing required field: serviceId');
  }
  
  if (!event.serviceType) {
    warnings.push('Missing required field: serviceType');
  }
  
  if (!event.collectionDate) {
    warnings.push('Missing required field: collectionDate');
  }
  
  // Validate collection date is in future
  if (event.collectionDate) {
    const futureDateResult = validateFutureDate(event.collectionDate);
    warnings.push(...futureDateResult.warnings);
  }
  
  // Validate date is not too far in future
  if (event.collectionDate) {
    const reasonableDateResult = validateReasonableFutureDate(event.collectionDate);
    warnings.push(...reasonableDateResult.warnings);
  }
  
  // Validate time window consistency
  if (event.timeWindowStart && !event.timeWindowEnd) {
    warnings.push('timeWindowStart provided without timeWindowEnd');
  }
  
  if (event.timeWindowEnd && !event.timeWindowStart) {
    warnings.push('timeWindowEnd provided without timeWindowStart');
  }
  
  // Validate rescheduled consistency
  if (event.isRescheduled && !event.originalDate) {
    warnings.push('isRescheduled is true but originalDate is missing');
  }
  
  if (event.originalDate && !event.isRescheduled) {
    warnings.push('originalDate provided but isRescheduled is false');
  }
  
  const valid = warnings.length === 0;
  return { valid, warnings };
}

/**
 * Validate collection service
 */
function validateCollectionService(service: CollectionService): ValidationResult {
  const warnings: string[] = [];
  
  // Required fields
  if (!service.serviceId) {
    warnings.push('Missing required field: serviceId');
  }
  
  if (!service.serviceType) {
    warnings.push('Missing required field: serviceType');
  }
  
  if (!service.serviceNameRaw) {
    warnings.push('Missing required field: serviceNameRaw');
  }
  
  if (!service.serviceNameDisplay) {
    warnings.push('Missing required field: serviceNameDisplay');
  }
  
  const valid = warnings.length === 0;
  return { valid, warnings };
}

/**
 * Validate address candidate
 */
function validateAddressCandidate(candidate: AddressCandidate): ValidationResult {
  const warnings: string[] = [];
  
  // Required fields
  if (!candidate.councilLocalId) {
    warnings.push('Missing required field: councilLocalId');
  }
  
  if (!candidate.addressRaw) {
    warnings.push('Missing required field: addressRaw');
  }
  
  if (!candidate.addressNormalised) {
    warnings.push('Missing required field: addressNormalised');
  }
  
  if (!candidate.addressDisplay) {
    warnings.push('Missing required field: addressDisplay');
  }
  
  if (!candidate.postcode) {
    warnings.push('Missing required field: postcode');
  }
  
  // Validate confidence
  const confidenceResult = validateConfidence(candidate.confidence);
  warnings.push(...confidenceResult.warnings);
  
  const valid = warnings.length === 0;
  return { valid, warnings };
}

/**
 * Validate collection event result
 * 
 * Checks that the result conforms to canonical schema.
 * Adds warnings for validation failures but does not throw.
 */
export function validateCollectionEventResult(
  result: CollectionEventResult
): CollectionEventResult {
  const warnings = [...(result.warnings || [])];
  
  // Validate metadata presence
  if (!result.acquisitionMetadata) {
    warnings.push('Missing required field: acquisitionMetadata');
  } else {
    // Validate metadata fields
    if (!result.acquisitionMetadata.councilId) {
      warnings.push('Missing acquisitionMetadata.councilId');
    }
    
    if (!result.acquisitionMetadata.adapterId) {
      warnings.push('Missing acquisitionMetadata.adapterId');
    }
    
    if (!result.acquisitionMetadata.attemptId) {
      warnings.push('Missing acquisitionMetadata.attemptId');
    }
  }
  
  // Validate confidence
  const confidenceResult = validateConfidence(result.confidence);
  warnings.push(...confidenceResult.warnings);
  
  // Validate events (if present)
  if (result.data && result.data.length > 0) {
    result.data.forEach((event, index) => {
      const eventResult = validateCollectionEvent(event);
      if (!eventResult.valid) {
        eventResult.warnings.forEach((warning) => {
          warnings.push(`Event ${index}: ${warning}`);
        });
      }
    });
  } else if (result.success) {
    // Success but no events - possible parse failure
    warnings.push('No collection events returned (possible parse failure or no upcoming collections)');
  }
  
  return {
    ...result,
    warnings,
  };
}

/**
 * Validate collection service result
 */
export function validateCollectionServiceResult(
  result: CollectionServiceResult
): CollectionServiceResult {
  const warnings = [...(result.warnings || [])];
  
  // Validate metadata presence
  if (!result.acquisitionMetadata) {
    warnings.push('Missing required field: acquisitionMetadata');
  } else {
    // Validate metadata fields
    if (!result.acquisitionMetadata.councilId) {
      warnings.push('Missing acquisitionMetadata.councilId');
    }
    
    if (!result.acquisitionMetadata.adapterId) {
      warnings.push('Missing acquisitionMetadata.adapterId');
    }
  }
  
  // Validate confidence
  const confidenceResult = validateConfidence(result.confidence);
  warnings.push(...confidenceResult.warnings);
  
  // Validate services (if present)
  if (result.data && result.data.length > 0) {
    result.data.forEach((service, index) => {
      const serviceResult = validateCollectionService(service);
      if (!serviceResult.valid) {
        serviceResult.warnings.forEach((warning) => {
          warnings.push(`Service ${index}: ${warning}`);
        });
      }
    });
  } else if (result.success) {
    warnings.push('No collection services returned (possible parse failure)');
  }
  
  return {
    ...result,
    warnings,
  };
}

/**
 * Validate address candidate result
 */
export function validateAddressCandidateResult(
  result: AddressCandidateResult
): AddressCandidateResult {
  const warnings = [...(result.warnings || [])];
  
  // Validate metadata presence
  if (!result.acquisitionMetadata) {
    warnings.push('Missing required field: acquisitionMetadata');
  } else {
    // Validate metadata fields
    if (!result.acquisitionMetadata.councilId) {
      warnings.push('Missing acquisitionMetadata.councilId');
    }
    
    if (!result.acquisitionMetadata.adapterId) {
      warnings.push('Missing acquisitionMetadata.adapterId');
    }
  }
  
  // Validate confidence
  const confidenceResult = validateConfidence(result.confidence);
  warnings.push(...confidenceResult.warnings);
  
  // Validate candidates (if present)
  if (result.data && result.data.length > 0) {
    result.data.forEach((candidate, index) => {
      const candidateResult = validateAddressCandidate(candidate);
      if (!candidateResult.valid) {
        candidateResult.warnings.forEach((warning) => {
          warnings.push(`Candidate ${index}: ${warning}`);
        });
      }
    });
  } else if (result.success) {
    warnings.push('No address candidates returned (possible parse failure or no matches)');
  }
  
  return {
    ...result,
    warnings,
  };
}

/**
 * Validate that at least one event is returned
 * Useful for detecting complete parse failures
 */
export function requireAtLeastOneEvent(
  result: CollectionEventResult
): CollectionEventResult {
  const warnings = [...(result.warnings || [])];
  
  if (result.success && (!result.data || result.data.length === 0)) {
    warnings.push('CRITICAL: No events returned despite success - likely parse failure');
  }
  
  return {
    ...result,
    warnings,
  };
}

/**
 * Validate that at least one service is returned
 */
export function requireAtLeastOneService(
  result: CollectionServiceResult
): CollectionServiceResult {
  const warnings = [...(result.warnings || [])];
  
  if (result.success && (!result.data || result.data.length === 0)) {
    warnings.push('CRITICAL: No services returned despite success - likely parse failure');
  }
  
  return {
    ...result,
    warnings,
  };
}
