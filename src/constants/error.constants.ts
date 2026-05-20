/**
 * Error Handling Constants
 * HTTP status codes, error codes, retryable errors, and error messages
 */

/**
 * HTTP Status Codes
 * Standard HTTP response status codes
 */
export const HTTP_STATUS = {
  // Success (2xx)
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  
  // Client Errors (4xx)
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  REQUEST_TIMEOUT: 408,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  
  // Server Errors (5xx)
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const;

/**
 * Error Codes for API responses
 * Categorized by HTTP status code intent
 */
export enum ERROR_CODES {
  // Validation Errors (400)
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_WEBHOOK_STRUCTURE = 'INVALID_WEBHOOK_STRUCTURE',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  INVALID_PAYMENT_ID = 'INVALID_PAYMENT_ID',
  INVALID_WEBHOOK_ID = 'INVALID_WEBHOOK_ID',
  INVALID_EVENT_TYPE = 'INVALID_EVENT_TYPE',
  INVALID_TIMESTAMP = 'INVALID_TIMESTAMP',
  
  // Authentication Errors (401)
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  MISSING_SIGNATURE = 'MISSING_SIGNATURE',
  SIGNATURE_VERIFICATION_FAILED = 'SIGNATURE_VERIFICATION_FAILED',
  
  // Authorization Errors (403)
  ACCESS_DENIED = 'ACCESS_DENIED',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  
  // Resource Errors (404)
  WEBHOOK_NOT_FOUND = 'WEBHOOK_NOT_FOUND',
  PAYMENT_NOT_FOUND = 'PAYMENT_NOT_FOUND',
  
  // Business Logic Errors (409/422)
  DUPLICATE_WEBHOOK = 'DUPLICATE_WEBHOOK',
  INVALID_WEBHOOK_STATE = 'INVALID_WEBHOOK_STATE',
  PROCESSING_ALREADY_IN_PROGRESS = 'PROCESSING_ALREADY_IN_PROGRESS',
  
  // Service Errors (500)
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  DATABASE_CONNECTION_ERROR = 'DATABASE_CONNECTION_ERROR',
  DATABASE_QUERY_ERROR = 'DATABASE_QUERY_ERROR',
  BACKEND_SERVICE_ERROR = 'BACKEND_SERVICE_ERROR',
  BACKEND_SERVICE_TIMEOUT = 'BACKEND_SERVICE_TIMEOUT',
  BACKEND_SERVICE_UNAVAILABLE = 'BACKEND_SERVICE_UNAVAILABLE',
  SQS_ERROR = 'SQS_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  
  // Webhook Processing Errors
  WEBHOOK_PROCESSING_FAILED = 'WEBHOOK_PROCESSING_FAILED',
  RETRY_LIMIT_EXCEEDED = 'RETRY_LIMIT_EXCEEDED',
  DEAD_LETTER_QUEUE_ERROR = 'DEAD_LETTER_QUEUE_ERROR',
}

/**
 * Retryable Error Codes (NodeJS/Network Errors)
 * These error codes indicate transient failures that should be retried
 */
export const RETRYABLE_ERROR_CODES = [
  'ECONNREFUSED',    // Connection refused
  'ECONNRESET',      // Connection reset by peer
  'ETIMEDOUT',       // Operation timed out
  'EHOSTUNREACH',    // No route to host
  'ENETUNREACH',     // Network is unreachable
  'ENOTFOUND',       // DNS lookup failed
  'EPIPE',           // Broken pipe
  'EAI_AGAIN',       // DNS lookup timed out
  'ENETDOWN',        // Network is down
  'ECONNABORTED',    // Connection aborted
] as const;

/**
 * HTTP Status Codes that should trigger retries
 */
export const RETRYABLE_HTTP_STATUSES = [
  HTTP_STATUS.REQUEST_TIMEOUT,
  HTTP_STATUS.TOO_MANY_REQUESTS,
  HTTP_STATUS.INTERNAL_SERVER_ERROR,
  HTTP_STATUS.BAD_GATEWAY,
  HTTP_STATUS.SERVICE_UNAVAILABLE,
  HTTP_STATUS.GATEWAY_TIMEOUT,
] as const;

/**
 * Retryable Error Keywords
 * Text patterns in error messages that indicate retryable errors
 */
export const RETRYABLE_ERROR_KEYWORDS = [
  'timeout',
  'timed out',
  'connection refused',
  'connection reset',
  'network error',
  'socket hang up',
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'service unavailable',
  'temporarily unavailable',
  'rate limit',
  'too many requests',
] as const;

/**
 * Error Messages
 * User-facing error messages
 */
export const ERROR_MESSAGES = {
  // Validation
  VALIDATION_FAILED: 'Request validation failed',
  INVALID_WEBHOOK_STRUCTURE: 'Invalid webhook payload structure',
  MISSING_REQUIRED_FIELD: (field: string) => `Missing required field: ${field}`,
  INVALID_PAYMENT_ID: 'Invalid payment ID format',
  INVALID_WEBHOOK_ID: 'Invalid webhook ID format',
  INVALID_EVENT_TYPE: 'Invalid webhook event type',
  
  // Authentication
  AUTHENTICATION_FAILED: 'Webhook authentication failed',
  INVALID_SIGNATURE: 'Invalid webhook signature',
  MISSING_SIGNATURE: 'Webhook signature header is missing',
  SIGNATURE_VERIFICATION_FAILED: 'Failed to verify webhook signature',
  
  // Resource
  WEBHOOK_NOT_FOUND: (id: string) => `Webhook ${id} not found`,
  PAYMENT_NOT_FOUND: (id: string) => `Payment ${id} not found`,
  
  // Business Logic
  DUPLICATE_WEBHOOK: 'Webhook already processed',
  INVALID_WEBHOOK_STATE: 'Webhook is in an invalid state for this operation',
  PROCESSING_ALREADY_IN_PROGRESS: 'Webhook processing already in progress',
  
  // Service
  INTERNAL_SERVER_ERROR: 'An internal server error occurred',
  DATABASE_ERROR: 'Database operation failed',
  DATABASE_CONNECTION_ERROR: 'Failed to connect to database',
  DATABASE_QUERY_ERROR: 'Database query failed',
  BACKEND_SERVICE_ERROR: 'Backend service request failed',
  BACKEND_SERVICE_TIMEOUT: 'Backend service request timed out',
  BACKEND_SERVICE_UNAVAILABLE: 'Backend service is currently unavailable',
  SQS_ERROR: 'Failed to send message to SQS',
  CONFIGURATION_ERROR: 'Service configuration error',
  UNKNOWN_ERROR: 'An unknown error occurred',
  
  // Webhook Processing
  WEBHOOK_PROCESSING_FAILED: 'Failed to process webhook',
  RETRY_LIMIT_EXCEEDED: 'Maximum retry attempts exceeded',
  DEAD_LETTER_QUEUE_ERROR: 'Failed to move webhook to dead-letter queue',
  
  // Feature Flags
  SERVICE_DISABLED: 'Callback service is currently disabled',
  RETRY_DISABLED: 'Retry functionality is disabled',
  
  // Timeout
  REQUEST_TIMEOUT: 'Request timed out',
  OPERATION_TIMEOUT: 'Operation timed out',
} as const;

/**
 * Success Messages
 */
export const SUCCESS_MESSAGES = {
  WEBHOOK_RECEIVED: 'Webhook received successfully',
  WEBHOOK_PROCESSED: 'Webhook processed successfully',
  WEBHOOK_QUEUED: 'Webhook queued for processing',
  WEBHOOK_RETRY_SCHEDULED: 'Webhook retry scheduled',
  DUPLICATE_IGNORED: 'Duplicate webhook ignored',
} as const;

/**
 * Regex for retryable error detection
 */
export const RETRYABLE_ERROR_KEYWORDS_REGEX = new RegExp(
  RETRYABLE_ERROR_KEYWORDS.map(kw => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'i'
);

/**
 * Type exports for type safety
 */
export type HttpStatusCode = typeof HTTP_STATUS[keyof typeof HTTP_STATUS];
export type RetryableErrorCode = typeof RETRYABLE_ERROR_CODES[number];
