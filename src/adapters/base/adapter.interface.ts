/**
 * Hampshire Bin Collection Data Platform
 * Canonical Adapter Interface
 *
 * This file defines the contract that every council adapter must implement.
 * Adapters are isolated execution units that acquire data from council sources.
 *
 * @module adapters/base
 */

// =============================================================================
// ENUMS
// =============================================================================

/**
 * Method used by adapter to retrieve data from council source.
 * Determines trust level and evidence requirements.
 */
export enum LookupMethod {
  /** Structured API with documented contract */
  API = 'api',

  /** Hidden JSON endpoint discovered in page source */
  HIDDEN_JSON = 'hidden_json',

  /** HTML form submission with response parsing */
  HTML_FORM = 'html_form',

  /** PDF calendar parsing (OCR or structured) */
  PDF_CALENDAR = 'pdf_calendar',

  /** Full browser automation via Playwright */
  BROWSER_AUTOMATION = 'browser_automation',

  /** Council does not provide digital access */
  UNSUPPORTED = 'unsupported',

  /** Method not yet determined */
  UNKNOWN = 'unknown',
}

/**
 * Category of failure for error classification and retry logic.
 */
export enum FailureCategory {
  /** Network timeout or connection refused */
  NETWORK_ERROR = 'network_error',

  /** HTTP 4xx error */
  CLIENT_ERROR = 'client_error',

  /** HTTP 5xx error */
  SERVER_ERROR = 'server_error',

  /** Response received but parsing failed */
  PARSE_ERROR = 'parse_error',

  /** Response parsed but data invalid */
  VALIDATION_ERROR = 'validation_error',

  /** Rate limited by upstream */
  RATE_LIMITED = 'rate_limited',

  /** CAPTCHA or bot detection triggered */
  BOT_DETECTION = 'bot_detection',

  /** Upstream format changed (schema drift) */
  SCHEMA_DRIFT = 'schema_drift',

  /** Adapter code bug */
  ADAPTER_ERROR = 'adapter_error',

  /** Execution timeout exceeded */
  TIMEOUT = 'timeout',

  /** Authentication required or failed */
  AUTH_REQUIRED = 'auth_required',

  /** Property not found at upstream */
  NOT_FOUND = 'not_found',

  /** Unknown failure */
  UNKNOWN = 'unknown',
}

/**
 * Risk level of adapter execution for resource allocation and monitoring.
 */
export enum ExecutionRiskLevel {
  /** API-based adapter with stable schema */
  LOW = 'low',

  /** HTML parsing with reasonable stability */
  MEDIUM = 'medium',

  /** Browser automation or fragile parsing */
  HIGH = 'high',

  /** Experimental or unmaintained adapter */
  CRITICAL = 'critical',
}

/**
 * Health status of an adapter.
 */
export enum HealthStatus {
  /** Adapter is functioning normally */
  HEALTHY = 'healthy',

  /** Adapter is experiencing intermittent issues */
  DEGRADED = 'degraded',

  /** Adapter is non-functional */
  UNHEALTHY = 'unhealthy',

  /** Adapter health is unknown (never checked) */
  UNKNOWN = 'unknown',
}

/**
 * Bin/service type normalised across councils.
 */
export enum ServiceType {
  GENERAL_WASTE = 'general_waste',
  RECYCLING = 'recycling',
  GARDEN_WASTE = 'garden_waste',
  FOOD_WASTE = 'food_waste',
  GLASS = 'glass',
  PAPER = 'paper',
  PLASTIC = 'plastic',
  TEXTILES = 'textiles',
  BULKY_WASTE = 'bulky_waste',
  CLINICAL_WASTE = 'clinical_waste',
  HAZARDOUS_WASTE = 'hazardous_waste',
  ELECTRICAL_WASTE = 'electrical_waste',
  OTHER = 'other',
}

// =============================================================================
// METADATA TYPES
// =============================================================================

/**
 * Metadata captured during every acquisition attempt.
 * Required for auditing, debugging, and monitoring.
 */
export interface AcquisitionMetadata {
  /** Unique identifier for this acquisition attempt */
  attemptId: string;

  /** Adapter identifier */
  adapterId: string;

