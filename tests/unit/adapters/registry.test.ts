/**
 * Adapter Registry Unit Tests
 * 
 * Tests the adapter registry functionality:
 * - Getting adapters by council ID
 * - Kill switch behavior
 * - Adapter registration
 * - Unknown council handling
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { adapterRegistry, getAdapter, isCouncilSupported, AdapterDisabledError, initializeAdapters } from '../../../src/adapters/registry.js';

describe('Adapter Registry', () => {
  beforeAll(() => {
    // Initialize adapters before running tests
    initializeAdapters();
  });
  describe('getAdapter()', () => {
    it('should return adapter for eastleigh', () => {
      const adapter = getAdapter('eastleigh');
      expect(adapter).toBeDefined();
      expect(adapter.councilId).toBe('eastleigh');
    });

    it('should return adapter for rushmoor', () => {
      const adapter = getAdapter('rushmoor');
      expect(adapter).toBeDefined();
      expect(adapter.councilId).toBe('rushmoor');
    });

    it('should return adapter for fareham', () => {
      const adapter = getAdapter('fareham');
      expect(adapter).toBeDefined();
      expect(adapter.councilId).toBe('fareham');
    });

    it('should return adapter for east-hampshire', () => {
      const adapter = getAdapter('east-hampshire');
      expect(adapter).toBeDefined();
      expect(adapter.councilId).toBe('east-hampshire');
    });

    it('should throw AdapterDisabledError for unknown council', () => {
      expect(() => getAdapter('does-not-exist')).toThrow(AdapterDisabledError);
      expect(() => getAdapter('does-not-exist')).toThrow("Adapter 'does-not-exist' is disabled via kill switch");
    });
  });

  describe('isCouncilSupported()', () => {
    it('should return true for eastleigh', () => {
      expect(isCouncilSupported('eastleigh')).toBe(true);
    });

    it('should return true for rushmoor', () => {
      expect(isCouncilSupported('rushmoor')).toBe(true);
    });

    it('should return true for fareham', () => {
      expect(isCouncilSupported('fareham')).toBe(true);
    });

    it('should return true for basingstoke-deane (registered in test env)', () => {
      expect(isCouncilSupported('basingstoke-deane')).toBe(true);
    });

    it('should return false for unknown council', () => {
      expect(isCouncilSupported('does-not-exist')).toBe(false);
    });
  });

  describe('adapterRegistry.has()', () => {
    it('should return true for registered adapters', () => {
      expect(adapterRegistry.has('eastleigh')).toBe(true);
      expect(adapterRegistry.has('rushmoor')).toBe(true);
    });

    it('should return false for unknown adapters', () => {
      expect(adapterRegistry.has('unknown')).toBe(false);
    });
  });

  describe('adapterRegistry.listCouncils()', () => {
    it('should return array of registered council IDs', () => {
      const councils = adapterRegistry.listCouncils();
      expect(Array.isArray(councils)).toBe(true);
      expect(councils).toContain('eastleigh');
      expect(councils).toContain('rushmoor');
      expect(councils).toContain('fareham');
    });

    it('should include all 13 councils', () => {
      const councils = adapterRegistry.listCouncils();
      expect(councils.length).toBe(13);
    });
  });

  describe('Adapter capabilities', () => {
    it('eastleigh adapter should have correct capabilities', async () => {
      const adapter = getAdapter('eastleigh');
      const capabilities = await adapter.discoverCapabilities();
      
      expect(capabilities.councilId).toBe('eastleigh');
      expect(capabilities.councilName).toBe('Eastleigh Borough Council');
      expect(capabilities.supportsCollectionServices).toBe(true);
      expect(capabilities.supportsCollectionEvents).toBe(true);
      expect(capabilities.isProductionReady).toBe(true);
    });

    it('rushmoor adapter should have correct capabilities', async () => {
      const adapter = getAdapter('rushmoor');
      const capabilities = await adapter.discoverCapabilities();
      
      expect(capabilities.councilId).toBe('rushmoor');
      expect(capabilities.councilName).toBe('Rushmoor Borough Council');
      expect(capabilities.supportsAddressLookup).toBe(true);
      expect(capabilities.supportsCollectionServices).toBe(true);
      expect(capabilities.supportsCollectionEvents).toBe(true);
      expect(capabilities.isProductionReady).toBe(true);
    });
  });

  describe('Kill switch environment variable mapping', () => {
    it('should document kill switch naming convention', () => {
      // This test documents the kill switch naming convention:
      // councilId: basingstoke-deane → ADAPTER_KILL_SWITCH_BASINGSTOKE_DEANE
      // councilId: east-hampshire → ADAPTER_KILL_SWITCH_EAST_HAMPSHIRE
      
      // In test environment, kill switches are NOT set, so all adapters are registered
      expect(isCouncilSupported('basingstoke-deane')).toBe(true);
      expect(isCouncilSupported('east-hampshire')).toBe(true);
      
      // In production, setting ADAPTER_KILL_SWITCH_BASINGSTOKE_DEANE=true
      // would prevent the adapter from being registered
    });
  });
});
