// Express Application Setup
import express, { Express, Request, Response } from 'express';
import callbackRoutes from './routes/callback';
const getLogger = require('./utils/loggerHelper');
const logger = getLogger(module);

export function createApp(): Express {
  const app = express();

  // Middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  // Request logging middleware
  app.use((req: Request, res: Response, next: Function) => {
    logger.info('[HTTP] Request', {
      method: req.method,
      path: req.path,
      correlationId: req.headers['x-correlation-id'],
    });
    next();
  });

  // Routes
  app.use('/callback', callbackRoutes);

  // Health check (root level too)
  app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'healthy', service: 'callback-service' });
  });

  // 404 handler
  app.use((req: Request, res: Response) => {
    logger.warn('[HTTP] Not found', { method: req.method, path: req.path });
    res.status(404).json({ error: 'Not found' });
  });

  // Error handler
  app.use((err: any, req: Request, res: Response, next: Function) => {
    logger.error('[HTTP] Error', {
      error: err.message,
      method: req.method,
      path: req.path,
    });
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

export default createApp;
