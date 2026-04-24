// Payment Webhook Repository
// Data access layer for webhook event tracking and history

export {}; // Make this a module

const db = require('../database/db');
const getLogger = require('../utils/loggerHelper');
const logger = getLogger(module);
const { WEBHOOK_QUERIES } = require('../constants/sql.constants');

/**
 * Create a new webhook record
 */
async function createWebhook(data: any) {
  try {
    await db.query(WEBHOOK_QUERIES.CREATE_WEBHOOK, [
      data.webhook_id,
      data.payment_id,
      data.event_type,
      data.status,
      data.raw_payload,
      data.retry_count,
      data.max_retries,
      data.correlation_id,
    ]);

    logger.info('[WebhookRepository] Webhook record created', {
      webhookId: data.webhook_id,
      paymentId: data.payment_id,
    });
  } catch (error) {
    logger.error('[WebhookRepository] Error creating webhook record', {
      error: error instanceof Error ? error.message : String(error),
      webhookId: data.webhook_id,
    });
    throw error;
  }
}

/**
 * Find webhook by ID
 */
async function findByWebhookId(webhookId: string) {
  try {
    const result = await db.query(WEBHOOK_QUERIES.FIND_BY_WEBHOOK_ID, [webhookId]);
    return result.rows?.[0] || null;
  } catch (error) {
    logger.error('[WebhookRepository] Error finding webhook', {
      error: error instanceof Error ? error.message : String(error),
      webhookId,
    });
    throw error;
  }
}

/**
 * Update webhook status
 */
async function updateWebhookStatus(webhookId: string, status: string, metadata: any = null) {
  try {
    const metadataJson = metadata ? JSON.stringify(metadata) : null;
    await db.query(WEBHOOK_QUERIES.UPDATE_STATUS, [status, metadataJson, webhookId]);

    logger.info('[WebhookRepository] Webhook status updated', {
      webhookId,
      status,
    });
  } catch (error) {
    logger.error('[WebhookRepository] Error updating webhook status', {
      error: error instanceof Error ? error.message : String(error),
      webhookId,
    });
    throw error;
  }
}

/**
 * Record a retryable error and schedule next retry
 */
async function recordRetryableError(webhookId: string, errorMessage: string, retryIntervals: number[]) {
  try {
    const nextRetryMs = retryIntervals?.[0] || 5 * 60 * 1000;
    const nextRetryTime = new Date(Date.now() + nextRetryMs);

    await db.query(WEBHOOK_QUERIES.RECORD_RETRYABLE_ERROR, [
      webhookId,
      errorMessage,
      nextRetryTime,
    ]);

    logger.info('[WebhookRepository] Retryable error recorded', {
      webhookId,
      nextRetryTime,
    });
  } catch (error) {
    logger.error('[WebhookRepository] Error recording retryable error', {
      error: error instanceof Error ? error.message : String(error),
      webhookId,
    });
    throw error;
  }
}

/**
 * Move webhook to dead-letter queue
 */
async function moveToDeadLetterQueue(webhookId: string, errorMessage: string) {
  try {
    await db.query(WEBHOOK_QUERIES.MOVE_TO_DEAD_LETTER, [webhookId, errorMessage]);

    logger.info('[WebhookRepository] Webhook moved to dead-letter queue', {
      webhookId,
      errorMessage,
    });
  } catch (error) {
    logger.error('[WebhookRepository] Error moving to dead-letter queue', {
      error: error instanceof Error ? error.message : String(error),
      webhookId,
    });
    throw error;
  }
}

module.exports = {
  createWebhook,
  findByWebhookId,
  updateWebhookStatus,
  recordRetryableError,
  moveToDeadLetterQueue,
};
