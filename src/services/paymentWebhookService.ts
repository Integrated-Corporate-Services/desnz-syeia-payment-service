// Payment Webhook Service
// Handles webhook processing with deduplication, retries, and dead-letter queue

import getLogger from '../utils/loggerHelper';
import * as paymentWebhookRepository from '../repositories/paymentWebhookRepository';
import config from '../config/config';
import * as sqsService from './sqsService';

const logger = getLogger(module);
const { 
  RETRYABLE_ERROR_CODES, 
  RETRYABLE_ERROR_KEYWORDS,
  ERROR_CODES 
} = require('../constants');

interface WebhookProcessingResult {
  success: boolean;
  isDuplicate: boolean;
  paymentId: string;
  error?: string;
  errorCode?: string;
  retryable?: boolean;
}

function isRetryableError(error: any): boolean {
  const errorMessage = error?.message || error?.toString() || '';
  const errorCode = error?.code || '';

  // Check if error code is retryable
  if (RETRYABLE_ERROR_CODES.includes(errorCode)) {
    return true;
  }

  // Check if error message contains any retryable keywords
  const lowerMessage = errorMessage.toLowerCase();
  if (RETRYABLE_ERROR_KEYWORDS.some((keyword: string) => lowerMessage.includes(keyword.toLowerCase()))) {
    return true;
  }

  return false;
}

export async function processWebhook(
  webhookId: string,
  paymentId: string,
  event: any,
  rawPayload: string,
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
    // Use INSERT ON CONFLICT to prevent race conditions on duplicate webhooks
    const createResult = await paymentWebhookRepository.createWebhook({
      webhook_id: webhookId,
      govuk_pay_id: paymentId,
      event_type: event.event_type || 'unknown',
      status: 'processing',
      raw_payload: rawPayload,
      retry_count: 0,
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

    // Payment status updates are handled asynchronously by Lambda/SQS processing.
    // No GOV.UK Pay API calls are made in the inbound receiver.

    // Send to SQS for Lambda processing
    if (config.aws.sqsEnabled && config.aws.sqsQueueUrl) {
      try {
        const sqsResult = await sqsService.sendWebhookToSQS({
          webhookId,
          paymentId,
          eventType: event.event_type || 'unknown',
          payload: event,
          correlationId,
        });

        logger.info('[WebhookService] Sent to SQS for Lambda processing', {
          webhookId,
          paymentId,
          messageId: sqsResult.messageId,
          correlationId,
        });

        // Lambda will update the final status based on event type
        // Do NOT update status here to avoid race conditions
        logger.info('[WebhookService] Webhook queued for Lambda - status will be updated by Lambda', {
          webhookId,
          paymentId,
          sqsMessageId: sqsResult.messageId,
        });

        // Return immediately after sending to SQS - Lambda will handle additional processing
        return {
          success: true,
          isDuplicate: false,
          paymentId,
        };
      } catch (sqsError: any) {
        logger.error('[WebhookService] Failed to send to SQS', {
          webhookId,
          paymentId,
          error: sqsError.message,
          correlationId,
        });

        // Mark webhook as failed (SQS send failed)
        await paymentWebhookRepository.updateWebhookStatus(webhookId, 'failed');

        // Still return success - webhook is stored and can be reprocessed
        logger.warn('[WebhookService] SQS send failed but webhook stored for retry', {
          webhookId,
          paymentId,
          correlationId,
        });

        return {
          success: true,
          isDuplicate: false,
          paymentId,
        };
      }
    }

    // SQS is disabled - mark webhook as processing (awaiting manual action)
    logger.info('[WebhookService] SQS disabled - webhook stored for manual processing', {
      webhookId,
      paymentId,
      correlationId,
    });

    await paymentWebhookRepository.updateWebhookStatus(webhookId, 'processing');

    return {
      success: true,
      isDuplicate: false,
      paymentId,
    };
  } catch (error: any) {
    const errorMessage = error.message || String(error);
    const retryable = isRetryableError(error);

    logger.error('[WebhookService] Error processing webhook', {
      webhookId,
      paymentId,
      error: errorMessage,
      code: error.code,
      retryable,
      correlationId,
    });

    try {
      if (retryable && config.features.retryEnabled) {
        await paymentWebhookRepository.recordRetryableError(
          webhookId,
          errorMessage,
          config.webhook.retryIntervals
        );

        return {
          success: false,
          isDuplicate: false,
          paymentId,
          error: errorMessage,
          errorCode: ERROR_CODES.DATABASE_ERROR,
          retryable: true,
        };
      } else {
        if (config.features.dlqEnabled) {
          await paymentWebhookRepository.moveToDeadLetterQueue(webhookId, errorMessage);
        }

        return {
          success: false,
          isDuplicate: false,
          paymentId,
          error: errorMessage,
          errorCode: ERROR_CODES.INTERNAL_SERVER_ERROR,
          retryable: false,
        };
      }
    } catch (errorHandlingFailed: any) {
      logger.error('[WebhookService] Error handling failed', {
        webhookId,
        paymentId,
        originalError: errorMessage,
        handlingError: errorHandlingFailed.message,
      });

      return {
        success: false,
        isDuplicate: false,
        paymentId,
        error: 'Failed to process webhook',
        errorCode: ERROR_CODES.INTERNAL_SERVER_ERROR,
        retryable: true,
      };
    }
  }
}
