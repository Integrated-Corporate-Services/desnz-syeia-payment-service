// Payment Webhook Repository
// Data access layer for webhook event tracking and history

export {}; // Make this a module

const db = require('../database/db');
const getLogger = require('../utils/loggerHelper');
const logger = getLogger(module);

/**
 * SQL Query: Create webhook record
 */
function createWebhookQuery() {
  return `
    INSERT INTO payment_webhooks 
    (webhook_id, payment_id, event_type, status, raw_payload, retry_count, max_retries, correlation_id, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
  `;
}

/**
 * SQL Query: Find webhook by ID
 */
function findWebhookByIdQuery() {
  return `
    SELECT * FROM payment_webhooks WHERE webhook_id = $1
  `;
}

/**
 * SQL Query: Update webhook status
 */
function updateWebhookStatusQuery() {
  return `
    UPDATE payment_webhooks 
    SET status = $1, metadata = $2, updated_at = NOW()
    WHERE webhook_id = $3
  `;
}

/**
 * SQL Query: Record retryable error
 */
function recordRetryableErrorQuery() {
  return `
    UPDATE payment_webhooks 
    SET 
      retry_count = retry_count + 1,
      status = 'retry_scheduled',
      error_message = $2,
      next_retry_at = $3,
      updated_at = NOW()
    WHERE webhook_id = $1
  `;
}

/**
 * SQL Query: Move to dead-letter queue
 */
function moveToDeadLetterQueueQuery() {
  return `
    UPDATE payment_webhooks 
    SET 
      status = 'dead_letter',
      error_message = $2,
      updated_at = NOW()
    WHERE webhook_id = $1
  `;
}

/**
 * Create a new webhook record
 */
async function createWebhook(data: any) {
  try {
    await db.query(createWebhookQuery(), [
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
    const result = await db.query(findWebhookByIdQuery(), [webhookId]);
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
    await db.query(updateWebhookStatusQuery(), [status, metadataJson, webhookId]);

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

    await db.query(recordRetryableErrorQuery(), [
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
    await db.query(moveToDeadLetterQueueQuery(), [webhookId, errorMessage]);

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
