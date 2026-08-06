// Logger utility with Winston and file transports (matching backend patterns)
import { createLogger, format, transports, Logger as WinstonLogger } from 'winston';
import config from '../config/config';
import { getRequestContext } from '../middlewares/requestContext';

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

const isProdEnv = ['prod', 'production'].includes(process.env.NODE_ENV || '');

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


function filterByEnvironment(data: Record<string, unknown>): Record<string, unknown> {
  if (!isCloudEnv) {
    return data;
  }

  const filtered = { ...data };
  const cloudExcludedFields = [
    'query',
    'headers',
    'user_agent',
    'source_ip',
  ];

  for (const field of cloudExcludedFields) {
    if (field in filtered) {
      delete filtered[field];
    }
  }

  if (isProdEnv && 'stack' in filtered) {
    delete filtered.stack;
  }

  return filtered;
}

/**
 * Enrich log data with request context.
 * ECS metadata is intentionally omitted — CloudWatch already tags the log stream.
 */
function enrichLogData(data: LogData, moduleName: string): Record<string, unknown> {
  const context = getRequestContext();

  let enriched: Record<string, unknown> = {
    module: moduleName,
    ...data,
  };

  if (context) {
    enriched = {
      ...enriched,
      request_id: context.request_id,
      method: context.method,
      path: context.path,
      correlation_id: context.correlation_id,
      // IP / UA only for local debugging — never attached in cloud envs
      ...(isCloudEnv ? {} : {
        user_agent: context.user_agent,
        source_ip: context.source_ip,
      }),
    };
  }

  return enriched;
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
    'signature',
    'pay-signature',
    'x-webhook-signature',
    'email',
    'card_details',
    'cardholder',
    'billing_address',
    'body',
    'payload',
    'raw_payload',
    'rawbody',
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
  const moduleName = module.filename ? module.filename.split(/[/\\]/).pop() || 'unknown' : 'unknown';

  return {
    info: (message: string, data: LogData = {}): void => {
      let enrichedData = enrichLogData(data, moduleName);
      enrichedData = filterByEnvironment(enrichedData);
      const sanitizedData = sanitizeData(enrichedData) as Record<string, unknown>;
      winstonLogger.info(message, sanitizedData);
    },
    error: (message: string, data: LogData = {}): void => {
      let enrichedData = enrichLogData(data, moduleName);
      enrichedData = filterByEnvironment(enrichedData);
      const sanitizedData = sanitizeData(enrichedData) as Record<string, unknown>;
      winstonLogger.error(message, sanitizedData);
    },
    warn: (message: string, data: LogData = {}): void => {
      let enrichedData = enrichLogData(data, moduleName);
      enrichedData = filterByEnvironment(enrichedData);
      const sanitizedData = sanitizeData(enrichedData) as Record<string, unknown>;
      winstonLogger.warn(message, sanitizedData);
    },
    debug: (message: string, data: LogData = {}): void => {
      let enrichedData = enrichLogData(data, moduleName);
      enrichedData = filterByEnvironment(enrichedData);
      const sanitizedData = sanitizeData(enrichedData) as Record<string, unknown>;
      winstonLogger.debug(message, sanitizedData);
    },
  };
}

export default getLogger;
