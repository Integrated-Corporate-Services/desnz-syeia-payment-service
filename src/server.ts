// Server Startup
import express, { Express } from 'express';
import { createApp } from './app';
import getLogger from './utils/loggerHelper';

const logger = getLogger(module);

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
const HOST = '0.0.0.0';

(async () => {
  const app: Express = await createApp();

  const server = app.listen(PORT, HOST, () => {
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

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('[SERVER] SIGTERM received, shutting down gracefully');
    server.close(() => {
      logger.info('[SERVER] Server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    logger.info('[SERVER] SIGINT received, shutting down gracefully');
    server.close(() => {
      logger.info('[SERVER] Server closed');
      process.exit(0);
    });
  });
})();
