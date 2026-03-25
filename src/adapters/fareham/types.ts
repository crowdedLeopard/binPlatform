/**
 * Fareham Borough Council - Bartec Response Types
 * 
 * Type definitions for Bartec Collective SOAP/XML responses.
 * Based on discovery of Bartec platform used by Fareham.
 * 
 * @module adapters/fareham/types
 */

/**
 * Parsed Bartec Features_Get response.
 * Structure based on typical Bartec Collective API responses.
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
