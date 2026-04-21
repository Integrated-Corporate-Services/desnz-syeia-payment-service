/**
 * Application Configuration Constants
 * Environment variable keys, headers, service names, and runtime settings
 */

/**
 * Environment Variable Keys
 * Centralized reference for all environment variables
 */
export const ENV_KEYS = {
  // Server
  NODE_ENV: 'NODE_ENV',
  PORT: 'PORT',
  HOST: 'HOST',
  
  // Server Timeouts
  SERVER_TIMEOUT: 'SERVER_TIMEOUT',
  KEEP_ALIVE_TIMEOUT: 'KEEP_ALIVE_TIMEOUT',
  REQUEST_TIMEOUT: 'REQUEST_TIMEOUT',
  
  // Database
  DB_HOST: 'DB_HOST',
  DB_PORT: 'DB_PORT',
  DB_NAME: 'DB_NAME',
  DB_USER: 'DB_USER',
  DB_PASSWORD: 'DB_PASSWORD',
  DB_POOL_MAX: 'DB_POOL_MAX',
  DB_IDLE_MS: 'DB_IDLE_MS',
  DB_CONN_MS: 'DB_CONN_MS',
  DB_QUERY_MS: 'DB_QUERY_MS',
  DB_APPLICATION_NAME: 'DB_APPLICATION_NAME',
  
  // Backend Service
  BACKEND_SERVICE_URL: 'BACKEND_SERVICE_URL',
  BACKEND_TIMEOUT: 'BACKEND_TIMEOUT',
  BACKEND_RETRY_ATTEMPTS: 'BACKEND_RETRY_ATTEMPTS',
  BACKEND_RETRY_DELAY: 'BACKEND_RETRY_DELAY',
  
  // Webhook Configuration
  WEBHOOK_SIGNING_KEY: 'WEBHOOK_SIGNING_KEY',
  WEBHOOK_MAX_RETRIES: 'WEBHOOK_MAX_RETRIES',
  WEBHOOK_RETRY_INTERVAL_1: 'WEBHOOK_RETRY_INTERVAL_1',
  WEBHOOK_RETRY_INTERVAL_2: 'WEBHOOK_RETRY_INTERVAL_2',
  WEBHOOK_RETRY_INTERVAL_3: 'WEBHOOK_RETRY_INTERVAL_3',
  WEBHOOK_SIGNING_ALGORITHM: 'WEBHOOK_SIGNING_ALGORITHM',
  
  // Feature Flags
  CALLBACK_SERVICE_ENABLED: 'CALLBACK_SERVICE_ENABLED',
  RETRY_ENABLED: 'RETRY_ENABLED',
  DLQ_ENABLED: 'DLQ_ENABLED',
  SIGNATURE_VERIFICATION_ENABLED: 'SIGNATURE_VERIFICATION_ENABLED',
  METRICS_ENABLED: 'METRICS_ENABLED',
  DETAILED_LOGGING: 'DETAILED_LOGGING',
  
  // Security
  CORS_ORIGINS: 'CORS_ORIGINS',
  TRUSTED_PROXIES: 'TRUSTED_PROXIES',
  RATE_LIMIT_WINDOW_MS: 'RATE_LIMIT_WINDOW_MS',
  RATE_LIMIT_MAX: 'RATE_LIMIT_MAX',
  
  // AWS
  AWS_REGION: 'AWS_REGION',
  AWS_SQS_QUEUE_URL: 'AWS_SQS_QUEUE_URL',
  AWS_SQS_DLQ_URL: 'AWS_SQS_DLQ_URL',
  
  // Logging
  LOG_LEVEL: 'LOG_LEVEL',
} as const;

/**
 * Service Names
 * For logging, tracing, and service identification
 */
export const SERVICE_NAMES = {
  CALLBACK_SERVICE: 'integration-service',
  BACKEND_SERVICE: 'backend-service',
  GOVUK_PAY: 'govuk-pay',
  DATABASE: 'postgresql',
} as const;

/**
 * HTTP Header Names
 */
export const HEADERS = {
  AUTHORIZATION: 'authorization',
  CONTENT_TYPE: 'content-type',
  CONTENT_LENGTH: 'content-length',
  USER_AGENT: 'user-agent',
  X_CORRELATION_ID: 'x-correlation-id',
  X_REQUEST_ID: 'x-request-id',
  X_FORWARDED_FOR: 'x-forwarded-for',
  GOVUK_PAY_SIGNATURE: 'govuk-pay-signature',
  GOVUK_PAY_WEBHOOK_ID: 'govuk-pay-webhook-id',
} as const;

/**
 * Content Types
 */
export const CONTENT_TYPES = {
  JSON: 'application/json',
  TEXT: 'text/plain',
  HTML: 'text/html',
  FORM_URLENCODED: 'application/x-www-form-urlencoded',
} as const;

/**
 * Log Levels (Winston-compatible)
 */
export const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  HTTP: 'http',
  DEBUG: 'debug',
} as const;

/**
 * Environment Types
 */
export const ENVIRONMENTS = {
  LOCAL: 'local',
  DEVELOPMENT: 'development',
  STAGING: 'staging',
  PRODUCTION: 'production',
  TEST: 'test',
} as const;

/**
 * Database Connection Pool Settings
 * Default values for connection pooling
 */
export const DB_POOL_DEFAULTS = {
  MAX: 10,
  MIN: 2,
  IDLE_TIMEOUT_MS: 20000,
  CONNECTION_TIMEOUT_MS: 15000,
  QUERY_TIMEOUT_MS: 40000,
  STATEMENT_TIMEOUT_MS: 45000,
} as const;

/**
 * Server Timeout Defaults (milliseconds)
 */
export const SERVER_TIMEOUT_DEFAULTS = {
  SERVER: 30000,        // 30 seconds
  KEEP_ALIVE: 35000,    // 35 seconds (5s buffer)
  REQUEST: 25000,       // 25 seconds
} as const;

/**
 * Backend Service Defaults
 */
export const BACKEND_DEFAULTS = {
  TIMEOUT: 5000,        // 5 seconds
  RETRY_ATTEMPTS: 2,    // 2 retries
  RETRY_DELAY: 1000,    // 1 second
} as const;

/**
 * Rate Limiting Defaults
 */
export const RATE_LIMIT_DEFAULTS = {
  WINDOW_MS: 60000,     // 1 minute
  MAX_REQUESTS: 100,    // 100 requests per window
} as const;

/**
 * Correlation ID Generation
 */
export const CORRELATION_ID = {
  PREFIX: 'corr',
  LENGTH: 12,
} as const;

/**
 * Type exports for type safety
 */
export type Environment = typeof ENVIRONMENTS[keyof typeof ENVIRONMENTS];
export type LogLevel = typeof LOG_LEVELS[keyof typeof LOG_LEVELS];
export type ServiceName = typeof SERVICE_NAMES[keyof typeof SERVICE_NAMES];
