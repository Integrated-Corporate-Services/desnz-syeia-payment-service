import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import getLogger from '../utils/loggerHelper';
import { getRequestContext } from '../middlewares/requestContext';
import { processBACSWebhook } from '../services/bacsPaymentWebhookService';
import { checkDatabaseConnectivity } from '../database/db';
import { HTTP_STATUS, ERROR_CODES, ERROR_CATEGORIES } from '../constants/error.constants';
import { BACSWebhookPayload } from '../types/bacsWebhook.types';
import { serializeWebhookPayload } from '../utils/webhookUtils';
import { createSanitizedErrorLog } from '../utils/errorSanitizer';
import {
  OUTCOME_SUCCESS,
  OUTCOME_DUPLICATE,
  OUTCOME_ERROR_VALIDATION,
  OUTCOME_ERROR_DATABASE,
  OUTCOME_ERROR_INTERNAL,
} from '../constants/bacs.constants';
import {
  buildSuccessResponse,
  buildDuplicateResponse,
  buildValidationErrorResponse,
} from '../utils/bacsResponseBuilder';

const logger = getLogger(module);

const FILE = 'bacsWebhookController.ts';

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
  const start = Date.now();
  const webhookEvent = req.BACSWebhookEvent;
  const paymentId = req.paymentId;

  const eventId = webhookEvent?.event?.eventId || uuidv4();
  const deliveryId = webhookEvent?.callback?.deliveryId || uuidv4();
  const correlationId = getRequestContext()?.correlation_id || uuidv4();

  logger.info(`[BACS][BACS_WEBHOOK][RECEIVED][${FILE}][handleBACSWebhook] eventId=${eventId} deliveryId=${deliveryId} correlationId=${correlationId}`);
  try {
    return await handleBACSWebhookInternal(req, res, { webhookEvent, paymentId, eventId, deliveryId, correlationId });
  } finally {
    logger.info(`[BACS][BACS_WEBHOOK][ENDED][${FILE}][handleBACSWebhook] eventId=${eventId} deliveryId=${deliveryId} correlationId=${correlationId} durationMs=${Date.now() - start}`);
  }
}

