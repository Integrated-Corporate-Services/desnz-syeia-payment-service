import { Request, Response } from 'express';
import { v4 as uuidv4, validate as uuidValidate } from 'uuid';
import getLogger from '../utils/loggerHelper';
import { processUKSBSWebhook } from '../services/uksbsPaymentWebhookService';
import { HTTP_STATUS } from '../constants/error.constants';
import { UKSBSWebhookPayload } from '../types/uksbsWebhook.types';

const logger = getLogger(module);

const WEBHOOK_STATUS = {
  DUPLICATE: 'duplicate',
  RETRYABLE_ERROR: 'retryable_error',
  PERMANENT_ERROR: 'permanent_error',
  ERROR: 'error',
} as const;

// Type definitions
interface UKSBSWebhookRequest extends Request {
  uksbsWebhookEvent?: UKSBSWebhookPayload;
  paymentId?: string;
}

interface UKSBSWebhookProcessingResult {
  success: boolean;
  isDuplicate?: boolean;
  retryable?: boolean;
  error?: string;
}

interface UKSBSWebhookResponse {
  status?: string;
  eventId: string;
  deliveryId: string;
  paymentReference?: string;
  message?: string;
  isDuplicate?: boolean;
  error?: string;
  receivedAt?: string;
  [key: string]: unknown;
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
    logger.warn('[UKSBSWebhook] Failed to serialize webhook payload', {
      error: error instanceof Error ? error.message : String(error),
    });
    return '{}';
  }
}

/**
 * Handle UKSBS webhook endpoint
 * POST /uksbs-callback/payment
 * 
 * Flow:
 * 1. Payload validation (completed by middleware before reaching this controller)
 * 2. Extract identifiers from UKSBS webhook structure
 * 3. Store webhook in database with 'pending' status
 * 4. Send to SQS queue for asynchronous Lambda processing (via pay-callback-relay)
 * 5. Return immediate 202 Accepted response
 * 6. Lambda processes in background and updates payment status
 */
