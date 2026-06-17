// Route Setup
import { Express, Request, Response } from 'express';
import callbackRoutes from '../routes/callback';
import bacsWebhookRoutes from '../routes/bacsWebhook';
import { HTTP_STATUS } from '../constants/error.constants';
import getLogger from '../utils/loggerHelper';

const logger = getLogger(module);

/**
 * Register all application routes
 */
export function registerRoutes(app: Express): void {
  // Payment webhook routes
  app.use('/callback', callbackRoutes);
  app.use('/webhooks/bacs', bacsWebhookRoutes);


  // Root-level health check with database connectivity check
  app.get('/health', async (req: Request, res: Response) => {
    const { checkDatabaseConnectivity } = require('../database/db');
    
    const health: any = {
      status: 'healthy',
      service: 'callback-service',
      timestamp: new Date().toISOString(),
      checks: {},
    };

    try {
      const dbCheck = await checkDatabaseConnectivity();
      health.checks.database = {
        status: dbCheck.connected ? 'up' : 'down',
        latency_ms: dbCheck.latencyMs,
      };

      if (dbCheck.error) {
        health.checks.database.error = dbCheck.error;
      }

      if (!dbCheck.connected) {
        health.status = 'unhealthy';
        return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json(health);
      }
    } catch (error) {
      health.status = 'unhealthy';
      health.checks.database = {
        status: 'down',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json(health);
    }

    res.json(health);
  });
}
