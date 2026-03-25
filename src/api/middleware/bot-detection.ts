/**
 * Hampshire Bin Collection Data Platform
 * Bot Detection Middleware
 *
 * Detects and blocks automated bots based on User-Agent heuristics.
 * Logs blocks to audit trail. Does not reveal detection logic to clients.
 *
 * CRITICAL: This is first-line defense. Sophisticated bots can evade.
 * Use in combination with behavioral detection (enumeration, rate limiting).
 *
 * @module api/middleware/bot-detection
 */

import type { Context, Next } from 'hono';
import { auditLogger } from '../../observability/audit.js';
import { logger } from '../../observability/logger.js';

// =============================================================================
// BOT DETECTION PATTERNS
// =============================================================================

/**
 * Headless browser signatures.
 * These user-agents indicate automated browsing tools.
 */
const HEADLESS_BROWSER_PATTERNS = [
  /headlesschrome/i,
  /phantomjs/i,
  /puppeteer/i,
  /playwright/i,
  /selenium/i,
  /chromedriver/i,
  /webdriver/i,
];

/**
 * CLI tool signatures.
 * Command-line HTTP clients used for automation.
 */
const CLI_TOOL_PATTERNS = [
  /\bcurl\//i,
  /\bwget\//i,
  /python-requests/i,
  /python-urllib/i,
  /\baxios\//i,
  /node-fetch/i,
  /got\//i,
  /httpie/i,
  /insomnia/i,
  /postman/i,
];

/**
 * Web scraper signatures.
 * Known web scraping frameworks and libraries.
 */
const SCRAPER_PATTERNS = [
  /scrapy/i,
  /beautifulsoup/i,
  /mechanize/i,
  /jsdom/i,
  /cheerio/i,
  /htmlparser/i,
];

/**
 * Generic bot signatures.
 * Common keywords in bot user-agents.
 */
const GENERIC_BOT_PATTERNS = [
  /\bbot\b/i,
  /\bcrawler\b/i,
  /\bspider\b/i,
  /\bscraper\b/i,
  /\bfetcher\b/i,
  /\bindexer\b/i,
];

/**
 * Allowlist patterns.
 * Legitimate monitoring and health check tools.
 * Must be explicitly configured in environment.
 */
const getAllowlistPatterns = (): RegExp[] => {
  const allowlist = process.env.BOT_DETECTION_ALLOWLIST || '';
  if (!allowlist) {
    return [];
  }

  return allowlist.split(',').map(pattern => new RegExp(pattern.trim(), 'i'));
};

// =============================================================================
// DETECTION LOGIC
// =============================================================================

/**
 * Determine if User-Agent matches a bot pattern.
 */
function isBotUserAgent(userAgent: string): {
  isBot: boolean;
  pattern?: string;
  category?: string;
} {
  // Empty or missing User-Agent is suspicious
  if (!userAgent || userAgent.trim() === '') {
    return {
      isBot: true,
      pattern: 'empty',
      category: 'missing_ua',
    };
  }

  // Check allowlist first
  const allowlistPatterns = getAllowlistPatterns();
  for (const pattern of allowlistPatterns) {
    if (pattern.test(userAgent)) {
      return { isBot: false };
    }
  }

  // Check headless browsers
  for (const pattern of HEADLESS_BROWSER_PATTERNS) {
    if (pattern.test(userAgent)) {
      return {
        isBot: true,
        pattern: pattern.source,
        category: 'headless_browser',
      };
    }
  }

  // Check CLI tools
  for (const pattern of CLI_TOOL_PATTERNS) {
    if (pattern.test(userAgent)) {
      return {
        isBot: true,
        pattern: pattern.source,
        category: 'cli_tool',
      };
    }
  }

  // Check web scrapers
  for (const pattern of SCRAPER_PATTERNS) {
    if (pattern.test(userAgent)) {
      return {
        isBot: true,
        pattern: pattern.source,
        category: 'scraper',
      };
    }
  }

  // Check generic bot keywords
  for (const pattern of GENERIC_BOT_PATTERNS) {
    if (pattern.test(userAgent)) {
      return {
        isBot: true,
        pattern: pattern.source,
        category: 'generic_bot',
      };
    }
  }

  // No bot pattern matched
  return { isBot: false };
}

