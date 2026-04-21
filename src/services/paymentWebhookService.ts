// Payment Webhook Service
// Handles webhook processing with deduplication, retries, and dead-letter queue

export {}; // Make this a module

const getLogger = require('../utils/loggerHelper');
const logger = getLogger(module);
const paymentWebhookRepository = require('../repositories/paymentWebhookRepository');
const axios = require('axios');
const config = require('../config/config');
const { 
  RETRYABLE_ERROR_CODES, 
  RETRYABLE_ERROR_MESSAGES, 
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

/**
 * Categorize error as retryable or permanent
 */
function isRetryableError(error: any): boolean {
  const errorMessage = error?.message || error?.toString() || '';
  const errorCode = error?.code || '';

  // Check if error code is retryable
  if (RETRYABLE_ERROR_CODES.includes(errorCode)) {
    return true;
  }

  // Check if error message contains retryable keywords
  if (RETRYABLE_ERROR_MESSAGES.some((e: string) => errorMessage.includes(e))) {
    return true;
  }

  // Network errors are typically retryable
  if (RETRYABLE_ERROR_KEYWORDS.test(errorMessage)) {
    return true;
  }

  return false;
}

/**
 * Process webhook event
 * Handles: deduplication, primary processing, retries, and dead-letter queue
 */
async function processWebhook(
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

  // Feature flag check
  if (!config.features.callbackServiceEnabled) {
    logger.warn('[WebhookService] Callback service is disabled via feature flag', {
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
    // Step 1: Check for duplicates
    const existingWebhook = await paymentWebhookRepository.findByWebhookId(webhookId);

    if (existingWebhook) {
      logger.info('[WebhookService] Duplicate webhook detected', {
        webhookId,
        paymentId,
        previousStatus: existingWebhook.status,
        correlationId,
      });

      return {
        success: true,
        isDuplicate: true,
        paymentId,
      };
    }

    // Step 2: Create initial record for tracking
    await paymentWebhookRepository.createWebhook({
      webhook_id: webhookId,
      payment_id: paymentId,
      event_type: event.event_type || 'unknown',
      status: 'processing',
      raw_payload: rawPayload,
      retry_count: 0,
      max_retries: config.webhook.maxRetries,
      correlation_id: correlationId,
    });

    // Step 3: Process the webhook event
    if (!config.features.retryEnabled) {
      logger.warn('[WebhookService] Retry feature is disabled', { webhookId, correlationId });
    }

    let backendResult;
    try {
      const backendUrl = config.backend.url;
      const timeout = config.backend.timeout;

      backendResult = await axios.post(
        `${backendUrl}/callback/webhook-processed`,
        {
          webhookId,
          paymentId,
          event,
          correlationId,
        },
        {
          timeout,
          headers: {
            'Content-Type': 'application/json',
            'X-Correlation-ID': correlationId,
          },
        }
      );

      logger.info('[WebhookService] Webhook processed by backend', {
        webhookId,
        paymentId,
        backendStatus: backendResult.status,
        processingTimeMs: Date.now() - startTime,
        correlationId,
      });

      // Update status to success
      await paymentWebhookRepository.updateWebhookStatus(webhookId, 'success', {
        processedAt: new Date(),
        backendResponse: backendResult.data,
      });

      logger.info('[WebhookService] Webhook processing complete', {
        webhookId,
        paymentId,
        totalTimeMs: Date.now() - startTime,
        correlationId,
      });

      return {
        success: true,
        isDuplicate: false,
        paymentId,
      };
    } catch (processingError: any) {
      logger.error('[WebhookService] Backend processing failed', {
        webhookId,
        paymentId,
        error: processingError.message,
        code: processingError.code,
        statusCode: processingError.response?.status,
        correlationId,
      });

      const isRetryable = isRetryableError(processingError);

      if (isRetryable && config.features.retryEnabled) {
        await paymentWebhookRepository.recordRetryableError(
          webhookId,
          'Backend processing failed: ' + String(processingError.message),
          config.webhook.retryIntervals
        );

        return {
          success: false,
          isDuplicate: false,
          paymentId,
          error: 'Backend processing failed',
          errorCode: ERROR_CODES.BACKEND_SERVICE_ERROR,
          retryable: true,
        };
      } else {
        if (config.features.dlqEnabled) {
          await paymentWebhookRepository.moveToDeadLetterQueue(
            webhookId,
            'Backend processing failed: ' + String(processingError.message)
          );
        }

        return {
          success: false,
          isDuplicate: false,
          paymentId,
          error: 'Backend processing failed',
          errorCode: isRetryable 
            ? ERROR_CODES.BACKEND_SERVICE_UNAVAILABLE 
            : ERROR_CODES.BACKEND_SERVICE_ERROR,
          retryable: false,
        };
      }
    }
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
      // Record error and determine next action
      if (retryable && config.features.retryEnabled) {
        // Schedule retry
        await paymentWebhookRepository.recordRetryableError(
          webhookId,
          errorMessage,
          config.webhook.retryIntervals
        );

        logger.info('[WebhookService] Scheduled retry', {
          webhookId,
          paymentId,
          correlationId,
        });

        return {
          success: false,
          isDuplicate: false,
          paymentId,
          error: errorMessage,
          errorCode: ERROR_CODES.DATABASE_ERROR,
          retryable: true,
        };
      } else {
        // Move to dead-letter queue
        if (config.features.dlqEnabled) {
          await paymentWebhookRepository.moveToDeadLetterQueue(webhookId, errorMessage);
        }

        logger.error('[WebhookService] Moved to dead-letter queue', {
          webhookId,
          paymentId,
          reason: errorMessage,
          correlationId,
        });

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
      logger.error('[WebhookService] Failed to handle error', {
        webhookId,
        paymentId,
        originalError: errorMessage,
        errorHandlingError: errorHandlingFailed.message,
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

module.exports = {
  processWebhook,
};
