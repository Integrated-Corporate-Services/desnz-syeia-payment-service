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

import db from '../database/db';
import getLogger from '../utils/loggerHelper';
import { WEBHOOK_QUERIES } from '../constants/sql.constants';

const logger = getLogger(module);

interface WebhookData {
  webhook_id: string;
  govuk_pay_id: string;
  event_type: string;
  status: string;
  raw_payload: string;
  retry_count: number;
}

interface WebhookCreateResult {
  isDuplicate: boolean;
  status?: string;
}

/**
 * Create a new webhook record in the payment_webhooks table
 * Uses INSERT ON CONFLICT to prevent race conditions
 * 
 * @param data - Webhook data object
 * @param data.webhook_id - Unique webhook message ID from GOV.UK Pay
 * @param data.payment_id - Associated payment ID
 * @param data.event_type - Event type (e.g., 'card_payment_succeeded')
 * @param data.status - Initial status ('pending', 'processed', 'failed')
 * @param data.raw_payload - Complete webhook payload from GOV.UK Pay
 * @param data.retry_count - Current retry attempt count (default: 0)
 * @param data.max_retries - Maximum retry attempts allowed
 * @param data.correlation_id - Correlation ID for request tracing
 * @returns Object indicating if webhook was a duplicate
 * @throws {Error} If database insertion fails
 */
export async function createWebhook(data: WebhookData): Promise<WebhookCreateResult> {
  try {
    const result = await db.query(WEBHOOK_QUERIES.CREATE_WEBHOOK_WITH_CONFLICT, [
      data.webhook_id,
      data.govuk_pay_id,
      data.event_type,
      data.status,
      data.raw_payload,
      data.retry_count,
    ]);

    const row = result.rows?.[0];
    const isDuplicate = row?.is_duplicate || false;

    if (isDuplicate) {
      logger.info('[WebhookRepository] Duplicate webhook detected via ON CONFLICT', {
        webhookId: data.webhook_id,
        govukPayId: data.govuk_pay_id,
        existingStatus: row?.status,
      });
      return {
        isDuplicate: true,
        status: row?.status,
      };
    }

    logger.info('[WebhookRepository] Webhook record created', {
      webhookId: data.webhook_id,
      govukPayId: data.govuk_pay_id,
    });

    return {
      isDuplicate: false,
    };
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
 * @param webhookId - The unique webhook message ID to search for
 * @returns Webhook record object or null if not found
 * @throws {Error} If database query fails
 */
export async function findByWebhookId(webhookId: string): Promise<any | null> {
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
 * @param webhookId - The webhook message ID to update
 * @param status - New status ('pending', 'processed', 'failed', 'retrying', 'dead_letter')
 * @throws {Error} If database update fails
 */
export async function updateWebhookStatus(webhookId: string, status: string): Promise<void> {
  try {
    await db.query(WEBHOOK_QUERIES.UPDATE_STATUS, [status, webhookId]);

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
 * @param webhookId - The webhook message ID that failed
 * @param errorMessage - Description of the error for debugging
 * @param retryIntervals - Array of retry delays in milliseconds [5min, 15min, 1hr, etc.]
 * @throws {Error} If database update fails
 * 
 * @example
 * // First retry after 5 minutes, second after 15 minutes
 * await recordRetryableError('wh_123', 'Connection timeout', [300000, 900000]);
 */
export async function recordRetryableError(webhookId: string, errorMessage: string, retryIntervals: number[]): Promise<void> {
  try {
    await db.query(WEBHOOK_QUERIES.RECORD_RETRYABLE_ERROR, [
      webhookId,
      errorMessage,
    ]);

    logger.info('[WebhookRepository] Retryable error recorded', {
      webhookId,
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
 * @param webhookId - The webhook message ID that permanently failed
 * @param errorMessage - Final error message describing why it failed
 * @throws {Error} If database update fails
 * 
 * @example
 * // After 3 failed retry attempts
 * await moveToDeadLetterQueue('wh_123', 'Max retries (3) exceeded: Database connection failed');
 */
export async function moveToDeadLetterQueue(webhookId: string, errorMessage: string): Promise<void> {
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