  /** Council identifier */
  councilId: string;

  /** Method used for this acquisition */
  lookupMethod: LookupMethod;

  /** ISO 8601 timestamp when acquisition started */
  startedAt: string;

  /** ISO 8601 timestamp when acquisition completed */
  completedAt: string;

  /** Duration in milliseconds */
  durationMs: number;

  /** Number of HTTP requests made */
  httpRequestCount: number;

  /** Total bytes received */
  bytesReceived: number;

  /** Whether browser automation was used */
  usedBrowserAutomation: boolean;

  /** Adapter version string */
  adapterVersion: string;

  /** Execution environment (worker ID, container ID) */
  executionEnvironment: string;

  /** Risk level assigned to this execution */
  riskLevel: ExecutionRiskLevel;

  /** Whether response was served from cache */
  cacheHit: boolean;

  /** Upstream response headers (sanitised) */
  upstreamHeaders?: Record<string, string>;
}

/**
 * Reference to stored evidence for an acquisition.
 * Evidence is stored in blob storage for audit purposes.
 */
export interface SourceEvidence {
  /** Unique reference ID for the evidence blob */
  evidenceRef: string;

  /** Type of evidence captured */
  evidenceType: 'html' | 'json' | 'screenshot' | 'pdf' | 'har';

  /** Blob storage path */
  storagePath: string;

  /** SHA-256 hash of evidence content */
  contentHash: string;

  /** Size in bytes */
  sizeBytes: number;

  /** ISO 8601 timestamp of capture */
  capturedAt: string;

  /** Retention expiry date */
  expiresAt: string;

  /** Whether evidence contains PII (affects retention) */
  containsPii: boolean;
}

// =============================================================================
// INPUT TYPES
// =============================================================================

/**
 * Input for property/address lookup operations.
 */
export interface PropertyLookupInput {
  /** UK postcode (required) */
  postcode: string;

  /** Optional address fragment for filtering */
  addressFragment?: string;

  /** Optional UPRN if known */
  uprn?: string;

  /** Optional council-specific local ID if known */
  councilLocalId?: string;

  /** Request correlation ID for tracing */
  correlationId: string;
}

/**
 * Identity of a resolved property for data retrieval.
 */
export interface PropertyIdentity {
  /** Council-specific local identifier (required) */
  councilLocalId: string;

  /** UPRN if available */
  uprn?: string;

  /** Full address string */
  address: string;

  /** Postcode */
  postcode: string;

  /** Request correlation ID for tracing */
  correlationId: string;
}

/**
 * Date range for collection event queries.
 */
export interface DateRange {
  /** Start date (inclusive) ISO 8601 */
  from: string;

  /** End date (inclusive) ISO 8601 */
  to: string;
}

// =============================================================================
// OUTPUT TYPES
// =============================================================================

/**
 * Base result type that all adapter responses extend.
 */
export interface BaseResult<T> {
  /** Whether the operation succeeded */
  success: boolean;

  /** Result data (present if success is true) */
  data?: T;

  /** Acquisition metadata (always present) */
  acquisitionMetadata: AcquisitionMetadata;

  /** Reference to stored evidence (if captured) */
  sourceEvidenceRef?: string;

  /** Confidence score 0-1 (1 = high confidence) */
  confidence: number;

  /** Non-fatal warnings encountered */
  warnings: string[];

  /** Security-relevant warnings (logged separately) */
  securityWarnings: string[];

  /** Failure category (present if success is false) */
  failureCategory?: FailureCategory;

  /** Human-readable error message */
  errorMessage?: string;

  /** Whether the result is from cache */
  fromCache: boolean;

  /** Cache TTL remaining in seconds (if from cache) */
  cacheTtlRemaining?: number;
}

/**
 * Address candidate returned from property lookup.
 */
export interface AddressCandidate {
  /** Council-specific local identifier */
  councilLocalId: string;

  /** UPRN if available from council */
  uprn?: string;

  /** Full address as returned by council */
  addressRaw: string;

  /** Normalised address for matching */
  addressNormalised: string;

  /** Display-friendly address */
  addressDisplay: string;

  /** Postcode */
  postcode: string;

  /** Confidence in address match 0-1 */
  confidence: number;

