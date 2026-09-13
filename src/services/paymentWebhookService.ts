// Payment Webhook Service
// Simplified webhook storage per new architecture
// This service only stores webhooks to database with enqueued_at = NULL
// The pay-callback-relay Lambda will poll and send to SQS

import getLogger from '../utils/loggerHelper';
import * as paymentWebhookRepository from '../repositories/paymentWebhookRepository';
import config from '../config/config';

const logger = getLogger(module);
const { ERROR_CODES } = require('../constants');

const FILE = 'paymentWebhookService.ts';

interface WebhookProcessingResult {
  success: boolean;
  isDuplicate: boolean;
  paymentId: string;
  error?: string;
  errorCode?: string;
}

/**
 * Process webhook - simplified architecture
 * 1. Store webhook in database with status='pending' and enqueued_at=NULL
 * 2. Return immediately (no SQS interaction)
 * 3. pay-callback-relay will poll and send to SQS
 *
 * @param webhookId - Unique webhook identifier from GOV.UK Pay
 * @param paymentId - Application/payment reference ID
 * @param event - Webhook event object
 * @param rawPayload - Raw webhook payload (will be stored as JSONB)
 * @param correlationId - Correlation ID for tracing
 * @returns Processing result indicating success/duplicate/error
 */
export async function processWebhook(
  webhookId: string,
  paymentId: string,
  event: any,
  rawPayload: any,
  correlationId: string
): Promise<WebhookProcessingResult> {
  const startTime = Date.now();
  logger.info(`[GOVPAY][STARTED][${FILE}][processWebhook] webhookId=${webhookId} paymentId=${paymentId} correlationId=${correlationId}`);
  try {
    return await processWebhookInternal(webhookId, paymentId, event, rawPayload, correlationId, startTime);
  } finally {
    logger.info(`[GOVPAY][ENDED][${FILE}][processWebhook] webhookId=${webhookId} paymentId=${paymentId} correlationId=${correlationId} durationMs=${Date.now() - startTime}`);
  }
}

async function processWebhookInternal(
  webhookId: string,
  paymentId: string,
  event: any,
  rawPayload: any,
  correlationId: string,
  startTime: number
): Promise<WebhookProcessingResult> {
  logger.info(`[GOVPAY][EVENT][${FILE}][processWebhookInternal] processing webhook - webhookId=${webhookId} paymentId=${paymentId} eventType=${event.event_type || 'unknown'} correlationId=${correlationId}`);

  if (!config.features.callbackServiceEnabled) {
    logger.error(`[GOVPAY][FAILED][${FILE}][processWebhookInternal] error=callback_service_disabled - webhookId=${webhookId} correlationId=${correlationId}`);
    return {
      success: false,
      isDuplicate: false,
      paymentId,
      error: 'Callback service is disabled',
      errorCode: ERROR_CODES.CONFIGURATION_ERROR,
    };
  }

  try {
    // Store webhook in database with ON CONFLICT for idempotency
    // enqueued_at will be NULL until pay-callback-relay sends to SQS
    const createResult = await paymentWebhookRepository.createWebhook({
      webhook_id: webhookId,
      payment_id: paymentId,
      event_type: event.event_type || 'unknown',
      status: 'pending',
      raw_payload: rawPayload,  // Stored as JSONB
      created_by: 'inbound-event-receiver',
      correlation_id: correlationId,
    });

    // Check if this was a duplicate (returned by ON CONFLICT)
    if (createResult && createResult.isDuplicate) {
      logger.info(`[GOVPAY][EVENT][${FILE}][processWebhookInternal] duplicate webhook detected - webhookId=${webhookId} paymentId=${paymentId} previousStatus=${createResult.status} correlationId=${correlationId}`);

      return {
        success: true,
        isDuplicate: true,
        paymentId,
      };
    }

    const duration = Date.now() - startTime;
    logger.info(`[GOVPAY][EVENT][${FILE}][processWebhookInternal] webhook stored successfully - webhookId=${webhookId} paymentId=${paymentId} eventType=${event.event_type} durationMs=${duration} correlationId=${correlationId}`);

    return {
      success: true,
      isDuplicate: false,
      paymentId,
    };
  } catch (error: any) {
    const errorMessage = error.message || String(error);
    const duration = Date.now() - startTime;

    logger.error(`[GOVPAY][FAILED][${FILE}][processWebhookInternal] error=${errorMessage} code=${error.code} - webhookId=${webhookId} paymentId=${paymentId} correlationId=${correlationId} durationMs=${duration}`);

    return {
      success: false,
      isDuplicate: false,
      paymentId,
      error: errorMessage,
      errorCode: error.code || ERROR_CODES.DATABASE_ERROR,
    };
  }
}
