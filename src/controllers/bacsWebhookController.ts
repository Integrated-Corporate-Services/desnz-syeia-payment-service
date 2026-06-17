import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import getLogger from '../utils/loggerHelper';
import { processBACSWebhook } from '../services/bacsPaymentWebhookService';
import { checkDatabaseConnectivity } from '../database/db';
import { HTTP_STATUS } from '../constants/error.constants';
import { BACSWebhookPayload } from '../types/bacsWebhook.types';
import { 
  getValidSignatureOrGenerateId, 
  serializeWebhookPayload 
} from '../utils/webhookUtils';
import {
  BACSWebhookResponse,
  buildSuccessResponse,
  buildDuplicateResponse,
  buildValidationErrorResponse,
  buildRetryableErrorResponse,
  buildPermanentErrorResponse,
  buildUnexpectedErrorResponse,
} from '../utils/bacsResponseBuilder';

const logger = getLogger(module);

// Type definitions
interface BACSWebhookRequest extends Request {
  BACSWebhookEvent?: BACSWebhookPayload;
  paymentId?: string;
}

interface BACSWebhookProcessingResult {
  success: boolean;
  isDuplicate?: boolean;
  retryable?: boolean;
  error?: string;
}

/**
 * Handle BACS webhook endpoint
 * POST /webhooks/bacs/payment
 * 
 * Responsibilities:
 * - Extract and validate webhook identifiers
 * - Delegate to service layer for business logic
 * - Return appropriate HTTP responses
 * 
 * Flow:
 * 1. Payload validation (completed by middleware before reaching this controller)
 * 2. Extract identifiers from BACS webhook structure
 * 3. Delegate to service layer to store webhook in database
 * 4. Return immediate HTTP response based on processing result
 * 
 * Note: Async processing is handled by separate Lambda (pay-callback-relay)
 */