  /** Additional metadata from council */
  metadata?: Record<string, unknown>;
}

export type AddressCandidateResult = BaseResult<AddressCandidate[]>;

/**
 * Collection service (bin type) available at a property.
 */
export interface CollectionService {
  /** Service identifier (council-specific) */
  serviceId: string;

  /** Normalised service type */
  serviceType: ServiceType;

  /** Council's name for this service */
  serviceNameRaw: string;

  /** Display-friendly service name */
  serviceNameDisplay: string;

  /** Frequency description (e.g., "fortnightly") */
  frequency?: string;

  /** Container type (e.g., "240L wheeled bin") */
  containerType?: string;

  /** Container colour if known */
  containerColour?: string;

  /** Whether service is currently active */
  isActive: boolean;

  /** Whether service requires subscription */
  requiresSubscription: boolean;

  /** Service-specific notes */
  notes?: string;
}

export type CollectionServiceResult = BaseResult<CollectionService[]>;

/**
 * Collection event (scheduled pickup).
 */
export interface CollectionEvent {
  /** Event identifier (council-specific) */
  eventId: string;

  /** Service this event belongs to */
  serviceId: string;

  /** Normalised service type */
  serviceType: ServiceType;

  /** Collection date (ISO 8601 date, no time) */
  collectionDate: string;

  /** Optional time window start (HH:MM) */
  timeWindowStart?: string;

  /** Optional time window end (HH:MM) */
  timeWindowEnd?: string;

  /** Whether this is a confirmed or provisional date */
  isConfirmed: boolean;

  /** Whether collection was rescheduled (e.g., bank holiday) */
  isRescheduled: boolean;

  /** Original date if rescheduled */
  originalDate?: string;

  /** Reason for rescheduling if applicable */
  rescheduleReason?: string;

  /** Whether this event has passed */
  isPast: boolean;

  /** Event-specific notes */
  notes?: string;
}

export type CollectionEventResult = BaseResult<CollectionEvent[]>;

// =============================================================================
// CAPABILITY TYPES
// =============================================================================

/**
 * Capabilities supported by an adapter.
 */
export interface CouncilCapabilities {
  /** Council identifier */
  councilId: string;

  /** Human-readable council name */
  councilName: string;

  /** Council website URL */
  councilWebsite: string;

  /** Whether address lookup is supported */
  supportsAddressLookup: boolean;

  /** Whether collection services can be retrieved */
  supportsCollectionServices: boolean;

  /** Whether collection events can be retrieved */
  supportsCollectionEvents: boolean;

  /** Whether UPRN is provided in responses */
  providesUprn: boolean;

  /** Primary lookup method used */
  primaryLookupMethod: LookupMethod;

  /** Supported date range for events (days into future) */
  maxEventRangeDays: number;

  /** Supported service types */
  supportedServiceTypes: ServiceType[];

  /** Known limitations */
  limitations: string[];

  /** Required rate limit (requests per minute) */
  rateLimitRpm: number;

  /** Adapter last updated date */
  adapterLastUpdated: string;

  /** Whether adapter is production-ready */
  isProductionReady: boolean;
}

/**
 * Health status of an adapter.
 */
export interface AdapterHealth {
  /** Council identifier */
  councilId: string;

  /** Overall health status */
  status: HealthStatus;

  /** ISO 8601 timestamp of last successful acquisition */
  lastSuccessAt?: string;

  /** ISO 8601 timestamp of last failed acquisition */
  lastFailureAt?: string;

  /** Last failure category */
  lastFailureCategory?: FailureCategory;

  /** Last failure message */
  lastFailureMessage?: string;

  /** Success rate over last 24 hours (0-1) */
  successRate24h: number;

  /** Average response time in ms over last 24 hours */
  avgResponseTimeMs24h: number;

  /** Number of acquisitions in last 24 hours */
  acquisitionCount24h: number;

  /** ISO 8601 timestamp of last health check */
  checkedAt: string;

  /** Upstream endpoint reachability */
  upstreamReachable: boolean;

  /** Detected schema version (for drift detection) */
  detectedSchemaVersion?: string;

  /** Expected schema version */
  expectedSchemaVersion?: string;