async function handleUKSBSWebhook(req: UKSBSWebhookRequest, res: Response): Promise<Response> {
  const webhookEvent = req.uksbsWebhookEvent;
  const paymentId = req.paymentId;
  
  // Extract identifiers from UKSBS webhook structure
  const eventId = webhookEvent?.event?.eventId || uuidv4();
  const deliveryId = webhookEvent?.callback?.deliveryId || uuidv4();
  const correlationId = getValidCorrelationId(req.headers['x-correlation-id']);

  // Validate webhook event exists
  if (!webhookEvent) {
    logger.error('[UKSBSWebhook] Invalid webhook event structure', {
      eventId,
      deliveryId,
      correlationId,
    });
    
    return res.status(HTTP_STATUS.ACCEPTED).json({
      status: WEBHOOK_STATUS.ERROR,
      eventId,
      deliveryId,
      error: 'Invalid webhook event structure',
      message: 'Webhook validation failed',
    } as UKSBSWebhookResponse);
  }

  // Validate payment reference
  if (!paymentId || typeof paymentId !== 'string' || paymentId.length === 0) {
    logger.error('[UKSBSWebhook] Missing or invalid payment reference', {
      eventId,
      deliveryId,
      eventType: webhookEvent.event.eventType,
      correlationId,
    });
    
    return res.status(HTTP_STATUS.ACCEPTED).json({
      status: WEBHOOK_STATUS.ERROR,
      eventId,
      deliveryId,
      error: 'Missing or invalid payment reference',
      message: 'Webhook validation failed',
    } as UKSBSWebhookResponse);
  }

  logger.info('[UKSBSWebhook] Webhook received', {
    eventId,
    deliveryId,
    paymentReference: paymentId,
    eventType: webhookEvent.event.eventType,
    paymentStatus: webhookEvent.detail.status,
    attemptNumber: webhookEvent.callback.attemptNumber,
    source: webhookEvent.event.source,
    correlationId,
  });

  try {
    const rawPayload = serializePayload(req.body);

    const result: UKSBSWebhookProcessingResult = await processUKSBSWebhook(
      eventId,
      paymentId,
      webhookEvent,
      rawPayload,
      correlationId
    );

    // Handle duplicate webhooks - idempotency
    if (result.isDuplicate) {
      logger.info('[UKSBSWebhook] Duplicate webhook acknowledged', {
        eventId,
        deliveryId,
        paymentReference: paymentId,
        correlationId,
      });

      return res.status(HTTP_STATUS.ACCEPTED).json({
        status: WEBHOOK_STATUS.DUPLICATE,
        eventId,
        deliveryId,
        paymentReference: paymentId,
        message: 'Duplicate webhook already processed',
        isDuplicate: true,
      } as UKSBSWebhookResponse);
    }

    // Success: Webhook stored and queued for async processing
    if (result.success) {
      logger.info('[UKSBSWebhook] Webhook acknowledged and queued', {
        eventId,
        deliveryId,
        paymentReference: paymentId,
        eventType: webhookEvent.event.eventType,
        paymentStatus: webhookEvent.detail.status,
        amount: webhookEvent.detail.amount,
        currency: webhookEvent.detail.currency,
        correlationId,
      });

      return res.status(HTTP_STATUS.ACCEPTED).json({
        status: 'success',
        eventId,
        deliveryId,
        paymentReference: paymentId,
        eventType: webhookEvent.event.eventType,
        paymentStatus: webhookEvent.detail.status,
        receivedAt: new Date().toISOString(),
      } as UKSBSWebhookResponse);
    }

    // Retryable error (e.g., database temporarily unavailable)
    if (result.retryable) {
      logger.warn('[UKSBSWebhook] Webhook processing encountered retryable error', {
        eventId,
        deliveryId,
        paymentReference: paymentId,
        error: result.error,
        correlationId,
      });

      return res.status(HTTP_STATUS.ACCEPTED).json({
        status: WEBHOOK_STATUS.RETRYABLE_ERROR,
        eventId,
        deliveryId,
        paymentReference: paymentId,
        error: result.error,
        message: 'Webhook processing scheduled for retry',
      } as UKSBSWebhookResponse);
    }

    // Permanent failure (e.g., invalid event type, database constraint violation)
    logger.error('[UKSBSWebhook] Webhook processing permanent error', {
      eventId,
      deliveryId,
      paymentReference: paymentId,
      error: result.error,
      correlationId,
    });

    return res.status(HTTP_STATUS.ACCEPTED).json({
      status: WEBHOOK_STATUS.PERMANENT_ERROR,
      eventId,
      deliveryId,
      paymentReference: paymentId,
      error: result.error,
      message: 'Webhook moved to dead-letter queue',
    } as UKSBSWebhookResponse);
    
  } catch (error) {
    logger.error('[UKSBSWebhook] Unexpected error processing webhook', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      eventId,
      deliveryId,
      paymentReference: paymentId,
      correlationId,
    });

    return res.status(HTTP_STATUS.ACCEPTED).json({
      status: WEBHOOK_STATUS.ERROR,
      eventId,
      deliveryId,
      paymentReference: paymentId,
      error: 'Unexpected error processing webhook',
      message: 'Webhook will be retried',
    } as UKSBSWebhookResponse);
  }
}

/**
 * Health check endpoint for UKSBS callback service
 * GET /uksbs-callback/health
 * Returns 200 if all checks pass, 503 if any check fails
 */
async function uksbsHealthCheck(_req: Request, res: Response): Promise<Response> {
  const { checkDatabaseConnectivity } = require('../database/db');
  
  const health: any = {
    status: 'healthy',
    service: 'uksbs-webhook-receiver',
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
      logger.error('[UKSBSHealth] Database connectivity check failed', { error: dbCheck.error });
      return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json(health);
    }
  } catch (error) {
    health.status = 'unhealthy';
    health.checks.database = {
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    logger.error('[UKSBSHealth] Database check failed', { 
      error: error instanceof Error ? error.message : String(error) 
    });
    return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json(health);
  }

  return res.status(HTTP_STATUS.OK).json(health);
}

export { handleUKSBSWebhook, uksbsHealthCheck };
