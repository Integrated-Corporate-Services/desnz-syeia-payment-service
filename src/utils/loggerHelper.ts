// Logger utility with structured logging (matching backend patterns)
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

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
} as const;

type LogLevel = keyof typeof LOG_LEVELS;

const isCloudEnv = ['prod', 'production', 'pre-prod', 'staging', 'dev', 'development'].includes(
  process.env.NODE_ENV || ''
);

function getLogger(module: NodeModule): Logger {
  const moduleName = module.filename ? module.filename.split(/[/\\]/).pop() : 'unknown';
  const logLevel = (config.server?.logLevel || process.env.LOG_LEVEL || (isCloudEnv ? 'info' : 'debug')) as LogLevel;
  const currentLogLevel = LOG_LEVELS[logLevel] || LOG_LEVELS.info;

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

  /**
   * Format log message with timestamp and context
   */
  function formatLog(level: string, message: string, data: LogData = {}): string {
    const timestamp = new Date().toISOString();
    const sanitizedData = sanitizeData(data) as Record<string, unknown>;

    if (isCloudEnv) {
      // JSON format for cloud environments (CloudWatch, etc.)
      return JSON.stringify({
        timestamp,
        level,
        module: moduleName,
        message,
        ...(typeof sanitizedData === 'object' && sanitizedData !== null ? sanitizedData : {}),
      });
    } else {
      // Human-readable format for local development
      const dataString = (typeof sanitizedData === 'object' && sanitizedData !== null && Object.keys(sanitizedData).length)
        ? ' ' + JSON.stringify(sanitizedData, null, 2)
        : '';
      return `${timestamp} [${level}] [${moduleName}] ${message}${dataString}`;
    }
  }

  return {
    info: (message: string, data: LogData = {}): void => {
      if (currentLogLevel >= LOG_LEVELS.info) {
        // eslint-disable-next-line no-console
        console.log(formatLog('info', message, data));
      }
    },
    error: (message: string, data: LogData = {}): void => {
      if (currentLogLevel >= LOG_LEVELS.error) {
        // eslint-disable-next-line no-console
        console.error(formatLog('error', message, data));
      }
    },
    warn: (message: string, data: LogData = {}): void => {
      if (currentLogLevel >= LOG_LEVELS.warn) {
        // eslint-disable-next-line no-console
        console.warn(formatLog('warn', message, data));
      }
    },
    debug: (message: string, data: LogData = {}): void => {
      if (currentLogLevel >= LOG_LEVELS.debug) {
        // eslint-disable-next-line no-console
        console.log(formatLog('debug', message, data));
      }
    },
  };
}

export default getLogger;
