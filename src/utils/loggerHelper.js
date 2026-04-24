// Logger utility with structured logging (matching backend patterns)
const config = require('../config/config').default;

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const isCloudEnv = ['prod', 'production', 'pre-prod', 'staging', 'dev', 'development'].includes(
  process.env.NODE_ENV
);

const getLogger = (module) => {
  const moduleName = module.filename ? module.filename.split(/[/\\]/).pop() : 'unknown';
  const logLevel =config.server?.logLevel || process.env.LOG_LEVEL || (isCloudEnv ? 'info' : 'debug');
  const currentLogLevel = LOG_LEVELS[logLevel] || LOG_LEVELS.info;

  /**
   * Sanitize log data to prevent sensitive information leakage
   */
  function sanitizeData(data) {
    if (!data || typeof data !== 'object') return data;

    const sanitized = { ...data };
    const sensitiveKeys = [
      'password',
      'secret',
      'token',
      'apiKey',
      'api_key',
      'authorization',
      'auth',
      'credit_card',
      'creditCard',
      'cvv',
      'ssn',
      'private_key',
      'privateKey',
    ];

    for (const key of Object.keys(sanitized)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some((sensitive) => lowerKey.includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof sanitized[key] === 'object') {
        sanitized[key] = sanitizeData(sanitized[key]);
      }
    }

    return sanitized;
  }

  /**
   * Format log message with timestamp and context
   */
  function formatLog(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const sanitizedData = sanitizeData(data);

    if (isCloudEnv) {
      // JSON format for cloud environments (CloudWatch, etc.)
      return JSON.stringify({
        timestamp,
        level,
        module: moduleName,
        message,
        ...sanitizedData,
      });
    } else {
      // Human-readable format for local development
      const dataString = Object.keys(sanitizedData).length
        ? ' ' + JSON.stringify(sanitizedData, null, 2)
        : '';
      return `${timestamp} [${level}] [${moduleName}] ${message}${dataString}`;
    }
  }

  return {
    info: (message, data = {}) => {
      if (currentLogLevel >= LOG_LEVELS.info) {
        console.log(formatLog('info', message, data));
      }
    },
    error: (message, data = {}) => {
      if (currentLogLevel >= LOG_LEVELS.error) {
        console.error(formatLog('error', message, data));
      }
    },
    warn: (message, data = {}) => {
      if (currentLogLevel >= LOG_LEVELS.warn) {
        console.warn(formatLog('warn', message, data));
      }
    },
    debug: (message, data = {}) => {
      if (currentLogLevel >= LOG_LEVELS.debug) {
        console.log(formatLog('debug', message, data));
      }
    },
  };
};

module.exports = getLogger;
