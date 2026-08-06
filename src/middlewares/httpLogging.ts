// HTTP Logging Middleware
// Structured logging for all HTTP requests and responses

import { Request, Response, NextFunction } from 'express';
import getLogger from '../utils/loggerHelper';
import { getRequestContext } from './requestContext';

const logger = getLogger(module);

// Paths to exclude from detailed logging (health checks, metrics)
const EXCLUDED_PATHS = ['/health', '/metrics', '/ping'];

/**
 * HTTP request/response logging middleware
 * Logs at request start and completion with structured data
 */
export function httpLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const context = getRequestContext();
  const startTime = context?.start_time || Date.now();

  // Skip logging for excluded paths (health checks)
  if (EXCLUDED_PATHS.includes(req.path)) {
    return next();
  }

  // Log incoming request (debug level to avoid noise in prod)
  // Do not log query strings or full headers — may contain sensitive data
  logger.debug('[HTTP] Request started', {
    method: req.method,
    path: req.path,
    content_type: req.headers['content-type'],
    content_length: req.headers['content-length'],
  });

  // Capture original res.json to log response
  const originalJson = res.json.bind(res);
  
  res.json = function (body: any) {
    const duration = Date.now() - startTime;
    
    // Log response completion
    logger.info('[HTTP] Request completed', {
      method: req.method,
      path: req.path,
      status_code: res.statusCode,
      response_time_ms: duration,
      // Don't log response body in prod for security
    });
    
    return originalJson(body);
  };

  // Handle response finish (for non-JSON responses)
  res.on('finish', () => {
    // Only log if we haven't already logged via res.json
    if (!res.headersSent || res.getHeader('content-type')?.toString().includes('json')) {
      return;
    }
    
    const duration = Date.now() - startTime;
    logger.info('[HTTP] Request completed', {
      method: req.method,
      path: req.path,
      status_code: res.statusCode,
      response_time_ms: duration,
    });
  });

  next();
}
