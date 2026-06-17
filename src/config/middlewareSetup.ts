// Middleware Setup
import { Express, Request } from 'express';
import express from 'express';
import { corsMiddleware } from './corsConfig';
import { rateLimitMiddleware } from '../middlewares/rateLimiter';
import { securityHeadersMiddleware } from '../middlewares/securityHeaders';
import { requestLoggerMiddleware } from '../middlewares/requestLogger';

interface RequestWithRawBody extends Request {
  rawBody?: string;
}

/**
 * Register all application middleware in the correct order
 */
export function registerMiddleware(app: Express): void {
  // Trust proxy (for rate limiting and IP detection)
  app.set('trust proxy', true);

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

  // Request logging
  app.use(requestLoggerMiddleware);
}
