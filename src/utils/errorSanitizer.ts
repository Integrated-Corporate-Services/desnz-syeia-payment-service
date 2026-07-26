/**
 * Error Sanitization Utility
 * Removes sensitive information from error messages before logging/responding
 * 
 * Addresses: OWASP A04:2021, CWE-209
 * Complies with: PCI DSS 6.5.5, NIST SP 800-53 SI-11
 */

/**
 * Patterns to redact from error messages
 * Protects against information disclosure vulnerabilities
 */
const SENSITIVE_PATTERNS = [
  // Database identifiers
  { pattern: /table\s+"([^"]+)"/gi, replacement: 'table "[REDACTED]"' },
  { pattern: /column\s+"([^"]+)"/gi, replacement: 'column "[REDACTED]"' },
  { pattern: /relation\s+"([^"]+)"/gi, replacement: 'relation "[REDACTED]"' },
  { pattern: /constraint\s+"([^"]+)"/gi, replacement: 'constraint "[REDACTED]"' },
  { pattern: /index\s+"([^"]+)"/gi, replacement: 'index "[REDACTED]"' },
  { pattern: /schema\s+"([^"]+)"/gi, replacement: 'schema "[REDACTED]"' },
  
  // Connection strings and hosts
  { pattern: /host=([^\s,;)]+)/gi, replacement: 'host=[REDACTED]' },
  { pattern: /port=([^\s,;)]+)/gi, replacement: 'port=[REDACTED]' },
  { pattern: /database=([^\s,;)]+)/gi, replacement: 'database=[REDACTED]' },
  { pattern: /user=([^\s,;)]+)/gi, replacement: 'user=[REDACTED]' },
  { pattern: /password=([^\s,;)]+)/gi, replacement: 'password=[REDACTED]' },
  
  // Connection URIs
  { pattern: /postgres:\/\/[^\s]+/gi, replacement: 'postgres://[REDACTED]' },
  { pattern: /postgresql:\/\/[^\s]+/gi, replacement: 'postgresql://[REDACTED]' },
  
  // File paths (avoid leaking server structure)
  { pattern: /\/home\/[^\s]+/gi, replacement: '/[REDACTED]' },
  { pattern: /\/var\/[^\s]+/gi, replacement: '/[REDACTED]' },
  { pattern: /\/usr\/[^\s]+/gi, replacement: '/[REDACTED]' },
  { pattern: /\/etc\/[^\s]+/gi, replacement: '/[REDACTED]' },  // Added /etc
  { pattern: /\/\.\.\/[^\s]*/gi, replacement: '/[REDACTED]' },  // Added path traversal
  { pattern: /C:\\[^\s]+/gi, replacement: 'C:\\[REDACTED]' },
  
  // IP addresses (privacy/security)
  { pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, replacement: '[IP_REDACTED]' },
  
  // UUIDs in error messages (avoid correlation attacks)
  { pattern: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, replacement: '[UUID_REDACTED]' },
] as const;

/**
 * Database error keywords that indicate sensitive information disclosure
 */
const DATABASE_ERROR_INDICATORS = [
  'duplicate key',
  'foreign key',
  'check constraint',
  'unique constraint',
  'not-null constraint',
  'constraint violation',     // Added - broader match
  'relation does not exist',
  'column does not exist',
  'table does not exist',
  'relation "',
  'column "',
  'table "',                  // Added
  'syntax error',
  'permission denied',
  'connection refused',
  'timeout expired',
] as const;

/**
 * Sanitize error message for safe logging and client responses
 * 
 * @param error - Error object or string to sanitize
 * @param options - Sanitization options
 * @returns Sanitized error string safe for logging
 * 
 * @example
 * ```typescript
 * const dbError = new Error('duplicate key value violates unique constraint "payment_webhooks_pkey"');
 * const safe = sanitizeErrorMessage(dbError);
 * // Returns: 'duplicate key value violates unique constraint "[REDACTED]"'
 * ```
 */
export function sanitizeErrorMessage(
  error: unknown,
  options: { preserveType?: boolean; maxLength?: number } = {}
): string {
  const { preserveType = true, maxLength = 500 } = options;

  let errorMessage: string;

  // Extract error message
  if (error instanceof Error) {
    errorMessage = preserveType ? `${error.name}: ${error.message}` : error.message;
  } else if (typeof error === 'string') {
    errorMessage = error;
  } else if (error && typeof error === 'object' && 'message' in error) {
    // Handle plain objects with message property
    errorMessage = String((error as any).message);
  } else {
    errorMessage = String(error);
  }

  // Apply all sanitization patterns
  let sanitized = errorMessage;
  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, replacement);
  }

  // Truncate if too long (DoS protection)
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength) + '...[TRUNC]';
  }

  return sanitized;
}

/**
 * Check if error contains database-specific information
 * Used to determine if additional sanitization is needed
 * 
 * @param error - Error to check
 * @returns true if error appears to be from database layer
 */
export function isDatabaseError(error: unknown): boolean {
  const errorStr = String(error).toLowerCase();
  return DATABASE_ERROR_INDICATORS.some(indicator => errorStr.includes(indicator));
}

/**
 * Sanitize error for production logging
 * More aggressive sanitization for production environments
 * 
 * @param error - Error to sanitize
 * @param environment - Current environment (prod/non-prod)
 * @returns Sanitized error message appropriate for environment
 */
export function sanitizeForEnvironment(error: unknown, environment: string = 'production'): string {
  const isProd = ['prod', 'production'].includes(environment.toLowerCase());

  if (!isProd) {
    // In non-production, log more details for debugging
    return sanitizeErrorMessage(error, { preserveType: true, maxLength: 1000 });
  }

  // In production, be more restrictive
  if (isDatabaseError(error)) {
    // Generic message for database errors in production
    return 'Database operation failed';
  }

  return sanitizeErrorMessage(error, { preserveType: false, maxLength: 200 });
}

/**
 * Sanitize error for client response
 * Never expose internal errors to clients
 * 
 * @param error - Error to sanitize
 * @param errorCode - Application error code
 * @returns Safe generic message for API response
 */
export function sanitizeForClient(error: unknown, errorCode?: string): string {
  // Check if it's a database error first
  if (isDatabaseError(error)) {
    return 'A system error occurred. Please try again later.';
  }

  // Default generic message for all other errors
  return 'An error occurred processing your request.';
}

/**
 * Create a sanitized error object for structured logging
 * Separates safe/unsafe fields for conditional logging
 * 
 * @param error - Error to process
 * @returns Object with sanitized message and metadata
 */
export function createSanitizedErrorLog(error: unknown): {
  sanitized_message: string;
  error_type: string;
  is_database_error: boolean;
  safe_for_client: boolean;
} {
  const errorType = error instanceof Error ? error.constructor.name : typeof error;
  const isDatabaseErr = isDatabaseError(error);
  
  return {
    sanitized_message: sanitizeErrorMessage(error),
    error_type: errorType,
    is_database_error: isDatabaseErr,
    safe_for_client: false, // Always false for internal errors
  };
}
