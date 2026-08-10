// Payment Webhook Service
// Simplified webhook storage per new architecture
// This service only stores webhooks to database with enqueued_at = NULL
// The pay-callback-relay Lambda will poll and send to SQS

import getLogger from '../utils/loggerHelper';
import { createSanitizedErrorLog } from '../utils/errorSanitizer';
import * as paymentWebhookRepository from '../repositories/paymentWebhookRepository';
import config from '../config/config';

const logger = getLogger(module);
const { ERROR_CODES } = require('../constants');

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

  logger.info('[WebhookService] Processing webhook', {
    webhookId,
    paymentId,
    eventType: event.event_type || 'unknown',
    correlationId,
  });

  if (!config.features.callbackServiceEnabled) {
    logger.warn('[WebhookService] Callback service is disabled', {
      webhookId,
      correlationId,
    });
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
      logger.info('[WebhookService] Duplicate webhook detected', {
        webhookId,
        paymentId,
        previousStatus: createResult.status,
        correlationId,
      });

      return {
        success: true,
        isDuplicate: true,
        paymentId,
      };
    }

    const duration = Date.now() - startTime;
    logger.info('[WebhookService] Webhook stored successfully', {
      webhookId,
      paymentId,
      eventType: event.event_type,
      duration,
      correlationId,
      note: 'Webhook will be polled by pay-callback-relay',
    });

    return {
      success: true,
      isDuplicate: false,
      paymentId,
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    const sanitizedError = createSanitizedErrorLog(error);

    logger.error('[WebhookService] Error storing webhook', {
      webhookId,
      paymentId,
      error_message: sanitizedError.sanitized_message,
      error_type: sanitizedError.error_type,
      code: error.code,
      duration,
      correlationId,
    });

    return {
      success: false,
      isDuplicate: false,
      paymentId,
      error: sanitizedError.sanitized_message,
      errorCode: error.code || ERROR_CODES.DATABASE_ERROR,
    };
  }
}