async function handleBACSWebhookInternal(
  req: BACSWebhookRequest,
  res: Response,
  ctx: {
    webhookEvent?: BACSWebhookPayload;
    paymentId?: string;
    eventId: string;
    deliveryId: string;
    correlationId: string;
  }
): Promise<Response> {
  const { webhookEvent, paymentId, eventId, deliveryId, correlationId } = ctx;

  if (!webhookEvent) {
    logger.error(`[BACS][WEBHOOK][FAILED][${FILE}][handleBACSWebhookInternal] error=invalid_event_structure outcome=${OUTCOME_ERROR_VALIDATION} category=${ERROR_CATEGORIES.VALIDATION} code=${ERROR_CODES.INVALID_WEBHOOK_STRUCTURE} - eventId=${eventId} deliveryId=${deliveryId} correlationId=${correlationId}`);
    return res.status(HTTP_STATUS.ACCEPTED).json(buildValidationErrorResponse('Invalid webhook event structure'));
  }

  if (!paymentId || typeof paymentId !== 'string' || paymentId.length === 0) {
    logger.error(`[BACS][WEBHOOK][FAILED][${FILE}][handleBACSWebhookInternal] error=invalid_payment_reference outcome=${OUTCOME_ERROR_VALIDATION} category=${ERROR_CATEGORIES.VALIDATION} code=${ERROR_CODES.INVALID_PAYMENT_ID} - eventId=${eventId} deliveryId=${deliveryId} correlationId=${correlationId}`);
    return res.status(HTTP_STATUS.ACCEPTED).json(buildValidationErrorResponse('Missing or invalid payment reference'));
  }


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
      logger.info(`[BACS][WEBHOOK][WEBHOOK_DUPLICATE_ACKNOWLEDGED][${FILE}][handleBACSWebhookInternal] duplicate acknowledged - eventId=${eventId} deliveryId=${deliveryId} paymentId=${paymentId} outcome=${OUTCOME_DUPLICATE} correlationId=${correlationId}`);
      return res.status(HTTP_STATUS.OK).json(buildDuplicateResponse(correlationId));
    }

    if (result.success) {
      logger.info(`[BACS][WEBHOOK][WEBHOOK_QUEUED][${FILE}][handleBACSWebhookInternal] webhook queued - eventId=${eventId} deliveryId=${deliveryId} paymentId=${paymentId} outcome=${OUTCOME_SUCCESS} correlationId=${correlationId}`);
      return res.status(HTTP_STATUS.ACCEPTED).json(buildSuccessResponse(correlationId));
    }

    if (result.retryable) {
      const sanitizedError = createSanitizedErrorLog(result.error);
      logger.error(`[BACS][WEBHOOK][FAILED][${FILE}][handleBACSWebhookInternal] error=${sanitizedError.sanitized_message} errorType=${sanitizedError.error_type} outcome=${OUTCOME_ERROR_DATABASE} category=${ERROR_CATEGORIES.DATABASE} code=${ERROR_CODES.DATABASE_ERROR} retryable=true - eventId=${eventId} deliveryId=${deliveryId} paymentId=${paymentId} correlationId=${correlationId}`);
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        error: 'Internal error — please retry',
        errorCode: ERROR_CODES.DATABASE_ERROR,
      });
    }

    const sanitizedError = createSanitizedErrorLog(result.error);
    logger.error(`[BACS][WEBHOOK][FAILED][${FILE}][handleBACSWebhookInternal] error=${sanitizedError.sanitized_message} errorType=${sanitizedError.error_type} outcome=${OUTCOME_ERROR_DATABASE} code=${ERROR_CODES.DATABASE_ERROR} retryable=false - eventId=${eventId} deliveryId=${deliveryId} paymentId=${paymentId} correlationId=${correlationId}`);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Internal error — please retry',
      errorCode: ERROR_CODES.DATABASE_ERROR,
    });
  } catch (error) {
    const sanitizedError = createSanitizedErrorLog(error);
    logger.error(`[BACS][WEBHOOK][FAILED][${FILE}][handleBACSWebhookInternal] error=${sanitizedError.sanitized_message} errorType=${sanitizedError.error_type} isDatabaseError=${sanitizedError.is_database_error} outcome=${OUTCOME_ERROR_INTERNAL} category=${ERROR_CATEGORIES.INTERNAL} code=${ERROR_CODES.INTERNAL_SERVER_ERROR} - eventId=${eventId} deliveryId=${deliveryId} paymentId=${paymentId} correlationId=${correlationId}`);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Internal error — please retry',
      errorCode: ERROR_CODES.INTERNAL_SERVER_ERROR,
    });
  }
}

async function BACSHealthCheck(_req: Request, res: Response): Promise<Response> {
  const start = Date.now();
  logger.info(`[BACS][WEBHOOK][STARTED][${FILE}][BACSHealthCheck]`);
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
      logger.error(`[BACS][WEBHOOK][FAILED][${FILE}][BACSHealthCheck] error=database_down - error=${dbCheck.error} durationMs=${Date.now() - start}`);
      return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json(health);
    }
  } catch (error) {
    health.status = 'unhealthy';
    health.checks.database = {
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    logger.error(`[BACS][WEBHOOK][FAILED][${FILE}][BACSHealthCheck] error=${error instanceof Error ? error.message : String(error)} durationMs=${Date.now() - start}`);
    return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json(health);
  }

  logger.info(`[BACS][WEBHOOK][ENDED][${FILE}][BACSHealthCheck] status=${health.status} durationMs=${Date.now() - start}`);
  return res.status(HTTP_STATUS.OK).json(health);
}

export { handleBACSWebhook, BACSHealthCheck };