/**
 * Check if request is from a suspected bot based on additional signals.
 * (Future enhancement: timing analysis, missing headers, etc.)
 */
function hasBotCharacteristics(c: Context): boolean {
  // Check for missing common browser headers
  const hasAcceptLanguage = c.req.header('accept-language');
  const hasAcceptEncoding = c.req.header('accept-encoding');
  const hasAccept = c.req.header('accept');

  // Most browsers send these headers
  // Missing all three is suspicious
  if (!hasAcceptLanguage && !hasAcceptEncoding && !hasAccept) {
    return true;
  }

  return false;
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Bot detection middleware.
 * Should be applied early in the middleware chain, before route handlers.
 */
export async function botDetection(c: Context, next: Next): Promise<Response | void> {
  const userAgent = c.req.header('user-agent') || '';
  
  // Check User-Agent patterns
  const botCheck = isBotUserAgent(userAgent);

  if (botCheck.isBot) {
    // Get client IP (anonymised in audit log)
    const clientIp = c.req.header('x-forwarded-for')?.split(',')[0].trim()
      || c.req.header('x-real-ip')
      || 'unknown';

    // Log to audit trail
    auditLogger.log({
      eventType: 'adapter.bot_blocked' as any,
      severity: 'warning',
      actor: {
        type: 'api_client',
        ip: clientIp,
      },
      resource: {
        type: 'bot_detection',
      },
      action: 'bot_detection.blocked',
      outcome: 'blocked',
      metadata: {
        category: botCheck.category,
        pattern: botCheck.pattern,
        path: c.req.path,
        method: c.req.method,
        // Truncate UA for logging (don't log full string, may be malicious)
        userAgentPreview: userAgent.substring(0, 100),
      },
    });

    // Log details (application log, not audit trail)
    logger.warn('Bot detected and blocked', {
      category: botCheck.category,
      pattern: botCheck.pattern,
      clientIp,
      path: c.req.path,
      method: c.req.method,
    });

    // Return generic error (do not reveal detection logic)
    return c.json(
      {
        error: 'FORBIDDEN',
        message: 'Access denied',
      },
      403,
    );
  }

  // Additional bot characteristics check (not blocking, just logging)
  if (hasBotCharacteristics(c)) {
    logger.info('Suspicious bot characteristics detected', {
      userAgent: userAgent.substring(0, 100),
      path: c.req.path,
      missingHeaders: 'accept-language, accept-encoding, accept',
    });
  }

  // No bot detected, continue
  await next();
}

/**
 * Lenient bot detection for public endpoints.
 * Logs suspicious activity but does not block.
 * Use for endpoints that must remain accessible to monitoring tools.
 */
export async function lenientBotDetection(c: Context, next: Next): Promise<void> {
  const userAgent = c.req.header('user-agent') || '';
  const botCheck = isBotUserAgent(userAgent);

  if (botCheck.isBot) {
    logger.info('Bot detected on public endpoint (not blocked)', {
      category: botCheck.category,
      pattern: botCheck.pattern,
      path: c.req.path,
      userAgentPreview: userAgent.substring(0, 100),
    });
  }

  // Continue regardless of bot detection
  await next();
}

/**
 * Get bot detection statistics for an IP (admin endpoint).
 */
export function getBotDetectionStats(/* ipAnon: string */): {
  blocked: boolean;
  category?: string;
  lastBlockedAt?: string;
} {
  // TODO: Implement Redis tracking of blocked IPs
  // For now, return placeholder
  return {
    blocked: false,
  };
}
