// Logger utility with Winston and file transports (matching backend patterns)
import { createLogger, format, transports, Logger as WinstonLogger } from 'winston';
import config from '../config/config';

interface LogData {
  [key: string]: unknown;
}

interface Logger {
  info: (message: string, data?: LogData) => void;
  error: (message: string, data?: LogData) => void;
  warn: (message: string, data?: LogData) => void;
  debug: (message: string, data?: LogData) => void;
}

const isCloudEnv = ['prod', 'production', 'pre-prod', 'staging', 'dev', 'development'].includes(
  process.env.NODE_ENV || ''
);

const logLevel = config.server?.logLevel || process.env.LOG_LEVEL || (isCloudEnv ? 'info' : 'debug');

// Create Winston logger instance
const winstonLogger: WinstonLogger = createLogger({
  level: logLevel,
  format: format.combine(
    format.timestamp(),
    format.printf(({ timestamp, level, message, module, ...meta }) => {
      const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
      return `${timestamp} [${level}] [${module || 'unknown'}] ${message}${metaStr}`;
    })
  ),
  transports: []
});

// Add file transports only for local/non-cloud environments
if (!isCloudEnv) {
  winstonLogger.add(new transports.File({ filename: 'logs/error.log', level: 'error' }));
  winstonLogger.add(new transports.File({ filename: 'logs/combined.log' }));
}

// Always add console transport
if (isCloudEnv) {
  winstonLogger.add(new transports.Console({
    format: format.combine(
      format.timestamp(),
      format.json()
    ),
  }));
} else {
  winstonLogger.add(new transports.Console({
    format: format.combine(
      format.colorize(),
      format.printf(({ timestamp, level, message, module, ...meta }) => {
        const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
        return `${timestamp} [${level}] [${module || 'unknown'}] ${message}${metaStr}`;
      })
    ),
  }));
}

/**
 * Sanitize log data to prevent sensitive information leakage
 */
function sanitizeData(data: unknown): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => sanitizeData(item));
  }

  // Type guard for object
  const dataAsRecord = data as Record<string, unknown>;
  const sanitized: Record<string, unknown> = { ...dataAsRecord };
  const sensitiveKeys = [
    'password',
    'secret',
    'token',
    'apikey',
    'api_key',
    'authorization',
    'auth',
    'credit_card',
    'creditcard',
    'cvv',
    'ssn',
    'private_key',
    'privatekey',
    'webhook_secret',
    'signing_key',
    'signingkey',
  ];

  for (const key of Object.keys(sanitized)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some((sensitive) => lowerKey.includes(sensitive))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizeData(sanitized[key]);
    }
  }

  return sanitized;
}

function getLogger(module: NodeModule): Logger {
  const moduleName = module.filename ? module.filename.split(/[/\\]/).pop() : 'unknown';

  return {
    info: (message: string, data: LogData = {}): void => {
      const sanitizedData = sanitizeData(data) as Record<string, unknown>;
      winstonLogger.info(message, { module: moduleName, ...sanitizedData });
    },
    error: (message: string, data: LogData = {}): void => {
      const sanitizedData = sanitizeData(data) as Record<string, unknown>;
      winstonLogger.error(message, { module: moduleName, ...sanitizedData });
    },
    warn: (message: string, data: LogData = {}): void => {
      const sanitizedData = sanitizeData(data) as Record<string, unknown>;
      winstonLogger.warn(message, { module: moduleName, ...sanitizedData });
    },
    debug: (message: string, data: LogData = {}): void => {
      const sanitizedData = sanitizeData(data) as Record<string, unknown>;
      winstonLogger.debug(message, { module: moduleName, ...sanitizedData });
    },
  };
}

export default getLogger;
