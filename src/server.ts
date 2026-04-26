// Server Startup
import express, { Express } from 'express';
import { createApp } from './app';
import getLogger from './utils/loggerHelper';
import { closePool } from './database/db';

const logger = getLogger(module);

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
const HOST = '0.0.0.0';
const SHUTDOWN_TIMEOUT_MS = 30000; // 30 seconds

/**
 * Graceful shutdown handler
 * Coordinates HTTP server and database pool closure
 */
async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`[SERVER] ${signal} received, shutting down gracefully`);

  // Set shutdown timeout
  const shutdownTimeout = setTimeout(() => {
    logger.error('[SERVER] Forced shutdown after timeout');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  try {
    // Step 1: Stop accepting new connections
    await new Promise<void>((resolve) => {
      server.close(() => {
        logger.info('[SERVER] HTTP server closed - no new connections accepted');
        resolve();
      });
    });

    // Step 2: Close database pool (waits for active queries to complete)
    await closePool();

    // Step 3: Cleanup complete
    clearTimeout(shutdownTimeout);
    logger.info('[SERVER] Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    clearTimeout(shutdownTimeout);
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('[SERVER] Error during shutdown', { error: errorMessage });
    process.exit(1);
  }
}

let server: ReturnType<Express['listen']>;

(async () => {
  const app: Express = await createApp();

  server = app.listen(PORT, HOST, () => {
    logger.info('[SERVER] Callback Service started', {
      host: HOST,
      port: PORT,
      env: process.env.NODE_ENV,
    });
    logger.info('[SERVER] Health check available at', {
      url: `http://${HOST}:${PORT}/health`,
    });
    logger.info('[SERVER] Webhook endpoint available at', {
      url: `http://${HOST}:${PORT}/callback/payment`,
    });
  });

  // Graceful shutdown handlers
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
})();
