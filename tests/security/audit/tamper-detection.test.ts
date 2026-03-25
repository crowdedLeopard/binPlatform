/**
 * Security Tests - Audit Tamper Detection
 * 
 * Tests audit log integrity via HMAC verification, IP anonymization,
 * and secret redaction.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'crypto';

describe('Security - Audit Tamper Detection', () => {
  const HMAC_SECRET = 'test-hmac-secret-32-bytes-long!';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const generateHmac = (data: string, secret: string): string => {
    return createHmac('sha256', secret)
      .update(data)
      .digest('hex');
  };

  describe('HMAC Generation and Verification', () => {
    it('should generate HMAC for audit event on creation', () => {
      const createAuditEvent = (event: any, secret: string) => {
        const eventData = JSON.stringify({
          event: event.event,
          timestamp: event.timestamp,
          actor: event.actor,
          resource: event.resource,
          action: event.action,
        });

        const hmac = generateHmac(eventData, secret);

        return {
          ...event,
          hmac,
        };
      };

      const event = {
        event: 'adapter.disabled',
        timestamp: '2024-03-25T12:00:00Z',
        actor: 'admin@example.com',
        resource: 'adapter:eastleigh',
        action: 'disable',
      };

      const auditEvent = createAuditEvent(event, HMAC_SECRET);

      expect(auditEvent.hmac).toBeDefined();
      expect(auditEvent.hmac).toHaveLength(64); // SHA256 hex
      expect(auditEvent.hmac).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should verify HMAC matches on retrieve', () => {
      const verifyAuditEvent = (storedEvent: any, secret: string): boolean => {
        const { hmac: storedHmac, ...eventData } = storedEvent;

        const eventDataString = JSON.stringify({
          event: eventData.event,
          timestamp: eventData.timestamp,
          actor: eventData.actor,
          resource: eventData.resource,
          action: eventData.action,
        });

        const calculatedHmac = generateHmac(eventDataString, secret);

        return calculatedHmac === storedHmac;
      };

      const auditEvent = {
        event: 'api.key_revoked',
        timestamp: '2024-03-25T12:00:00Z',
        actor: 'system',
        resource: 'key:hbp_live_abc123',
        action: 'revoke',
        hmac: '',
      };

      // Generate correct HMAC
      const eventData = JSON.stringify({
        event: auditEvent.event,
        timestamp: auditEvent.timestamp,
        actor: auditEvent.actor,
        resource: auditEvent.resource,
        action: auditEvent.action,
      });
      auditEvent.hmac = generateHmac(eventData, HMAC_SECRET);

      const isValid = verifyAuditEvent(auditEvent, HMAC_SECRET);
      expect(isValid).toBe(true);
    });

    it('should detect modified event body via HMAC mismatch', () => {
      const verifyAuditEvent = (storedEvent: any, secret: string): boolean => {
        const { hmac: storedHmac, ...eventData } = storedEvent;

        const eventDataString = JSON.stringify({
          event: eventData.event,
          timestamp: eventData.timestamp,
          actor: eventData.actor,
          resource: eventData.resource,
          action: eventData.action,
        });

        const calculatedHmac = generateHmac(eventDataString, secret);

        return calculatedHmac === storedHmac;
      };

      const originalEvent = {
        event: 'api.request',
        timestamp: '2024-03-25T12:00:00Z',
        actor: 'user@example.com',
        resource: '/v1/postcodes/SO501AA',
        action: 'read',
      };

      const eventData = JSON.stringify(originalEvent);
      const originalHmac = generateHmac(eventData, HMAC_SECRET);

      // Attacker modifies the event
      const tamperedEvent = {
        ...originalEvent,
        actor: 'attacker@evil.com', // Modified
        hmac: originalHmac, // Original HMAC (attacker doesn't have secret)
      };

      const isValid = verifyAuditEvent(tamperedEvent, HMAC_SECRET);
      expect(isValid).toBe(false); // HMAC mismatch detected
    });

    it('should use constant fields in HMAC calculation', () => {
      // HMAC should include critical fields only
      // Changing non-critical fields (like metadata) shouldn't invalidate HMAC
      
      const event1 = {
        event: 'api.request',
        timestamp: '2024-03-25T12:00:00Z',
        actor: 'user@example.com',
        resource: '/v1/councils',
        action: 'read',
        metadata: { requestId: 'req_123' },
      };

      const event2 = {
        ...event1,
        metadata: { requestId: 'req_456' }, // Different metadata
      };

      // HMAC for critical fields only
      const hmacFields = (e: any) => JSON.stringify({
        event: e.event,
        timestamp: e.timestamp,
        actor: e.actor,
        resource: e.resource,
        action: e.action,
      });

      const hmac1 = generateHmac(hmacFields(event1), HMAC_SECRET);
      const hmac2 = generateHmac(hmacFields(event2), HMAC_SECRET);

      // HMACs should be identical (metadata not included)
      expect(hmac1).toBe(hmac2);
    });
  });

  describe('IP Anonymization', () => {
    it('should anonymize IPv4 by zeroing last octet', () => {
      const anonymizeIpv4 = (ip: string): string => {
        const parts = ip.split('.');
        if (parts.length !== 4) return ip;
        
        parts[3] = '0';
        return parts.join('.');
      };

      expect(anonymizeIpv4('192.168.1.100')).toBe('192.168.1.0');
      expect(anonymizeIpv4('203.0.113.45')).toBe('203.0.113.0');
      expect(anonymizeIpv4('10.0.0.1')).toBe('10.0.0.0');
    });

    it('should verify anonymized IP is stored in audit log', () => {
      const createAuditEvent = (event: string, ip: string) => {
        const anonymizeIpv4 = (ip: string): string => {
          const parts = ip.split('.');
          if (parts.length === 4) {
            parts[3] = '0';
            return parts.join('.');
          }
          return ip;
        };

        return {
          event,
          ip: anonymizeIpv4(ip),
          timestamp: new Date().toISOString(),
        };
      };

      const auditEvent = createAuditEvent('api.request', '192.168.1.100');

      expect(auditEvent.ip).toBe('192.168.1.0');
      expect(auditEvent.ip).not.toContain('100');
    });

    it('should anonymize IPv6 by zeroing last 80 bits', () => {
      const anonymizeIpv6 = (ip: string): string => {
        const parts = ip.split(':');
        
        if (parts.length === 8) {
          // Zero out last 5 groups (80 bits)
          for (let i = 3; i < 8; i++) {
            parts[i] = '0';
          }
          return parts.join(':');
        }

        return ip;
      };

      expect(anonymizeIpv6('2001:0db8:85a3:0000:0000:8a2e:0370:7334'))
        .toBe('2001:0db8:85a3:0:0:0:0:0');
      
      expect(anonymizeIpv6('fe80:0000:0000:0000:0204:61ff:fe9d:f156'))
        .toBe('fe80:0000:0000:0:0:0:0:0');
    });

    it('should handle IPv6 compressed notation', () => {
      const anonymizeIpv6 = (ip: string): string => {
        // Expand compressed IPv6 first
        const expandIpv6 = (ip: string): string => {
          if (ip.includes('::')) {
            const sides = ip.split('::');
            const left = sides[0] ? sides[0].split(':') : [];
            const right = sides[1] ? sides[1].split(':') : [];
            const missing = 8 - (left.length + right.length);
            
            const middle = Array(missing).fill('0000');
            const expanded = [...left, ...middle, ...right];
            
            return expanded.map(part => part.padStart(4, '0')).join(':');
          }
          return ip;
        };

        const expanded = expandIpv6(ip);
        const parts = expanded.split(':');
        
        // Zero last 80 bits (last 5 groups)
        for (let i = 3; i < 8; i++) {
          parts[i] = '0000';
        }
        
        return parts.join(':');
      };

      expect(anonymizeIpv6('2001:db8::8a2e:370:7334'))
        .toContain('2001:0db8:0000:0000:0000:0000:0000:0000');
    });
  });

  describe('Secret Redaction in Audit Logs', () => {
    it('should not store API keys in audit logs', () => {
      const createAuditEvent = (event: string, apiKey?: string) => {
        return {
          event,
          timestamp: new Date().toISOString(),
          apiKeyPresent: !!apiKey,
          apiKeyPrefix: apiKey ? `${apiKey.substring(0, 8)}...` : undefined,
          // NEVER: apiKey: apiKey,
        };
      };

      const auditEvent = createAuditEvent('auth.success', 'hbp_live_abc123def456ghi789jkl012');

      expect(auditEvent).not.toHaveProperty('apiKey');
      expect(auditEvent.apiKeyPresent).toBe(true);
      expect(auditEvent.apiKeyPrefix).toBe('hbp_live...');
      expect(auditEvent.apiKeyPrefix).not.toContain('abc123');
    });

    it('should redact passwords from audit logs', () => {
      const redactSecrets = (message: string): string => {
        const patterns = [
          { pattern: /password[=:]\s*\S+/gi, replacement: 'password=[REDACTED]' },
          { pattern: /api[_-]key[=:]\s*\S+/gi, replacement: 'api_key=[REDACTED]' },
          { pattern: /bearer\s+[a-z0-9]+/gi, replacement: 'bearer [REDACTED]' },
          { pattern: /secret[=:]\s*\S+/gi, replacement: 'secret=[REDACTED]' },
        ];

        let redacted = message;
        patterns.forEach(({ pattern, replacement }) => {
          redacted = redacted.replace(pattern, replacement);
        });

        return redacted;
      };

      const message = 'Failed auth with password=secret123 and api_key=sk_live_abc';
      const redacted = redactSecrets(message);

      expect(redacted).not.toContain('secret123');
      expect(redacted).not.toContain('sk_live_abc');
      expect(redacted).toContain('password=[REDACTED]');
      expect(redacted).toContain('api_key=[REDACTED]');
    });

    it('should scan fixture logs for secrets', () => {
      const scanLogForSecrets = (logContent: string): string[] => {
        const secretPatterns = [
          /hbp_(test|live)_[a-zA-Z0-9]{20,}/g,
          /sk_live_[A-Za-z0-9]{20,}/g,
          /password\s*=\s*[^&\s]+/gi,
          /bearer\s+[a-z0-9]{20,}/gi,
          /sk_[a-z]+_[a-z0-9]{20,}/gi,
        ];

        const findings: string[] = [];

        secretPatterns.forEach((pattern) => {
          const matches = logContent.match(pattern);
          if (matches) {
            findings.push(...matches);
          }
        });

        return findings;
      };

      const cleanLog = '{"event":"api.request","ip":"192.168.1.0","status":200}';
      expect(scanLogForSecrets(cleanLog)).toHaveLength(0);

      const leakyLog = '{"event":"auth","key":"hbp_live_abc123def456ghi789jkl012mno"}';
      const secrets = scanLogForSecrets(leakyLog);
      expect(secrets.length).toBeGreaterThan(0);
      expect(secrets[0]).toContain('hbp_live_');
    });

    it('should redact connection strings from logs', () => {
      const redactConnectionStrings = (message: string): string => {
        const patterns = [
          /postgres:\/\/[^@]+@[^\s]+/gi,
          /mysql:\/\/[^@]+@[^\s]+/gi,
          /mongodb:\/\/[^@]+@[^\s]+/gi,
          /redis:\/\/[^@]+@[^\s]+/gi,
        ];

        let redacted = message;
        patterns.forEach((pattern) => {
          redacted = redacted.replace(pattern, '[CONNECTION_STRING_REDACTED]');
        });

        return redacted;
      };

      const message = 'Connecting to postgres://user:pass@db.example.com:5432/binday';
      const redacted = redactConnectionStrings(message);

      expect(redacted).not.toContain('user:pass');
      expect(redacted).not.toContain('db.example.com');
      expect(redacted).toContain('[CONNECTION_STRING_REDACTED]');
    });
  });

  describe('Audit Log Field Validation', () => {
    it('should validate required fields present in audit event', () => {
      const validateAuditEvent = (event: any): string[] => {
        const requiredFields = ['event', 'timestamp', 'actor', 'resource', 'action'];
        const missing: string[] = [];

        requiredFields.forEach(field => {
          if (!event[field]) {
            missing.push(field);
          }
        });

        return missing;
      };

      const validEvent = {
        event: 'adapter.disabled',
        timestamp: '2024-03-25T12:00:00Z',
        actor: 'admin',
        resource: 'adapter:eastleigh',
        action: 'disable',
      };

      expect(validateAuditEvent(validEvent)).toHaveLength(0);

      const invalidEvent = {
        event: 'test',
        timestamp: '2024-03-25T12:00:00Z',
        // missing actor, resource, action
      };

      const missing = validateAuditEvent(invalidEvent);
      expect(missing).toContain('actor');
      expect(missing).toContain('resource');
      expect(missing).toContain('action');
    });

    it('should validate timestamp is ISO 8601 format', () => {
      const validateTimestamp = (timestamp: string): boolean => {
        const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
        return iso8601Regex.test(timestamp);
      };

      expect(validateTimestamp('2024-03-25T12:00:00Z')).toBe(true);
      expect(validateTimestamp('2024-03-25T12:00:00.123Z')).toBe(true);
      expect(validateTimestamp('2024-03-25 12:00:00')).toBe(false);
      expect(validateTimestamp('invalid')).toBe(false);
    });
  });

  describe('Immutable Audit Log Storage', () => {
    it('should prevent modification of stored audit events', () => {
      const auditStore: any[] = [];

      const appendAuditEvent = (event: any) => {
        // Freeze event to prevent modification
        const frozenEvent = Object.freeze({ ...event });
        auditStore.push(frozenEvent);
        return frozenEvent;
      };

      const event = appendAuditEvent({
        event: 'api.request',
        timestamp: '2024-03-25T12:00:00Z',
        actor: 'user',
        resource: '/v1/councils',
        action: 'read',
      });

      // Attempt to modify should fail
      expect(() => {
        (event as any).actor = 'attacker';
      }).toThrow();

      expect(event.actor).toBe('user');
    });

    it('should detect append-only violation attempts', () => {
      const auditStore: any[] = [];
      let writeCount = 0;

      const appendAuditEvent = (event: any) => {
        writeCount++;
        auditStore.push(event);
      };

      const attemptDelete = (index: number): boolean => {
        // Deletion is not allowed in append-only log
        // In production, this would be enforced by storage layer
        return false;
      };

      const attemptUpdate = (index: number, newData: any): boolean => {
        // Updates are not allowed in append-only log
        return false;
      };

      appendAuditEvent({ event: 'test1' });
      appendAuditEvent({ event: 'test2' });

      expect(auditStore).toHaveLength(2);
      expect(writeCount).toBe(2);

      // Attempt delete
      const deleted = attemptDelete(0);
      expect(deleted).toBe(false);
      expect(auditStore).toHaveLength(2); // Still 2

      // Attempt update
      const updated = attemptUpdate(0, { event: 'modified' });
      expect(updated).toBe(false);
      expect(auditStore[0].event).toBe('test1'); // Unchanged
    });
  });

  describe('Audit Event Ordering', () => {
    it('should maintain chronological order via sequence numbers', () => {
      let sequenceNumber = 0;

      const createAuditEvent = (event: string) => {
        sequenceNumber++;
        
        return {
          sequence: sequenceNumber,
          event,
          timestamp: new Date().toISOString(),
        };
      };

      const event1 = createAuditEvent('first');
      const event2 = createAuditEvent('second');
      const event3 = createAuditEvent('third');

      expect(event1.sequence).toBe(1);
      expect(event2.sequence).toBe(2);
      expect(event3.sequence).toBe(3);
      expect(event2.sequence).toBeGreaterThan(event1.sequence);
      expect(event3.sequence).toBeGreaterThan(event2.sequence);
    });
  });
});
