import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import getLogger from '../utils/loggerHelper';
import { getRequestContext } from '../middlewares/requestContext';
import { processWebhook } from '../services/paymentWebhookService';
import { HTTP_STATUS } from '../constants/error.constants';
import { checkDatabaseConnectivity } from '../database/db';

const logger = getLogger(module);

const FILE = 'callbackController.ts';

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
 * Safely serializes request body to string
 */
function serializePayload(body: unknown): string {
  try {
    if (typeof body === 'string') {
      return body;
    }
    return JSON.stringify(body);
  } catch (error) {
    logger.warn(`[GOVPAY][EVENT][${FILE}][serializePayload] failed to serialize webhook payload - error=${error instanceof Error ? error.message : String(error)}`);
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
  const start = Date.now();
  const webhookEvent = req.webhookEvent;
  const paymentId = req.paymentId;
  const webhookId: string = (webhookEvent?.webhook_message_id as string) || uuidv4();
  const correlationId = getRequestContext()?.correlation_id || uuidv4();

  logger.info(`[GOVPAY][STARTED][${FILE}][handleWebhook] webhookId=${webhookId} correlationId=${correlationId}`);
  try {
    return await handleWebhookInternal(req, res, { webhookEvent, paymentId, webhookId, correlationId });
  } finally {
    logger.info(`[GOVPAY][ENDED][${FILE}][handleWebhook] webhookId=${webhookId} correlationId=${correlationId} durationMs=${Date.now() - start}`);
  }
}

async function handleWebhookInternal(
  req: WebhookRequest,
  res: Response,
  ctx: { webhookEvent?: WebhookEvent; paymentId?: string; webhookId: string; correlationId: string }
): Promise<Response> {
  const { webhookEvent, paymentId, webhookId, correlationId } = ctx;

  // Validate required webhook event structure
  if (!isValidWebhookEvent(webhookEvent)) {
    logger.error(`[GOVPAY][FAILED][${FILE}][handleWebhookInternal] error=invalid_webhook_event_structure - webhookId=${webhookId} correlationId=${correlationId}`);

    return res.status(HTTP_STATUS.ACCEPTED).json({
      status: WEBHOOK_STATUS.ERROR,
      webhookId,
      error: 'Invalid webhook event structure',
      message: 'Webhook validation failed',
    } as WebhookResponse);
  }

  // Validate payment ID
  if (!paymentId || typeof paymentId !== 'string' || paymentId.length === 0) {
    logger.error(`[GOVPAY][FAILED][${FILE}][handleWebhookInternal] error=missing_or_invalid_payment_id - webhookId=${webhookId} eventType=${webhookEvent.event_type} correlationId=${correlationId}`);

    return res.status(HTTP_STATUS.ACCEPTED).json({
      status: WEBHOOK_STATUS.ERROR,
      webhookId,
      error: 'Missing or invalid payment ID',
      message: 'Webhook validation failed',
    } as WebhookResponse);
  }

  logger.info(`[GOVPAY][EVENT][${FILE}][handleWebhookInternal] webhook received - webhookId=${webhookId} paymentId=${paymentId} eventType=${webhookEvent.event_type} correlationId=${correlationId}`);

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
      logger.info(`[GOVPAY][EVENT][${FILE}][handleWebhookInternal] duplicate webhook acknowledged - webhookId=${webhookId} paymentId=${paymentId} correlationId=${correlationId}`);

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
      logger.info(`[GOVPAY][EVENT][${FILE}][handleWebhookInternal] webhook acknowledged and queued - webhookId=${webhookId} paymentId=${paymentId} eventType=${webhookEvent.event_type} correlationId=${correlationId}`);

      return res.status(HTTP_STATUS.ACCEPTED).json({
        status: 'success',
        webhookId: String(webhookId),
        paymentId: webhookEvent.resource_id,
        event_type: webhookEvent.event_type,
        receivedAt: new Date().toISOString(),
      } as WebhookResponse);
    }

    if (result.retryable) {
      logger.error(`[GOVPAY][FAILED][${FILE}][handleWebhookInternal] outcome=retryable_error error=${result.error} - webhookId=${webhookId} paymentId=${paymentId} correlationId=${correlationId}`);

      return res.status(HTTP_STATUS.ACCEPTED).json({
        status: WEBHOOK_STATUS.RETRYABLE_ERROR,
        webhookId,
        paymentId,
        message: 'Webhook accepted but processing failed temporarily',
      } as WebhookResponse);
    }

    // Permanent failure (e.g., invalid event type, database constraint violation)
    logger.error(`[GOVPAY][FAILED][${FILE}][handleWebhookInternal] outcome=permanent_error error=${result.error} - webhookId=${webhookId} paymentId=${paymentId} correlationId=${correlationId}`);

    return res.status(HTTP_STATUS.ACCEPTED).json({
      status: WEBHOOK_STATUS.PERMANENT_ERROR,
      webhookId,
      paymentId,
      message: 'Webhook accepted but cannot be processed',
    } as WebhookResponse);

  } catch (error) {
    logger.error(`[GOVPAY][FAILED][${FILE}][handleWebhookInternal] error=${error instanceof Error ? error.message : String(error)} - webhookId=${webhookId} paymentId=${paymentId} correlationId=${correlationId}`, {
      stack: error instanceof Error ? error.stack : undefined,
    });

    return res.status(HTTP_STATUS.ACCEPTED).json({
      status: WEBHOOK_STATUS.ERROR,
      webhookId,
      paymentId,
      message: 'Webhook accepted but processing encountered an error',
    } as WebhookResponse);
  }
}

/**
 * Health check endpoint
 * GET /health
 * Returns 200 if all checks pass, 503 if any check fails
 */
async function healthCheck(_req: Request, res: Response): Promise<Response> {
  const start = Date.now();
  logger.info(`[GOVPAY][STARTED][${FILE}][healthCheck] applicationId=n/a`);
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
      logger.error(`[GOVPAY][FAILED][${FILE}][healthCheck] error=database_connectivity_check_failed - error=${dbCheck.error} durationMs=${Date.now() - start}`);
      return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json(health);
    }
  } catch (error) {
    health.status = 'unhealthy';
    health.checks.database = {
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    logger.error(`[GOVPAY][FAILED][${FILE}][healthCheck] error=${error instanceof Error ? error.message : String(error)} durationMs=${Date.now() - start}`);
    return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json(health);
  }

  logger.info(`[GOVPAY][ENDED][${FILE}][healthCheck] status=${health.status} durationMs=${Date.now() - start}`);
  return res.status(HTTP_STATUS.OK).json(health);
}

export { handleWebhook, healthCheck };