async function handleBACSWebhook(req: BACSWebhookRequest, res: Response): Promise<Response> {
  const webhookEvent = req.BACSWebhookEvent;
  const paymentId = req.paymentId;
  
  // Extract identifiers from BACS webhook structure
  const eventId = webhookEvent?.event?.eventId || uuidv4();
  const deliveryId = webhookEvent?.callback?.deliveryId || uuidv4();
  const correlationId = (req.headers['x-correlation-id'] as string) || uuidv4();

  // Validate webhook event exists (should never fail due to middleware, but defensive check)
  if (!webhookEvent) {
    const responseBody = buildValidationErrorResponse(
      eventId,
      deliveryId,
      'Invalid webhook event structure'
    );
    
    logger.error('[BACSWebhook] Invalid webhook event structure', {
      eventId,
      deliveryId,
      correlationId,
      statusCode: HTTP_STATUS.ACCEPTED,
      response: responseBody,
    });
    
    return res.status(HTTP_STATUS.ACCEPTED).json(responseBody);
  }

  // Validate payment reference
  if (!paymentId || typeof paymentId !== 'string' || paymentId.length === 0) {
    const responseBody = buildValidationErrorResponse(
      eventId,
      deliveryId,
      'Missing or invalid payment reference'
    );
    
    logger.error('[BACSWebhook] Missing or invalid payment reference', {
      eventId,
      deliveryId,
      eventType: webhookEvent.event.eventType,
      correlationId,
      statusCode: HTTP_STATUS.ACCEPTED,
      response: responseBody,
    });
    
    return res.status(HTTP_STATUS.ACCEPTED).json(responseBody);
  }

  logger.info('[BACSWebhook] Webhook received', {
    eventId,
    deliveryId,
    paymentReference: paymentId,
    eventType: webhookEvent.event.eventType,
    paymentStatus: webhookEvent.detail.status,
    attemptNumber: webhookEvent.callback?.attemptNumber,
    source: webhookEvent.event.source,
    correlationId,
  });

  try {
    // Serialize payload for audit trail storage
    const rawPayload = serializeWebhookPayload(req.body);

    // Delegate to service layer for business logic
    const result: BACSWebhookProcessingResult = await processBACSWebhook(
      eventId,
      paymentId,
      webhookEvent,
      rawPayload,
      correlationId
    );

    // Handle duplicate webhooks - idempotency (HTTP 200 signals partner to stop retrying)
    if (result.isDuplicate) {
      const responseBody = buildDuplicateResponse(
        eventId,
        deliveryId,
        paymentId,
        correlationId
      );
      
      logger.info('[BACSWebhook] Duplicate webhook acknowledged', {
        eventId,
        deliveryId,
        paymentReference: paymentId,
        correlationId,
        statusCode: HTTP_STATUS.OK,
        response: responseBody,
      });

      return res.status(HTTP_STATUS.OK).json(responseBody);
    }

    // Success: Webhook stored and queued for async processing (HTTP 202)
    if (result.success) {
      const responseBody = buildSuccessResponse(
        eventId,
        deliveryId,
        paymentId,
        webhookEvent.event.eventType,
        webhookEvent.detail.status,
        correlationId
      );
      
      logger.info('[BACSWebhook] Webhook acknowledged and queued', {
        eventId,
        deliveryId,
        paymentReference: paymentId,
        eventType: webhookEvent.event.eventType,
        paymentStatus: webhookEvent.detail.status,
        amount: webhookEvent.detail.amount,
        currency: webhookEvent.detail.currency,
        correlationId,
        statusCode: HTTP_STATUS.ACCEPTED,
        response: responseBody,
      });

      return res.status(HTTP_STATUS.ACCEPTED).json(responseBody);
    }

    // Retryable error (e.g., database temporarily unavailable) - HTTP 202 allows retry
    if (result.retryable) {
      const responseBody = buildRetryableErrorResponse(
        eventId,
        deliveryId,
        paymentId,
        result.error || 'Unknown retryable error'
      );
      
      logger.warn('[BACSWebhook] Webhook processing encountered retryable error', {
        eventId,
        deliveryId,
        paymentReference: paymentId,
        error: result.error,
        correlationId,
        statusCode: HTTP_STATUS.ACCEPTED,
        response: responseBody,
      });

      return res.status(HTTP_STATUS.ACCEPTED).json(responseBody);
    }

    // Permanent failure (e.g., invalid event type, constraint violation) - HTTP 202 but DLQ
    const responseBody = buildPermanentErrorResponse(
      eventId,
      deliveryId,
      paymentId,
      result.error || 'Unknown permanent error'
    );
    
    logger.error('[BACSWebhook] Webhook processing permanent error', {
      eventId,
      deliveryId,
      paymentReference: paymentId,
      error: result.error,
      correlationId,
      statusCode: HTTP_STATUS.ACCEPTED,
      response: responseBody,
    });

    return res.status(HTTP_STATUS.ACCEPTED).json(responseBody);
    
  } catch (error) {
    // Unexpected exception - log with stack trace and return generic error
    const responseBody = buildUnexpectedErrorResponse(
      eventId,
      deliveryId,
      paymentId
    );
    
    logger.error('[BACSWebhook] Unexpected error processing webhook', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      eventId,
      deliveryId,
      paymentReference: paymentId,
      correlationId,
      statusCode: HTTP_STATUS.ACCEPTED,
      response: responseBody,
    });

    return res.status(HTTP_STATUS.ACCEPTED).json(responseBody);
  }
}

/**
 * Health check endpoint for BACS webhook service
 * GET /webhooks/bacs/health
 * 
 * Responsibilities:
 * - Check database connectivity
 * - Return service health status
 * 
 * Returns:
 * - 200 OK if all checks pass
 * - 503 Service Unavailable if any check fails
 */
async function BACSHealthCheck(_req: Request, res: Response): Promise<Response> {
  interface HealthCheck {
    status: 'healthy' | 'unhealthy';
    service: string;
    timestamp: string;
    checks: {
      database?: {
        status: 'up' | 'down';
        latency_ms?: number;
        error?: string;
      };
    };
  }
  
  const health: HealthCheck = {
    status: 'healthy',
    service: 'bacs-webhook-receiver',
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
      logger.error('[BACSHealth] Database connectivity check failed', { 
        error: dbCheck.error 
      });
      return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json(health);
    }
  } catch (error) {
    health.status = 'unhealthy';
    health.checks.database = {
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    logger.error('[BACSHealth] Database check failed', { 
      error: error instanceof Error ? error.message : String(error) 
    });
    return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json(health);
  }

  logger.debug('[BACSHealth] Health check passed', { health });
  return res.status(HTTP_STATUS.OK).json(health);
}

export { handleBACSWebhook, BACSHealthCheck };
