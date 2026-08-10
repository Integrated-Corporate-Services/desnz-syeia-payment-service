import { Express, Request, Response, NextFunction } from 'express';
import getLogger from '../utils/loggerHelper';
import { createSanitizedErrorLog } from '../utils/errorSanitizer';

const logger = getLogger(module);

export function registerErrorHandler(app: Express): void {
  app.use((req: Request, res: Response) => {
    logger.warn('[HTTP] Route not found', {
      method: req.method,
      path: req.path,
    });
    
    res.status(404).json({ 
      error: 'Route not found',
      requestedPath: req.path,
      method: req.method,
      availableRoutes: {
        govukPay: {
          health: 'GET /callback/health',
          webhook: 'POST /callback/payment',
        },
        uksbs: {
          health: 'GET /webhooks/payments/health',
          webhook: 'POST /webhooks/payments/payment',
        },
        general: {
          health: 'GET /health',
        },
      },
      hint: 'Check if the route path matches exactly (case-sensitive)',
    });
  });

  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    if (err instanceof SyntaxError && 'body' in err) {
      const sanitizedError = createSanitizedErrorLog(err);
      logger.warn('[HTTP] Invalid JSON in request body', {
        error_message: sanitizedError.sanitized_message,
        error_type: sanitizedError.error_type,
        method: req.method,
        path: req.path,
      });
      return res.status(400).json({ error: 'Invalid JSON in request body' });
    }

    const sanitizedError = createSanitizedErrorLog(err);
    logger.error('[HTTP] Error', {
      error_message: sanitizedError.sanitized_message,
      error_type: sanitizedError.error_type,
      method: req.method,
      path: req.path,
    });
    res.status(500).json({ error: 'Internal server error' });
  });
}
