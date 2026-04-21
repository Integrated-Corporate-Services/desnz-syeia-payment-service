// Callback Controller
// Handles inbound webhook events from GOV.UK Pay

export {}; // Make this a module

const getLogger = require('../utils/loggerHelper');
const logger = getLogger(module);
const { processWebhook } = require('../services/paymentWebhookService');
const { v4: uuidv4 } = require('uuid');

/**
 * Handle webhook endpoint
 * POST /webhook
 * 
 * This endpoint receives webhook events from GOV.UK Pay
 * Signature verification is done via middleware
 */
async function handleWebhook(req: any, res: any) {
  const webhookEvent = req.webhookEvent;
  const paymentId = req.paymentId;
  const webhookId = webhookEvent?.webhook_id || uuidv4();
  const correlationId = req.headers['x-correlation-id'] || uuidv4();

  logger.info('[CallbackController] Webhook received', {
    webhookId,
    paymentId,
    eventType: webhookEvent?.event_type,
    correlationId,
  });

  try {
    // Capture raw body for storage
    const rawPayload = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

    // Process webhook asynchronously
    const result = await processWebhook(
      webhookId,
      paymentId,
      webhookEvent,
      rawPayload,
      correlationId
    );

    if (result.isDuplicate) {
      logger.info('[CallbackController] Duplicate webhook acknowledged', {
        webhookId,
        paymentId,
        correlationId,
      });

      return res.json({
        status: 'received',
        isDuplicate: true,
        message: 'Duplicate webhook acknowledged',
      });
    }

    if (result.success) {
      logger.info('[CallbackController] Webhook processed successfully', {
        webhookId,
        paymentId,
        correlationId,
      });

      return res.json({
        status: 'received',
        webhookId,
        paymentId,
        message: 'Webhook received and queued for processing',
      });
    }

    // Handle failures
    if (result.retryable) {
      logger.warn('[CallbackController] Webhook processing retryable error', {
        webhookId,
        paymentId,
        error: result.error,
        correlationId,
      });

      return res.status(202).json({
        status: 'retryable_error',
        webhookId,
        paymentId,
        error: result.error,
        message: 'Webhook processing scheduled for retry',
      });
    }

    // Permanent failure
    logger.error('[CallbackController] Webhook processing permanent error', {
      webhookId,
      paymentId,
      error: result.error,
      correlationId,
    });

    return res.status(202).json({
      status: 'permanent_error',
      webhookId,
      paymentId,
      error: result.error,
      message: 'Webhook moved to dead-letter queue',
    });
  } catch (error) {
    logger.error('[CallbackController] Unexpected error processing webhook', {
      error: error instanceof Error ? error.message : String(error),
      webhookId,
      paymentId,
      correlationId,
    });

    return res.status(202).json({
      status: 'error',
      webhookId,
      paymentId,
      error: 'Unexpected error processing webhook',
      message: 'Webhook will be retried',
    });
  }
}

/**
 * Health check endpoint
 */
async function healthCheck(req: any, res: any) {
  res.json({ status: 'healthy', service: 'integration-service' });
}

module.exports = {
  handleWebhook,
  healthCheck,
};
