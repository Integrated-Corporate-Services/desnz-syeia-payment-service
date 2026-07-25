// @deprecated This custom rate limiter is deprecated and no longer used
// Use the centralized rate limiting configuration in src/config/rateLimiting.ts instead
// This file is kept for backward compatibility only and will be removed in a future release
//
// Migration Guide:
// - Replace: import { rateLimitMiddleware } from '../middlewares/rateLimiter'
// - With: import { globalRateLimiter, webhookRateLimiter } from '../config/rateLimiting'
//
// The new implementation uses express-rate-limit (industry standard, CodeQL recognized)
// instead of this custom in-memory Map implementation

import { Request, Response, NextFunction } from 'express';
import config from '../config/config';
import getLogger from '../utils/loggerHelper';

const logger = getLogger(module);

// In-memory rate limiting store
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

/**
 * Simple rate limiting middleware
 * Tracks requests per IP address and enforces configured limits
 */
export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = config.server.rateLimitWindowMs;
  const maxRequests = config.server.rateLimitMax;
  
  const record = rateLimitMap.get(ip);
  
  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
    return next();
  }
  
  if (record.count >= maxRequests) {
    logger.warn('[RateLimit] Request limit exceeded', { ip, count: record.count });
    return res.status(429).json({ error: 'Too many requests' });
  }
  
  record.count++;
  next();
}

/**
 * Clean up expired rate limit entries
 * Should be called periodically to prevent memory leaks
 */
export function cleanupRateLimitMap(): void {
  const now = Date.now();
  for (const [ip, record] of rateLimitMap.entries()) {
    if (now > record.resetTime) {
      rateLimitMap.delete(ip);
    }
  }
}

// Clean up old rate limit entries every minute
setInterval(cleanupRateLimitMap, 60000);
