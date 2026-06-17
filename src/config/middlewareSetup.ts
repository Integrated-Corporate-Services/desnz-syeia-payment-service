// Middleware Setup
import { Express, Request } from 'express';
import express from 'express';
import { corsMiddleware } from './corsConfig';
import { rateLimitMiddleware } from '../middlewares/rateLimiter';
import { securityHeadersMiddleware } from '../middlewares/securityHeaders';
import { requestLoggerMiddleware } from '../middlewares/requestLogger';
import { requestContextMiddleware } from '../middlewares/requestContext';
import { httpLoggingMiddleware } from '../middlewares/httpLogging';

interface RequestWithRawBody extends Request {
  rawBody?: string;
}

/**
 * Register all application middleware in the correct order
 */
export function registerMiddleware(app: Express): void {
  // Trust proxy (for rate limiting and IP detection)
  app.set('trust proxy', true);

  // Request context (must be first to track all requests)
  app.use(requestContextMiddleware);

  // CORS
  app.use(corsMiddleware);

  // Rate limiting
  app.use(rateLimitMiddleware);

  // Security headers
  app.use(securityHeadersMiddleware);

  // Body parsing with raw body capture for signature verification
  app.use(express.json({ 
    limit: '1mb',
    verify: (req: Request, res, buf, encoding) => {
      (req as RequestWithRawBody).rawBody = buf.toString((encoding as BufferEncoding) || 'utf8');
    }
  }));
  
  app.use(express.urlencoded({ limit: '1mb', extended: true }));

  // HTTP logging (after body parsing)
  app.use(httpLoggingMiddleware);

  // Legacy request logging (can be removed if not needed)
  app.use(requestLoggerMiddleware);
}
