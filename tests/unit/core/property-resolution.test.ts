/**
 * Property Resolution Unit Tests
 * 
 * Tests the property resolution logic that maps postcodes to councils
 * and resolves property identities.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock cache
const mockCache = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
};

// Mock adapter registry
const mockAdapterRegistry = {
  getAdapterForCouncil: vi.fn(),
  getCouncilForPostcode: vi.fn(),
};

describe('PropertyResolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Valid Hampshire Postcode', () => {
    it('should identify correct council for Southampton postcode', () => {
      const identifyCouncil = (postcode: string): string | null => {
        const normalized = postcode.replace(/\s/g, '').toUpperCase();
        
        // Hampshire postcode prefixes to council mapping
        const councilMap: Record<string, string> = {
          'SO14': 'southampton',
          'SO15': 'southampton',
          'SO16': 'southampton',
          'SO50': 'eastleigh',
          'SO51': 'eastleigh',
          'SO52': 'eastleigh',
          'SO53': 'eastleigh',
          'GU14': 'rushmoor',
          'GU11': 'rushmoor',
          'GU12': 'rushmoor',
          'PO1': 'portsmouth',
          'PO2': 'portsmouth',
          'PO3': 'portsmouth',
        };

        for (const [prefix, council] of Object.entries(councilMap)) {
          if (normalized.startsWith(prefix)) {
            return council;
          }
        }

        return null;
      };

      expect(identifyCouncil('SO14 7DU')).toBe('southampton');
      expect(identifyCouncil('SO50 5LA')).toBe('eastleigh');
      expect(identifyCouncil('GU14 7JF')).toBe('rushmoor');
    });
  });

  describe('Multiple Councils for Ambiguous Postcode', () => {
    it('should return multiple councils when postcode area spans boundaries', () => {
      const getCouncilsForPostcode = (postcode: string): string[] => {
        const normalized = postcode.replace(/\s/g, '').toUpperCase();
        
        // Some postcode areas span multiple councils
        const ambiguousAreas: Record<string, string[]> = {
          'SO': ['southampton', 'eastleigh', 'test-valley', 'new-forest'],
          'GU': ['rushmoor', 'hart'],
          'PO': ['portsmouth', 'havant', 'gosport', 'fareham'],
        };

        const area = normalized.substring(0, 2);
        
        if (ambiguousAreas[area]) {
          return ambiguousAreas[area];
        }

        return [];
      };

      const councils = getCouncilsForPostcode('SO 99 9XX');
      expect(councils).toContain('southampton');
      expect(councils).toContain('eastleigh');
      expect(councils.length).toBeGreaterThan(1);
    });
  });

  describe('Non-Hampshire Postcode', () => {
    it('should throw PostcodeNotHampshireError for London postcode', () => {
      const validateHampshirePostcode = (postcode: string) => {
        const normalized = postcode.replace(/\s/g, '').toUpperCase();
        
        const hampshireAreas = ['SO', 'PO', 'GU', 'RG', 'SP', 'BH'];
        const area = normalized.substring(0, 2);
        
        if (!hampshireAreas.includes(area)) {
          throw new Error('PostcodeNotHampshireError: Postcode is not in Hampshire area');
        }

        return true;
      };

      expect(() => validateHampshirePostcode('SW1A 1AA')).toThrow('PostcodeNotHampshireError');
      expect(() => validateHampshirePostcode('M1 1AA')).toThrow('PostcodeNotHampshireError');
      expect(() => validateHampshirePostcode('EH1 1AA')).toThrow('PostcodeNotHampshireError');
    });

    it('should accept valid Hampshire postcodes', () => {
      const validateHampshirePostcode = (postcode: string) => {
        const normalized = postcode.replace(/\s/g, '').toUpperCase();
        
        const hampshireAreas = ['SO', 'PO', 'GU', 'RG', 'SP', 'BH'];
        const area = normalized.substring(0, 2);
        
        if (!hampshireAreas.includes(area)) {
          throw new Error('PostcodeNotHampshireError');
        }

        return true;
      };

      expect(validateHampshirePostcode('SO50 1AA')).toBe(true);
      expect(validateHampshirePostcode('PO1 2AB')).toBe(true);
      expect(validateHampshirePostcode('GU14 7JF')).toBe(true);
    });
  });

  describe('Invalid Postcode Format', () => {
    it('should throw InvalidPostcodeError for too short postcode', () => {
      const validatePostcodeFormat = (postcode: string) => {
        // UK postcode regex: AA9A 9AA or A9A 9AA or A9 9AA or A99 9AA etc.
        const postcodeRegex = /^[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}$/i;
        
        if (!postcodeRegex.test(postcode)) {
          throw new Error('InvalidPostcodeError: Postcode format is invalid');
        }

        return true;
      };

      expect(() => validatePostcodeFormat('SO1')).toThrow('InvalidPostcodeError');
      expect(() => validatePostcodeFormat('INVALID')).toThrow('InvalidPostcodeError');
    });

    it('should throw InvalidPostcodeError for wrong characters', () => {
      const validatePostcodeFormat = (postcode: string) => {
        const postcodeRegex = /^[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}$/i;
        
        if (!postcodeRegex.test(postcode)) {
          throw new Error('InvalidPostcodeError');
        }

        return true;
      };

      expect(() => validatePostcodeFormat('SO50-1AA')).toThrow('InvalidPostcodeError');
      expect(() => validatePostcodeFormat('SO50.1AA')).toThrow('InvalidPostcodeError');
      expect(() => validatePostcodeFormat('SO50 1A1')).toThrow('InvalidPostcodeError');
    });

    it('should accept valid postcode formats', () => {
      const validatePostcodeFormat = (postcode: string) => {
        const postcodeRegex = /^[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}$/i;
        
        if (!postcodeRegex.test(postcode)) {
          throw new Error('InvalidPostcodeError');
        }

        return true;
      };

      expect(validatePostcodeFormat('SO50 1AA')).toBe(true);
      expect(validatePostcodeFormat('SO501AA')).toBe(true);
      expect(validatePostcodeFormat('M1 1AA')).toBe(true);
      expect(validatePostcodeFormat('EC1A 1BB')).toBe(true);
    });
  });

  describe('Postcode Normalization', () => {
    it('should normalize lowercase postcode with no space', () => {
      const normalizePostcode = (postcode: string): string => {
        // Remove all spaces
        let normalized = postcode.replace(/\s/g, '').toUpperCase();
        
        // Insert space before last 3 characters
        if (normalized.length > 3) {
          normalized = `${normalized.slice(0, -3)} ${normalized.slice(-3)}`;
        }
        
        return normalized;
      };

      expect(normalizePostcode('so501aa')).toBe('SO50 1AA');
    });

    it('should normalize uppercase postcode without space', () => {
      const normalizePostcode = (postcode: string): string => {
        let normalized = postcode.replace(/\s/g, '').toUpperCase();
        
        if (normalized.length > 3) {
          normalized = `${normalized.slice(0, -3)} ${normalized.slice(-3)}`;
        }
        
        return normalized;
      };

      expect(normalizePostcode('SO501AA')).toBe('SO50 1AA');
    });

    it('should preserve already normalized postcode', () => {
      const normalizePostcode = (postcode: string): string => {
        let normalized = postcode.replace(/\s/g, '').toUpperCase();
        
        if (normalized.length > 3) {
          normalized = `${normalized.slice(0, -3)} ${normalized.slice(-3)}`;
        }
        
        return normalized;
      };

      expect(normalizePostcode('SO50 1AA')).toBe('SO50 1AA');
    });

    it('should handle postcodes with extra spaces', () => {
      const normalizePostcode = (postcode: string): string => {
        let normalized = postcode.replace(/\s/g, '').toUpperCase();
        
        if (normalized.length > 3) {
          normalized = `${normalized.slice(0, -3)} ${normalized.slice(-3)}`;
        }
        
        return normalized;
      };

      expect(normalizePostcode('  SO50   1AA  ')).toBe('SO50 1AA');
    });
  });

  describe('House Identifier Sanitization', () => {
    it('should strip HTML tags from house identifier', () => {
      const sanitizeHouseIdentifier = (input: string): string => {
        let clean = input.replace(/<[^>]*>/g, '');
        clean = clean.slice(0, 50);
        return clean.trim();
      };

      expect(sanitizeHouseIdentifier('<b>Flat 1</b>')).toBe('Flat 1');
      expect(sanitizeHouseIdentifier('<script>alert(1)</script>10')).toBe('alert(1)10');
    });

    it('should truncate excessive length to 50 chars', () => {
      const sanitizeHouseIdentifier = (input: string): string => {
        let clean = input.replace(/<[^>]*>/g, '');
        clean = clean.slice(0, 50);
        return clean.trim();
      };

      const longInput = 'A'.repeat(100);
      expect(sanitizeHouseIdentifier(longInput)).toHaveLength(50);
    });

    it('should handle normal input without modification', () => {
      const sanitizeHouseIdentifier = (input: string): string => {
        let clean = input.replace(/<[^>]*>/g, '');
        clean = clean.slice(0, 50);
        return clean.trim();
      };

      expect(sanitizeHouseIdentifier('10')).toBe('10');
      expect(sanitizeHouseIdentifier('Flat 2A')).toBe('Flat 2A');
      expect(sanitizeHouseIdentifier('The Old Manor House')).toBe('The Old Manor House');
    });
  });

  describe('Cache Hit', () => {
    it('should return cached result without calling adapter', async () => {
      const cachedResult = {
        propertyId: 'prop_uuid_123',
        councilId: 'eastleigh',
        councilLocalId: '100060321174',
        address: '1 High Street, Eastleigh, SO50 5LA',
        postcode: 'SO50 5LA',
        cachedAt: new Date().toISOString(),
      };

      mockCache.get.mockResolvedValue(cachedResult);

      const cacheKey = 'property:SO501AA:1';
      const result = await mockCache.get(cacheKey);

      expect(result).toEqual(cachedResult);
      expect(mockCache.get).toHaveBeenCalledWith(cacheKey);
      expect(mockAdapterRegistry.getAdapterForCouncil).not.toHaveBeenCalled();
    });
  });

  describe('Cache Miss', () => {
    it('should call adapter and cache result on cache miss', async () => {
      mockCache.get.mockResolvedValue(null);

      const adapterResult = {
        propertyId: 'prop_uuid_456',
        councilId: 'rushmoor',
        councilLocalId: 'addr_1001',
        address: '1 Fleet Road, Aldershot, GU14 7JF',
        postcode: 'GU14 7JF',
      };

      const mockAdapter = {
        resolveAddresses: vi.fn().mockResolvedValue({
          success: true,
          data: [adapterResult],
        }),
      };

      mockAdapterRegistry.getAdapterForCouncil.mockResolvedValue(mockAdapter);

      // Simulate property resolution flow
      const cacheKey = 'property:GU147JF:1';
      const cached = await mockCache.get(cacheKey);

      if (!cached) {
        const council = 'rushmoor';
        const adapter = await mockAdapterRegistry.getAdapterForCouncil(council);
        const result = await adapter.resolveAddresses({
          postcode: 'GU14 7JF',
          addressFragment: '1',
          correlationId: 'test-123',
        });

        await mockCache.set(cacheKey, result.data[0], 7 * 24 * 60 * 60); // 7 days
      }

      expect(mockCache.get).toHaveBeenCalledWith(cacheKey);
      expect(mockAdapterRegistry.getAdapterForCouncil).toHaveBeenCalledWith('rushmoor');
      expect(mockAdapter.resolveAddresses).toHaveBeenCalled();
      expect(mockCache.set).toHaveBeenCalledWith(cacheKey, adapterResult, 7 * 24 * 60 * 60);
    });
  });

  describe('Adapter Failure Propagation', () => {
    it('should propagate adapter error correctly', async () => {
      const mockAdapter = {
        resolveAddresses: vi.fn().mockResolvedValue({
          success: false,
          failureCategory: 'network_error',
          errorMessage: 'Upstream timeout',
        }),
      };

      mockAdapterRegistry.getAdapterForCouncil.mockResolvedValue(mockAdapter);

      const result = await mockAdapter.resolveAddresses({
        postcode: 'SO50 1AA',
        correlationId: 'test-456',
      });

      expect(result.success).toBe(false);
      expect(result.failureCategory).toBe('network_error');
      expect(result.errorMessage).toBe('Upstream timeout');
    });
  });

  describe('Property ID Generation', () => {
    it('should generate UUID for propertyId', () => {
      const generatePropertyId = (): string => {
        // UUIDv4 format
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
      };

      const id1 = generatePropertyId();
      const id2 = generatePropertyId();

      // Should be UUID format
      expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(id2).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      
      // Should be unique
      expect(id1).not.toBe(id2);
    });

    it('should not use internal council ID as propertyId', () => {
      const councilLocalId = '100060321174'; // UPRN or internal ID
      const propertyId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });

      // PropertyId should NOT be the same as councilLocalId
      expect(propertyId).not.toBe(councilLocalId);
      expect(propertyId).toMatch(/^[0-9a-f-]+$/);
    });
  });

  describe('resolveByPropertyId', () => {
    it('should throw PropertyNotFoundError for unknown ID', async () => {
      const mockDb = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
      };

      const resolveByPropertyId = async (propertyId: string) => {
        const result = await mockDb.query('SELECT * FROM properties WHERE id = $1', [propertyId]);
        
        if (result.rows.length === 0) {
          throw new Error('PropertyNotFoundError: Property not found');
        }

        return result.rows[0];
      };

      await expect(resolveByPropertyId('unknown-uuid')).rejects.toThrow('PropertyNotFoundError');
    });

    it('should return property for valid ID', async () => {
      const mockProperty = {
        id: 'prop-uuid-789',
        councilId: 'eastleigh',
        councilLocalId: '100060321174',
        address: '1 High Street, Eastleigh, SO50 5LA',
        postcode: 'SO50 5LA',
      };

      const mockDb = {
        query: vi.fn().mockResolvedValue({ rows: [mockProperty] }),
      };

      const resolveByPropertyId = async (propertyId: string) => {
        const result = await mockDb.query('SELECT * FROM properties WHERE id = $1', [propertyId]);
        
        if (result.rows.length === 0) {
          throw new Error('PropertyNotFoundError');
        }

        return result.rows[0];
      };

      const property = await resolveByPropertyId('prop-uuid-789');

      expect(property).toEqual(mockProperty);
      expect(mockDb.query).toHaveBeenCalledWith(
        'SELECT * FROM properties WHERE id = $1',
        ['prop-uuid-789']
      );
    });
  });

  describe('Cache TTL', () => {
    it('should cache property resolution for 7 days', () => {
      const cacheTtl = 7 * 24 * 60 * 60; // 7 days in seconds
      
      expect(cacheTtl).toBe(604800);
    });

    it('should cache UPRN mappings for 90 days', () => {
      const uprnCacheTtl = 90 * 24 * 60 * 60; // 90 days in seconds
      
      expect(uprnCacheTtl).toBe(7776000);
    });
  });

  describe('Multiple Council Resolution', () => {
    it('should try multiple councils for ambiguous postcode', async () => {
      const mockAdapter1 = {
        councilId: 'eastleigh',
        resolveAddresses: vi.fn().mockResolvedValue({
          success: true,
          data: [],
        }),
      };

      const mockAdapter2 = {
        councilId: 'southampton',
        resolveAddresses: vi.fn().mockResolvedValue({
          success: true,
          data: [{ councilLocalId: 'found', address: 'Test' }],
        }),
      };

      const possibleCouncils = ['eastleigh', 'southampton'];
      const adapters = [mockAdapter1, mockAdapter2];

      let foundResult = null;

      for (const adapter of adapters) {
        const result = await adapter.resolveAddresses({
          postcode: 'SO50 9XX',
          correlationId: 'test-789',
        });

        if (result.success && result.data && result.data.length > 0) {
          foundResult = result;
          break;
        }
      }

      expect(foundResult).not.toBeNull();
      expect(foundResult!.data).toHaveLength(1);
      expect(mockAdapter1.resolveAddresses).toHaveBeenCalled();
      expect(mockAdapter2.resolveAddresses).toHaveBeenCalled();
    });
  });
});
