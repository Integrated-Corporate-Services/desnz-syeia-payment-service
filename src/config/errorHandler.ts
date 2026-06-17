// Error Handler Setup
import { Express, Request, Response, NextFunction } from 'express';
import getLogger from '../utils/loggerHelper';

const logger = getLogger(module);

/**
 * Register 404 and error handlers
 * Must be registered after all routes
 */
export function registerErrorHandler(app: Express): void {
  // 404 handler with detailed debugging info
  app.use((req: Request, res: Response) => {
    logger.warn('[HTTP] Route not found', { 
      method: req.method, 
      path: req.path,
      url: req.url,
      originalUrl: req.originalUrl,
      headers: req.headers,
    });
    
    res.status(404).json({ 
      error: 'Route not found',
      requestedPath: req.path,
      requestedUrl: req.url,
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

  // Global error handler
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    // Handle JSON parsing errors from body-parser
    if (err instanceof SyntaxError && 'body' in err) {
      logger.warn('[HTTP] Invalid JSON in request body', {
        error: err.message,
        method: req.method,
        path: req.path,
      });
      return res.status(400).json({ error: 'Invalid JSON in request body' });
    }

    // Handle other errors
    logger.error('[HTTP] Error', {
      error: err.message,
      stack: err.stack,
      method: req.method,
      path: req.path,
    });
    res.status(500).json({ error: 'Internal server error' });
  });
}
