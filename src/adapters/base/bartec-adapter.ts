/**
 * Bartec Collective Base Adapter
 * 
 * Shared SOAP/XML adapter for councils using the Bartec Municipal Technologies platform.
 * Bartec Collective is used by multiple UK councils for waste management.
 * 
 * This base provides:
 * - SOAP envelope construction
 * - XML response parsing
 * - Common Bartec service code mappings
 * - Shared error handling for SOAP faults
 * 
 * @module adapters/base/bartec-adapter
 */

import type { ServiceType } from './adapter.interface.js';
import { XMLParser } from 'fast-xml-parser';

/**
 * Bartec SOAP request configuration.
 */
export interface BartecSoapConfig {
  /** Bartec API endpoint URL */
  endpoint: string;
  
  /** Optional authentication credentials */
  credentials?: {
    username: string;
    password: string;
  };
  
  /** Request timeout in milliseconds */
  timeout: number;
  
  /** Whether to validate SSL certificates */
  strictSSL: boolean;
}

/**
 * Bartec SOAP envelope structure.
 */
export interface BartecSoapEnvelope {
  method: string;
  namespace: string;
  parameters: Record<string, string | number>;
}

/**
 * Parsed Bartec collection item from XML response.
 */
export interface BartecCollection {
  serviceCode: string;
  serviceName: string;
  collectionDate?: string;
  nextCollectionDate?: string;
  frequency?: string;
  containerType?: string;
  containerColor?: string;
  round?: string;
  notes?: string;
}

/**
 * Bartec SOAP fault structure.
 */
export interface BartecSoapFault {
  faultCode: string;
  faultString: string;
  detail?: string;
}

/**
 * Base class for Bartec Collective adapters.
 * Provides SOAP client functionality and common parsing.
 */
export abstract class BartecBaseAdapter {
  protected config: BartecSoapConfig;
  protected xmlParser: XMLParser;
  
  constructor(config: BartecSoapConfig) {
    this.config = config;
    
    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      parseAttributeValue: true,
      trimValues: true,
      removeNSPrefix: true, // Remove namespace prefixes for easier parsing
    });
  }
  
  /**
   * Build SOAP envelope for request.
   */
  protected buildSoapEnvelope(envelope: BartecSoapEnvelope): string {
    const params = Object.entries(envelope.parameters)
      .map(([key, value]) => `<${key}>${this.escapeXml(String(value))}</${key}>`)
      .join('');
    
    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Body>
    <${envelope.method} xmlns="${envelope.namespace}">
      ${params}
    </${envelope.method}>
  </soap:Body>
</soap:Envelope>`;
  }
  
  /**
   * Send SOAP request to Bartec API.
   */
  protected async sendSoapRequest(envelope: BartecSoapEnvelope): Promise<string> {
    const soapXml = this.buildSoapEnvelope(envelope);
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout);
    
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': `"${envelope.namespace}/${envelope.method}"`,
        'User-Agent': 'HampshireBinData/1.0 (Bartec Client)',
      };
      
      // Add basic auth if credentials provided
      if (this.config.credentials) {
        const { username, password } = this.config.credentials;
        const auth = Buffer.from(`${username}:${password}`).toString('base64');
        headers['Authorization'] = `Basic ${auth}`;
      }
      
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers,
        body: soapXml,
        signal: controller.signal,
      });
      
      clearTimeout(timeout);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.text();
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  }
  
  /**
   * Parse XML response from Bartec.
   */
  protected parseXmlResponse<T = any>(xml: string): T {
    return this.xmlParser.parse(xml);
  }
  
  /**
   * Extract SOAP fault from response if present.
   */
  protected extractSoapFault(parsed: any): BartecSoapFault | null {
    // Check for SOAP fault in standard locations
    const fault = 
      parsed?.Envelope?.Body?.Fault ||
      parsed?.['soap:Envelope']?.['soap:Body']?.['soap:Fault'] ||
      parsed?.['SOAP-ENV:Envelope']?.['SOAP-ENV:Body']?.['SOAP-ENV:Fault'];
    
    if (!fault) return null;
    
    return {
      faultCode: fault.faultcode || fault.Code || 'UNKNOWN',
      faultString: fault.faultstring || fault.Reason || 'Unknown SOAP fault',
      detail: fault.detail || fault.Detail,
    };
  }
  
  /**
   * Map Bartec service codes to canonical ServiceType.
   * 
   * Common Bartec service codes (may vary by council):
   * - RES, REFUSE → general_waste
   * - REC, RECYCLE → recycling
   * - GW, GARDEN → garden_waste
   * - FOOD → food_waste
   * - GLASS → glass
   */
  protected mapBartecServiceCode(code: string): ServiceType {
    const normalized = code.toUpperCase().trim();
    
    // General waste patterns
    if (normalized.match(/^(RES|REFUSE|RESIDUAL|WASTE|GENERAL)$/)) {
      return 'general_waste' as ServiceType;
    }
    
    // Recycling patterns
    if (normalized.match(/^(REC|RECYCLE|RECYCLING|DRY)$/)) {
      return 'recycling' as ServiceType;
    }
    
    // Garden waste patterns
    if (normalized.match(/^(GW|GARDEN|GREEN)$/)) {
      return 'garden_waste' as ServiceType;
    }
    
    // Food waste patterns
    if (normalized.match(/^(FOOD|FW|ORGANIC)$/)) {
      return 'food_waste' as ServiceType;
    }
    
    // Glass patterns
    if (normalized.match(/^(GLASS|GL)$/)) {
      return 'glass' as ServiceType;
    }
    
    // Default to unknown
    return 'other' as ServiceType;
  }
  
  /**
   * Parse Bartec date format to ISO 8601.
   * Bartec typically uses DD/MM/YYYY or ISO format.
   */
  protected parseBartecDate(dateStr: string | undefined): string | null {
    if (!dateStr) return null;
    
    const cleaned = dateStr.trim();
    
    // Try ISO format first
    if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) {
      return cleaned.split('T')[0];
    }
    
    // Try DD/MM/YYYY
    const ukMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
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
   * Escape XML special characters.
   */
  protected escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
  
  /**
   * Sanitize string from XML response.
   */
  protected sanitizeXmlString(value: unknown): string {
    if (typeof value !== 'string') {
      return String(value || '');
    }
    
    return value.trim().substring(0, 500);
  }
}
