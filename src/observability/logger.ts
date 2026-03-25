import pino, { stdSerializers, stdTimeFunctions } from 'pino';

const logLevel = process.env.LOG_LEVEL || 'info';
const isPretty = process.env.LOG_PRETTY === 'true' || process.env.NODE_ENV === 'development';

/**
 * Structured logger with sensitive field redaction
 * Redacts passwords, secrets, keys, authorization headers, cookies
 */
export const logger = pino({
  level: logLevel,
  
  // Redact sensitive fields
  redact: {
    paths: [
      '*.password',
      '*.secret',
      '*.key',
      '*.token',
      '*.apiKey',
      '*.api_key',
      'password',
      'secret',
      'authorization',
      'cookie',
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'DATABASE_URL',
      'REDIS_URL',
      'AZURE_STORAGE_CONNECTION_STRING',
      'AWS_SECRET_ACCESS_KEY'
    ],
    censor: '[REDACTED]'
  },
  
  // Custom serializers for common objects
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      // Omit sensitive headers
      headers: {
        'user-agent': req.headers['user-agent'],
        'accept': req.headers['accept'],
        'content-type': req.headers['content-type']
      },
      remoteAddress: req.ip,
      remotePort: req.socket?.remotePort
    }),
    
    res: (res) => ({
      statusCode: res.statusCode,
      // Omit set-cookie and other sensitive response headers
      headers: {
        'content-type': res.getHeader('content-type'),
        'content-length': res.getHeader('content-length')
      }
    }),
    
    err: stdSerializers.err
  },
  
  // Pretty print in development
  transport: isPretty ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname',
      singleLine: false
    }
  } : undefined,
  
  // Base fields
  base: {
    service: 'hampshire-bin-platform',
    environment: process.env.NODE_ENV || 'development'
  },
  
  // ISO timestamp
  timestamp: stdTimeFunctions.isoTime
});

/**
 * Create a child logger with additional context
 */
export function createLogger(context: Record<string, unknown>) {
  return logger.child(context);
}

/**
 * Log an error with full stack trace
 */
export function logError(error: Error, context?: Record<string, unknown>) {
  logger.error({
    err: error,
    ...context
  }, error.message);
}

/**
 * Log adapter execution
 */
export function logAdapterExecution(
  councilId: string,
  operation: string,
  metadata?: Record<string, unknown>
) {
  return logger.child({
    councilId,
    operation,
    ...metadata
  });
}
