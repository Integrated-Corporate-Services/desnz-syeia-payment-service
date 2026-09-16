// Request Context Middleware
// Adds unique request_id and context to all downstream logs

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  request_id: string;
  method: string;
  path: string;
  user_agent?: string;
  source_ip?: string;
  correlation_id?: string;
  start_time: number;
}

// AsyncLocalStorage for request context (thread-safe for async operations)
export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Middleware to initialize request context
 * This context is available to all downstream middleware, controllers, and services
 */
export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = uuidv4();

  const context: RequestContext = {
    request_id: requestId,
    method: req.method,
    path: req.path,
    user_agent: req.headers['user-agent'],
    source_ip: req.ip || req.socket.remoteAddress,
    // Single source of truth for correlation across the whole request: reuse an inbound
    // x-correlation-id if the caller supplied one, otherwise fall back to this request's
    // own request_id so every request always has exactly one non-empty correlation id.
    // Every logger call (via loggerHelper) picks this up automatically, and every
    // downstream middleware/controller should read it via getRequestContext() rather
    // than re-deriving its own id from headers.
    correlation_id:
      typeof req.headers['x-correlation-id'] === 'string' && req.headers['x-correlation-id']
        ? req.headers['x-correlation-id']
        : requestId,
    start_time: Date.now(),
  };

  // Store context for this request's async execution
  requestContextStorage.run(context, () => {
    // Attach context to request object for easy access
    (req as any).context = context;
    // Echo the correlation id back so callers can log/report it too
    res.setHeader('x-correlation-id', context.correlation_id as string);
    next();
  });
}

/**
 * Get current request context
 * Returns undefined if called outside of request context
 */
export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}
