/**
 * Payment Webhook Repository
 * 
 * Data access layer for webhook event tracking and processing history.
 * Manages the payment_webhooks table which stores all incoming webhook events,
 * their processing status, retry attempts, and error handling.
 * 
 * This repository handles:
 * - Creating new webhook records when events are received
 * - Tracking webhook processing status (pending, processed, failed, retrying)
 * - Managing retry logic for transient failures
 * - Moving permanently failed webhooks to dead-letter queue
 * 
 * @module repositories/paymentWebhookRepository
 */

export {}; // Make this a module

const db = require('../database/db');
const getLogger = require('../utils/loggerHelper');
const logger = getLogger(module);
const { WEBHOOK_QUERIES } = require('../constants/sql.constants');

/**
 * Create a new webhook record in the payment_webhooks table
 * 
 * @param {Object} data - Webhook data object
 * @param {string} data.webhook_id - Unique webhook message ID from GOV.UK Pay
 * @param {string} data.payment_id - Associated payment ID
 * @param {string} data.event_type - Event type (e.g., 'card_payment_succeeded')
 * @param {string} data.status - Initial status ('pending', 'processed', 'failed')
 * @param {Object} data.raw_payload - Complete webhook payload from GOV.UK Pay
 * @param {number} data.retry_count - Current retry attempt count (default: 0)
 * @param {number} data.max_retries - Maximum retry attempts allowed
 * @param {string} data.correlation_id - Correlation ID for request tracing
 * @throws {Error} If database insertion fails
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
 * Find a webhook record by its unique webhook_id
 * 
 * @param {string} webhookId - The unique webhook message ID to search for
 * @returns {Promise<Object|null>} Webhook record object or null if not found
 * @throws {Error} If database query fails
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
 * Update the processing status of a webhook record
 * 
 * @param {string} webhookId - The webhook message ID to update
 * @param {string} status - New status ('pending', 'processed', 'failed', 'retrying', 'dead_letter')
 * @param {Object} [metadata=null] - Optional metadata object to store with the status update
 * @throws {Error} If database update fails
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
 * Record a retryable error and schedule the next retry attempt
 * Used for transient failures (network timeout, temporary database issues, etc.)
 * 
 * @param {string} webhookId - The webhook message ID that failed
 * @param {string} errorMessage - Description of the error for debugging
 * @param {number[]} retryIntervals - Array of retry delays in milliseconds [5min, 15min, 1hr, etc.]
 * @throws {Error} If database update fails
 * 
 * @example
 * // First retry after 5 minutes, second after 15 minutes
 * await recordRetryableError('wh_123', 'Connection timeout', [300000, 900000]);
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
 * Move a webhook to the dead-letter queue after max retries exhausted
 * This marks the webhook as permanently failed and requiring manual intervention
 * 
 * @param {string} webhookId - The webhook message ID that permanently failed
 * @param {string} errorMessage - Final error message describing why it failed
 * @throws {Error} If database update fails
 * 
 * @example
 * // After 3 failed retry attempts
 * await moveToDeadLetterQueue('wh_123', 'Max retries (3) exceeded: Database connection failed');
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
