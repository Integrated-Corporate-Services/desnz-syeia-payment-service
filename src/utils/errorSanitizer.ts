/**
 * Error Sanitization Utility
 * 
 * ✅ FIX HIGH-003: Information Disclosure in Error Messages
 * 
 * Removes sensitive information from error messages before logging:
 * - Database table names
 * - Connection strings
 * - Host/IP addresses
 * - Port numbers
 * - Database names
 * - SQL query fragments
 * - File paths
 * 
 * Security: Prevents reconnaissance attacks and infrastructure leakage
 * Compliance: OWASP A04:2021 - Insecure Design
 */

/**
 * Sanitize error message to remove sensitive information
 * 
 * @param error - Error object or string
 * @returns Sanitized error message safe for logging
 */
export function sanitizeError(error: unknown): string {
  let errorMessage: string;

  // Convert error to string
  if (error instanceof Error) {
    errorMessage = error.message;
  } else if (typeof error === 'string') {
    errorMessage = error;
  } else {
    errorMessage = String(error);
  }

  // Apply sanitization rules
  return errorMessage
    // Database table names: table "payment_webhooks" → table [REDACTED]
    .replace(/table\s+"([^"]+)"/gi, 'table [REDACTED]')
    .replace(/table\s+`([^`]+)`/gi, 'table [REDACTED]')
    .replace(/table\s+([a-z_][a-z0-9_]*)/gi, 'table [REDACTED]')
    
    // Connection strings: host=prod-db.example.com → host=[REDACTED]
    .replace(/host=([^\s,;]+)/gi, 'host=[REDACTED]')
    .replace(/hostname=([^\s,;]+)/gi, 'hostname=[REDACTED]')
    
    // Database names: database=syeia_prod → database=[REDACTED]
    .replace(/database=([^\s,;]+)/gi, 'database=[REDACTED]')
    .replace(/dbname=([^\s,;]+)/gi, 'dbname=[REDACTED]')
    
    // Ports: port=5432 → port=[REDACTED]
    .replace(/port=(\d+)/gi, 'port=[REDACTED]')
    
    // IP addresses: 10.0.1.50 → [IP_REDACTED]
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP_REDACTED]')
    
    // User/usernames: user=admin → user=[REDACTED]
    .replace(/user=([^\s,;]+)/gi, 'user=[REDACTED]')
    .replace(/username=([^\s,;]+)/gi, 'username=[REDACTED]')
    
    // Password indicators (should never appear but sanitize anyway)
    .replace(/password=([^\s,;]+)/gi, 'password=[REDACTED]')
    .replace(/pwd=([^\s,;]+)/gi, 'pwd=[REDACTED]')
    
    // Connection URIs: postgres://user:pass@host/db → [CONNECTION_STRING_REDACTED]
    .replace(/postgres:\/\/[^\s]+/gi, '[CONNECTION_STRING_REDACTED]')
    .replace(/postgresql:\/\/[^\s]+/gi, '[CONNECTION_STRING_REDACTED]')
    
    // SQL query fragments: INSERT INTO payments → [SQL_REDACTED]
    .replace(/(?:SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\s+.{0,50}/gi, '[SQL_REDACTED]')
    
    // File paths (Windows and Unix)
    .replace(/[A-Za-z]:\\(?:[^\s,;]+\\)+/g, '[PATH_REDACTED]')
    .replace(/\/(?:home|root|var|opt|usr)\/[^\s,;]*/g, '[PATH_REDACTED]')
    
    // Column names in errors: column "payment_id" → column [REDACTED]
    .replace(/column\s+"([^"]+)"/gi, 'column [REDACTED]')
    .replace(/column\s+`([^`]+)`/gi, 'column [REDACTED]')
    
    // Schema names: schema "public" → schema [REDACTED]
    .replace(/schema\s+"([^"]+)"/gi, 'schema [REDACTED]')
    
    // Constraint names (may leak table structure)
    .replace(/constraint\s+"([^"]+)"/gi, 'constraint [REDACTED]')
    .replace(/key\s+"([^"]+)"/gi, 'key [REDACTED]');
}

/**
 * Sanitize error for client response
 * Returns generic error message suitable for HTTP responses
 * 
 * @param error - Error object or string
 * @returns Generic error message safe for client
 */
export function sanitizeErrorForClient(error: unknown): string {
  // Never expose internal errors to clients
  // Return generic messages based on error type
  
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    // Database errors
    if (message.includes('connect') || message.includes('timeout')) {
      return 'Service temporarily unavailable';
    }
    
    // Validation errors (safe to be more specific)
    if (message.includes('invalid') || message.includes('missing')) {
      return 'Invalid request data';
    }
    
    // Duplicate/conflict errors
    if (message.includes('duplicate') || message.includes('already exists')) {
      return 'Resource already exists';
    }
  }
  
  // Default generic error
  return 'An internal error occurred';
}

/**
 * Sanitize stack trace for logging
 * Removes file paths and sensitive line information
 * 
 * @param stack - Error stack trace
 * @returns Sanitized stack trace
 */
export function sanitizeStack(stack: string | undefined): string | undefined {
  if (!stack) {
    return undefined;
  }

  return stack
    // Remove file paths from stack frames
    .replace(/at\s+.+\(([A-Za-z]:\\[^\)]+)\)/g, 'at [LOCATION_REDACTED]')
    .replace(/at\s+.+\((\/[^\)]+)\)/g, 'at [LOCATION_REDACTED]')
    // Remove line and column numbers that might leak structure
    .replace(/:\d+:\d+/g, ':[LINE_REDACTED]');
}

/**
 * Create safe error object for logging
 * Sanitizes all sensitive fields before logging
 * 
 * @param error - Error object
 * @param context - Additional context to log
 * @returns Sanitized error object for logger
 */
export function createSafeErrorLog(
  error: unknown,
  context: Record<string, unknown> = {}
): Record<string, unknown> {
  const safeLog: Record<string, unknown> = {
    error: sanitizeError(error),
    ...context,
  };

  // Sanitize error code (safe to include)
  if (error instanceof Error && 'code' in error) {
    safeLog.errorCode = (error as any).code;
  }

  // Sanitize error name (safe to include)
  if (error instanceof Error) {
    safeLog.errorName = error.name;
  }

  // Include sanitized stack trace only in non-production
  if (process.env.NODE_ENV !== 'production' && error instanceof Error) {
    safeLog.stack = sanitizeStack(error.stack);
  }

  return safeLog;
}
