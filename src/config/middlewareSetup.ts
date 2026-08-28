import { Express, Request } from 'express';
import express from 'express';
import { corsMiddleware } from './corsConfig';
import { globalRateLimiter } from './rateLimiting';
import { securityHeadersMiddleware } from '../middlewares/securityHeaders';
import { requestLoggerMiddleware } from '../middlewares/requestLogger';
import { requestContextMiddleware } from '../middlewares/requestContext';
import { httpLoggingMiddleware } from '../middlewares/httpLogging';

interface RequestWithRawBody extends Request {
  rawBody?: string;
}

export function registerMiddleware(app: Express): void {
  // Trust only the first proxy (ALB) - prevents IP spoofing while enabling rate limiting
  // See: https://express-rate-limit.github.io/ERR_ERL_PERMISSIVE_TRUST_PROXY/
  app.set('trust proxy', 1);

  app.use(requestContextMiddleware);
  app.use(corsMiddleware);
  app.use(globalRateLimiter);
  app.use(securityHeadersMiddleware);

  app.use(express.json({ 
    limit: '1mb',
    verify: (req: Request, res, buf, encoding) => {
      (req as RequestWithRawBody).rawBody = buf.toString((encoding as BufferEncoding) || 'utf8');
    }
  }));

  app.use(express.urlencoded({ limit: '1mb', extended: true }));

  app.use(httpLoggingMiddleware);
  app.use(requestLoggerMiddleware);
}
