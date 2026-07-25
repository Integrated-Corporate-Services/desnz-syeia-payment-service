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

// ✅ FIX HIGH-008: Only store rawBody for webhook endpoints to prevent memory exhaustion DoS
const WEBHOOK_PATHS = ['/callback/payment', '/webhooks/bacs/payments'];

export function registerMiddleware(app: Express): void {
  const trustedProxies = (process.env.TRUSTED_PROXIES || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

  app.set('trust proxy', trustedProxies.length > 0 ? trustedProxies : false);

  app.use(requestContextMiddleware);
  app.use(corsMiddleware);
  app.use(rateLimitMiddleware);
  app.use(securityHeadersMiddleware);

  // ✅ FIX HIGH-008: Reduce body size limit and conditionally store rawBody
  app.use(express.json({ 
    limit: '100kb',  // ✅ Reduced from 1mb to 100kb to prevent memory exhaustion
    verify: (req: Request, res, buf, encoding) => {
      // ✅ FIX HIGH-008: Only store rawBody for webhook signature verification
      // This prevents memory exhaustion DoS on non-webhook endpoints
      if (WEBHOOK_PATHS.includes(req.path)) {
        (req as RequestWithRawBody).rawBody = buf.toString((encoding as BufferEncoding) || 'utf8');
      }
    }
  }));

  app.use(express.urlencoded({ limit: '100kb', extended: true }));  // ✅ Also reduce urlencoded limit

  app.use(httpLoggingMiddleware);
  app.use(requestLoggerMiddleware);
}
