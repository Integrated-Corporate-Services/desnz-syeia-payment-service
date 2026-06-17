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
  const context: RequestContext = {
    request_id: uuidv4(),
    method: req.method,
    path: req.path,
    user_agent: req.headers['user-agent'],
    source_ip: req.ip || req.socket.remoteAddress,
    correlation_id: (req.headers['x-correlation-id'] as string) || undefined,
    start_time: Date.now(),
  };

  // Store context for this request's async execution
  requestContextStorage.run(context, () => {
    // Attach context to request object for easy access
    (req as any).context = context;
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
