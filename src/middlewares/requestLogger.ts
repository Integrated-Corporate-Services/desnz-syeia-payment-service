// Request Logging Middleware
import { Request, Response, NextFunction } from 'express';
import getLogger from '../utils/loggerHelper';

const logger = getLogger(module);

/**
 * Request logging middleware
 * Logs all incoming HTTP requests with correlation ID
 */
export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction) {
  logger.info('[HTTP] Request', {
    method: req.method,
    path: req.path,
    correlationId: req.headers['x-correlation-id'],
  });
  next();
}