  /** Whether schema drift detected */
  schemaDriftDetected: boolean;
}

/**
 * Security profile of an adapter.
 */
export interface AdapterSecurityProfile {
  /** Council identifier */
  councilId: string;

  /** Execution risk level */
  riskLevel: ExecutionRiskLevel;

  /** Whether adapter requires browser automation */
  requiresBrowserAutomation: boolean;

  /** Whether adapter executes JavaScript */
  executesJavaScript: boolean;

  /** External domains accessed */
  externalDomains: string[];

  /** Whether adapter handles credentials */
  handlesCredentials: boolean;

  /** Known security concerns */
  securityConcerns: string[];

  /** Last security review date */
  lastSecurityReview?: string;

  /** Whether adapter is sandboxed */
  isSandboxed: boolean;

  /** Network isolation level */
  networkIsolation: 'none' | 'egress_filtered' | 'allowlist_only';

  /** Required permissions */
  requiredPermissions: string[];
}

// =============================================================================
// ADAPTER INTERFACE
// =============================================================================

/**
 * Canonical interface that every council adapter must implement.
 *
 * Adapters are isolated execution units that acquire data from council sources.
 * They must be stateless and deterministic given the same inputs.
 *
 * @example
 * ```typescript
 * export class BasingstokeAdapter implements CouncilAdapter {
 *   councilId = 'basingstoke';
 *
 *   async discoverCapabilities(): Promise<CouncilCapabilities> {
 *     // Return adapter capabilities
 *   }
 *
 *   async resolveAddresses(input: PropertyLookupInput): Promise<AddressCandidateResult> {
 *     // Lookup addresses by postcode
 *   }
 *
 *   // ... other methods
 * }
 * ```
 */
export interface CouncilAdapter {
  /**
   * Unique council identifier (lowercase, hyphenated).
   * @example "basingstoke", "test-valley", "east-hampshire"
   */
  readonly councilId: string;

  /**
   * Discover capabilities of this adapter.
   * Called during adapter registration and health checks.
   *
   * @returns Promise resolving to council capabilities
   */
  discoverCapabilities(): Promise<CouncilCapabilities>;

  /**
   * Resolve addresses for a given postcode.
   * Returns list of address candidates that can be used for further lookups.
   *
   * @param input - Property lookup input containing postcode
   * @returns Promise resolving to address candidates
   */
  resolveAddresses(input: PropertyLookupInput): Promise<AddressCandidateResult>;

  /**
   * Get collection services available at a property.
   * Services are the types of bins/collections available.
   *
   * @param input - Property identity from address resolution
   * @returns Promise resolving to collection services
   */
  getCollectionServices(input: PropertyIdentity): Promise<CollectionServiceResult>;

  /**
   * Get collection events (scheduled pickups) for a property.
   * Events are the actual scheduled collection dates.
   *
   * @param input - Property identity from address resolution
   * @param range - Optional date range filter
   * @returns Promise resolving to collection events
   */
  getCollectionEvents(
    input: PropertyIdentity,
    range?: DateRange
  ): Promise<CollectionEventResult>;

  /**
   * Verify adapter health by performing a minimal acquisition.
   * Used for health checks and monitoring.
   *
   * @returns Promise resolving to adapter health status
   */
  verifyHealth(): Promise<AdapterHealth>;

  /**
   * Get security profile of this adapter.
   * Used for risk assessment and sandbox configuration.
   *
   * @returns Promise resolving to security profile
   */
  securityProfile(): Promise<AdapterSecurityProfile>;
}

// =============================================================================
// ADAPTER REGISTRATION
// =============================================================================

/**
 * Adapter registration metadata.
 */
export interface AdapterRegistration {
  /** Council identifier */
  councilId: string;

  /** Adapter implementation */
  adapter: CouncilAdapter;

  /** Adapter version */
  version: string;

  /** Registration timestamp */
  registeredAt: string;

  /** Whether adapter is enabled */
  enabled: boolean;

  /** Override risk level (for operational reasons) */
  riskLevelOverride?: ExecutionRiskLevel;
}

/**
 * Adapter factory function type.
 */
export type AdapterFactory = () => CouncilAdapter;
