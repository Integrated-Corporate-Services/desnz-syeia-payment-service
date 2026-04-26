import { Request, Response } from 'express';
import { v4 as uuidv4, validate as uuidValidate } from 'uuid';
import getLogger from '../utils/loggerHelper';
import { processWebhook } from '../services/paymentWebhookService';
import { HTTP_STATUS } from '../constants/error.constants';

const logger = getLogger(module);

const WEBHOOK_STATUS = {
  DUPLICATE: 'duplicate',
  RETRYABLE_ERROR: 'retryable_error',
  PERMANENT_ERROR: 'permanent_error',
  ERROR: 'error',
} as const;

// Type definitions
interface WebhookEvent {
  webhook_id?: string;
  event_type: string;
  resource?: {
    payment_id?: string;
  };
  [key: string]: unknown;
}

interface WebhookRequest extends Request {
  webhookEvent?: WebhookEvent;
  paymentId?: string;
}

interface WebhookProcessingResult {
  success: boolean;
  isDuplicate?: boolean;
  retryable?: boolean;
  error?: string;
}

interface WebhookResponse {
  status?: string;
  webhookId: string;
  paymentId?: string;
  message?: string;
  isDuplicate?: boolean;
  error?: string;
  receivedAt?: string;
  [key: string]: unknown;
}

/**
 * Validates webhook event structure
 */
function isValidWebhookEvent(event: unknown): event is WebhookEvent {
  if (!event || typeof event !== 'object') {
    return false;
  }
  
  const webhookEvent = event as WebhookEvent;
  return typeof webhookEvent.event_type === 'string' && webhookEvent.event_type.length > 0;
}

/**
 * Validates and sanitizes correlation ID
 */
function getValidCorrelationId(headerValue: unknown): string {
  if (typeof headerValue === 'string' && headerValue.length > 0 && headerValue.length <= 128) {
    const sanitized = headerValue.trim();
    if (uuidValidate(sanitized)) {
      return sanitized;
    }
  }
  return uuidv4();
}

/**
 * Safely serializes request body to string
 */
function serializePayload(body: unknown): string {
  try {
    if (typeof body === 'string') {
      return body;
    }
    return JSON.stringify(body);
  } catch (error) {
    logger.warn('Failed to serialize webhook payload', {
      error: error instanceof Error ? error.message : String(error),
    });
    return '{}';
  }
}

/**
 * Handle webhook endpoint
 * POST /webhook
 * 
 * Flow:
 * 1. Signature verification (completed by middleware before reaching this controller)
 * 2. Validate webhook event structure and extract identifiers
 * 3. Store webhook in database with 'received' status
 * 4. Send to SQS queue for asynchronous Lambda processing
 * 5. Return immediate 202 Accepted response
 * 6. Lambda processes in background and updates payment status
 */
