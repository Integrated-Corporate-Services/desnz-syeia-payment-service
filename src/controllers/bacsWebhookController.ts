import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import getLogger from '../utils/loggerHelper';
import { processBACSWebhook } from '../services/bacsPaymentWebhookService';
import { checkDatabaseConnectivity } from '../database/db';
import { HTTP_STATUS, ERROR_CODES } from '../constants/error.constants';
import { BACSWebhookPayload } from '../types/bacsWebhook.types';
import { getValidSignatureOrGenerateId, serializeWebhookPayload } from '../utils/webhookUtils';
import {
  HEADER_CORRELATION_ID,
  OUTCOME_SUCCESS,
  OUTCOME_DUPLICATE,
  OUTCOME_ERROR_VALIDATION,
  OUTCOME_ERROR_DATABASE,
  OUTCOME_ERROR_INTERNAL,
} from '../constants/bacs.constants';
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

async function handleBACSWebhook(req: BACSWebhookRequest, res: Response): Promise<Response> {
  const webhookEvent = req.BACSWebhookEvent;
  const paymentId = req.paymentId;
  
  const eventId = webhookEvent?.event?.eventId || uuidv4();
  const deliveryId = webhookEvent?.callback?.deliveryId || uuidv4();
  const correlationId = (req.headers[HEADER_CORRELATION_ID] as string) || uuidv4();

  if (!webhookEvent) {
    logger.error('[BACSWebhook] Invalid event structure', {
      eventId,
      deliveryId,
      correlationId,
      outcome: OUTCOME_ERROR_VALIDATION,
      error_category: 'validation',
      error_code: ERROR_CODES.INVALID_WEBHOOK_STRUCTURE,
    });
    return res.status(HTTP_STATUS.ACCEPTED).json(buildValidationErrorResponse('Invalid webhook event structure'));
  }

  if (!paymentId || typeof paymentId !== 'string' || paymentId.length === 0) {
    logger.error('[BACSWebhook] Invalid payment reference', {
      eventId,
      deliveryId,
      correlationId,
      outcome: OUTCOME_ERROR_VALIDATION,
      error_category: 'validation',
      error_code: ERROR_CODES.INVALID_PAYMENT_ID,
    });
    return res.status(HTTP_STATUS.ACCEPTED).json(buildValidationErrorResponse('Missing or invalid payment reference'));
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
    const rawPayload = serializeWebhookPayload(req.body);
    const result: BACSWebhookProcessingResult = await processBACSWebhook(
      eventId,
      paymentId,
      webhookEvent,
      rawPayload,
      correlationId
    );

    if (result.isDuplicate) {
      logger.info('[BACSWebhook] Duplicate acknowledged', {
        eventId,
        deliveryId,
        paymentId,
        correlationId,
        outcome: OUTCOME_DUPLICATE,
        status_code: HTTP_STATUS.OK,
        is_duplicate: true,
        error_code: ERROR_CODES.DUPLICATE_WEBHOOK,
      });
      return res.status(HTTP_STATUS.OK).json(buildDuplicateResponse(correlationId));
    }

    if (result.success) {
      logger.info('[BACSWebhook] Webhook queued', {
        eventId,
        deliveryId,
        paymentId,
        correlationId,
        outcome: OUTCOME_SUCCESS,
        status_code: HTTP_STATUS.ACCEPTED,
        is_duplicate: false,
      });
      return res.status(HTTP_STATUS.ACCEPTED).json(buildSuccessResponse(correlationId));
    }

    if (result.retryable) {
      logger.warn('[BACSWebhook] Retryable error - database issue', {
        eventId,
        deliveryId,
        paymentId,
        error: result.error,
        correlationId,
        outcome: OUTCOME_ERROR_DATABASE,
        error_category: 'database',
        error_code: ERROR_CODES.DATABASE_ERROR,
        error_retryable: true,
        status_code: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      });
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'Internal error — please retry',
        errorCode: ERROR_CODES.DATABASE_ERROR,
      });
    }

    logger.error('[BACSWebhook] Permanent error - database issue', {
      eventId,
      deliveryId,
      paymentId,
      error: result.error,
      correlationId,
      outcome: OUTCOME_ERROR_DATABASE,
      error_category: 'database',
      error_code: ERROR_CODES.DATABASE_ERROR,
      error_retryable: false,
      status_code: HTTP_STATUS.INTERNAL_SERVER_ERROR,
    });
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Internal error — please retry',
      errorCode: ERROR_CODES.DATABASE_ERROR,
    });
  } catch (error) {
    logger.error('[BACSWebhook] Unexpected error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      eventId,
      deliveryId,
      paymentId,
      correlationId,
      outcome: OUTCOME_ERROR_INTERNAL,
      error_category: 'internal',
      error_code: ERROR_CODES.INTERNAL_SERVER_ERROR,
      status_code: HTTP_STATUS.INTERNAL_SERVER_ERROR,
    });
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Internal error — please retry',
      errorCode: ERROR_CODES.INTERNAL_SERVER_ERROR,
    });
  }
}

async function BACSHealthCheck(_req: Request, res: Response): Promise<Response> {
  const health = {
    status: 'healthy' as 'healthy' | 'unhealthy',
    service: 'bacs-webhook-receiver',
    timestamp: new Date().toISOString(),
    checks: {} as any,
  };

  try {
    const dbCheck = await checkDatabaseConnectivity();
    health.checks.database = {
      status: dbCheck.connected ? 'up' : 'down',
      latency_ms: dbCheck.latencyMs,
      ...(dbCheck.error && { error: dbCheck.error }),
    };

    if (!dbCheck.connected) {
      health.status = 'unhealthy';
      logger.error('[BACSHealth] Database down', { error: dbCheck.error });
      return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json(health);
    }
  } catch (error) {
    health.status = 'unhealthy';
    health.checks.database = {
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    logger.error('[BACSHealth] Check failed', { error: error instanceof Error ? error.message : String(error) });
    return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json(health);
  }

  logger.debug('[BACSHealth] Health check passed', { health });
  return res.status(HTTP_STATUS.OK).json(health);
}

export { handleBACSWebhook, BACSHealthCheck };
