/**
 * Fareham Borough Council - Response Types
 * 
 * Type definitions for JSON API responses.
 * Replaces Bartec SOAP implementation with public JSON endpoint.
 * 
 * @module adapters/fareham/types
 */

/**
 * Fareham JSON API response structure.
 * Used by the public search_data.aspx endpoint.
 */
export interface FarehamJsonResponse {
  'information about this dataset'?: {
    copyright?: string;
    'usage rights'?: string;
    date?: string;
    message?: string;
  };
  data?: {
    rows?: FarehamAddressRow[];
  };
}

/**
 * Individual address row from JSON API.
 */
export interface FarehamAddressRow {
  /** Row number */
  Row?: string;
  
  /** Full address */
  Address?: string;
  
  /** Bin collection information (e.g., "26/03/2026 (Refuse) and 02/04/2026 (Recycling)") */
  BinCollectionInformation?: string;
  
  /** Garden waste collection day (e.g., "Thursday 02/04/2026") */
  'GardenWasteBinDay<br/>(seenotesabove)'?: string;
  
  /** Link to calendar (contains UPRN in URL) */
  Calendar?: string;
  
  /** Legacy field from old dataset */
  DomesticBinDay?: string;
  
  /** Legacy garden waste field */
  GardenWasteDay?: string;
  
  /** Legacy garden waste field variant */
  GardenWasteBinDay?: string;
}

/**
 * Parsed Bartec Features_Get response.
 * Structure based on typical Bartec Collective API responses.
 * Used as a fallback/reference implementation.
 */
export interface FarehamBartecResponse {
  /** Property UPRN */
  uprn?: string;
  
  /** Property address */
  address?: string;
  
  /** Postcode */
  postcode?: string;
  
  /** Collection services and schedules */
  services?: FarehamService[];
  
  /** Collection rounds */
  rounds?: FarehamRound[];
  
  /** Error message if request failed */
  error?: string;
}

/**
 * Individual collection service from Bartec.
 */
export interface FarehamService {
  /** Service code (e.g., RES, REC, GW) */
  serviceCode?: string;
  
  /** Service name/description */
  serviceName?: string;
  
  /** Service type */
  serviceType?: string;
  
  /** Next collection date */
  nextCollection?: string;
  
  /** Collection frequency */
  frequency?: string;
  
  /** Container type */
  container?: string;
  
  /** Container color */
  color?: string;
  
  /** Round identifier */
  round?: string;
  
  /** Service status */
  status?: string;
  
  /** Notes */
  notes?: string;
}

/**
 * Collection round information.
 */
export interface FarehamRound {
  /** Round identifier */
  roundId?: string;
  
  /** Round name */
  roundName?: string;
  
  /** Collection day */
  collectionDay?: string;
  
  /** Services on this round */
  services?: string[];
}

/**
 * Bartec SOAP response envelope.
 * Actual structure after XML parsing.
 */
export interface BartecSoapResponse {
  Envelope?: {
    Body?: {
      Features_GetResponse?: {
        Features_GetResult?: any;
      };
      Fault?: {
        faultcode?: string;
        faultstring?: string;
        detail?: any;
      };
    };
  };
}