async function handleWebhook(req: WebhookRequest, res: Response): Promise<Response> {
  const webhookEvent = req.webhookEvent;
  const paymentId = req.paymentId;
  const webhookId: string = (webhookEvent?.webhook_message_id as string) || uuidv4();
  const correlationId = getValidCorrelationId(req.headers['x-correlation-id']);

  // Validate required webhook event structure
  if (!isValidWebhookEvent(webhookEvent)) {
    logger.error('Invalid webhook event structure', {
      webhookId,
      correlationId,
      hasWebhookEvent: !!webhookEvent,
    });
    
    return res.status(HTTP_STATUS.ACCEPTED).json({
      status: WEBHOOK_STATUS.ERROR,
      webhookId,
      error: 'Invalid webhook event structure',
      message: 'Webhook validation failed',
    } as WebhookResponse);
  }

  // Validate payment ID
  if (!paymentId || typeof paymentId !== 'string' || paymentId.length === 0) {
    logger.error('Missing or invalid payment ID', {
      webhookId,
      eventType: webhookEvent.event_type,
      correlationId,
    });
    
    return res.status(HTTP_STATUS.ACCEPTED).json({
      status: WEBHOOK_STATUS.ERROR,
      webhookId,
      error: 'Missing or invalid payment ID',
      message: 'Webhook validation failed',
    } as WebhookResponse);
  }

  logger.info('Webhook received', {
    webhookId,
    paymentId,
    eventType: webhookEvent.event_type,
    correlationId,
  });

  try {
    const rawPayload = serializePayload(req.body);

    const result: WebhookProcessingResult = await processWebhook(
      webhookId,
      paymentId,
      webhookEvent,
      rawPayload,
      correlationId
    );

    // Handle duplicate webhooks - idempotency
    if (result.isDuplicate) {
      logger.info('Duplicate webhook acknowledged', {
        webhookId,
        paymentId,
        correlationId,
      });

      return res.status(HTTP_STATUS.ACCEPTED).json({
        status: WEBHOOK_STATUS.DUPLICATE,
        webhookId,
        paymentId,
        message: 'Duplicate webhook already processed',
        isDuplicate: true,
      } as WebhookResponse);
    }

    // Success: Webhook stored and queued for async processing
    if (result.success) {
      logger.info('Webhook acknowledged and queued', {
        webhookId,
        paymentId,
        eventType: webhookEvent.event_type,
        correlationId,
      });

      return res.status(HTTP_STATUS.ACCEPTED).json({
        status: 'success',
        webhookId: String(webhookId),
        paymentId: webhookEvent.resource_id,
        event_type: webhookEvent.event_type,
        receivedAt: new Date().toISOString(),
      } as WebhookResponse);
    }

    // Retryable error (e.g., SQS temporarily unavailable)
    if (result.retryable) {
      logger.warn('Webhook processing encountered retryable error', {
        webhookId,
        paymentId,
        error: result.error,
        correlationId,
      });

      return res.status(HTTP_STATUS.ACCEPTED).json({
        status: WEBHOOK_STATUS.RETRYABLE_ERROR,
        webhookId,
        paymentId,
        error: result.error,
        message: 'Webhook processing scheduled for retry',
      } as WebhookResponse);
    }

    // Permanent failure (e.g., invalid event type, database constraint violation)
    logger.error('Webhook processing permanent error', {
      webhookId,
      paymentId,
      error: result.error,
      correlationId,
    });

    return res.status(HTTP_STATUS.ACCEPTED).json({
      status: WEBHOOK_STATUS.PERMANENT_ERROR,
      webhookId,
      paymentId,
      error: result.error,
      message: 'Webhook moved to dead-letter queue',
    } as WebhookResponse);
    
  } catch (error) {
    logger.error('Unexpected error processing webhook', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      webhookId,
      paymentId,
      correlationId,
    });

    return res.status(HTTP_STATUS.ACCEPTED).json({
      status: WEBHOOK_STATUS.ERROR,
      webhookId,
      paymentId,
      error: 'Unexpected error processing webhook',
      message: 'Webhook will be retried',
    } as WebhookResponse);
  }
}

/**
 * Health check endpoint
 * GET /health
 * Returns 200 if all checks pass, 503 if any check fails
 */
async function healthCheck(_req: Request, res: Response): Promise<Response> {
  const { checkDatabaseConnectivity } = require('../database/db');
  
  const health: any = {
    status: 'healthy',
    service: 'payment-webhook-receiver',
    timestamp: new Date().toISOString(),
    checks: {},
  };

  // Check database connectivity
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
      logger.error('[Health] Database connectivity check failed', { error: dbCheck.error });
      return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json(health);
    }
  } catch (error) {
    health.status = 'unhealthy';
    health.checks.database = {
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    logger.error('[Health] Database check failed', { error: error instanceof Error ? error.message : String(error) });
    return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json(health);
  }

  return res.status(HTTP_STATUS.OK).json(health);
}

export { handleWebhook, healthCheck };
