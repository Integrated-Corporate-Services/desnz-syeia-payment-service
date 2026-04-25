// Express Application Setup
import express, { Express, Request, Response, NextFunction } from 'express';
import callbackRoutes from './routes/callback';
import getLogger from './utils/loggerHelper';
import config from './config/config';

const logger = getLogger(module);

// Simple rate limiting middleware
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = config.server.rateLimitWindowMs;
  const maxRequests = config.server.rateLimitMax;
  
  const record = rateLimitMap.get(ip);
  
  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
    return next();
  }
  
  if (record.count >= maxRequests) {
    logger.warn('[RateLimit] Request limit exceeded', { ip, count: record.count });
    return res.status(429).json({ error: 'Too many requests' });
  }
  
  record.count++;
  next();
}

// Clean up old rate limit entries every minute
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitMap.entries()) {
    if (now > record.resetTime) {
      rateLimitMap.delete(ip);
    }
  }
}, 60000);

export function createApp(): Express {
  const app = express();

  // Trust proxy (for rate limiting and IP detection)
  app.set('trust proxy', true);

  // CORS middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const allowedOrigins = config.security.corsOrigins;
    const origin = req.headers.origin;
    
    if (allowedOrigins.includes('*') || (origin && allowedOrigins.includes(origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin || '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Correlation-ID, Pay-Signature');
      res.setHeader('Access-Control-Max-Age', '86400');
    }
    
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    
    next();
  });

  // Rate limiting
  app.use(rateLimitMiddleware);

  // Security headers
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });

  // Middleware
  // Capture raw body for signature verification before JSON parsing
  app.use(express.json({ 
    limit: '1mb',
    verify: (req: any, res, buf, encoding) => {
      req.rawBody = buf.toString((encoding as BufferEncoding) || 'utf8');
    }
  }));
  app.use(express.urlencoded({ limit: '1mb', extended: true }));

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
