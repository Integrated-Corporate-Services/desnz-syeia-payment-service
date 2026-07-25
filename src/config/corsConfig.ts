import { Request, Response, NextFunction } from 'express';
import config from './config';
import getLogger from '../utils/loggerHelper';

const logger = getLogger(module);

export function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  const allowedOrigins = config.network.corsOrigins;
  const origin = req.headers.origin;
  
  if (allowedOrigins.includes('*') || (origin && allowedOrigins.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Correlation-ID, Pay-Signature, X-Webhook-Signature, X-Request-Timestamp, X-Webhook-Signature-Version');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  
  next();
}
