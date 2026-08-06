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
import { withTransaction } from '../database/db';
import { PoolClient } from 'pg';
import getLogger from '../utils/loggerHelper';
import { createSanitizedErrorLog } from '../utils/errorSanitizer';
import { WEBHOOK_QUERIES } from '../constants/sql.constants';

const logger = getLogger(module);

interface WebhookData {
  webhook_id: string;
  payment_id: string;
  event_type: string;
  status: string;
  raw_payload: any;  // JSONB
  correlation_id?: string;
  created_by?: string;
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
  return withTransaction(async (client: PoolClient) => {
    try {
      const result = await client.query(WEBHOOK_QUERIES.CREATE_WEBHOOK_WITH_CONFLICT, [
        data.webhook_id,
        data.payment_id,
        data.event_type,
        data.status,
        data.raw_payload,
        data.created_by || 'inbound-event-receiver',
        data.correlation_id,
      ]);

      const row = result.rows?.[0];
      const isDuplicate = row?.is_duplicate || false;

      if (isDuplicate) {
        logger.info('[WebhookRepository] Duplicate webhook detected via ON CONFLICT', {
          webhookId: data.webhook_id,
          paymentId: data.payment_id,
          existingStatus: row?.status,
        });
        return {
          isDuplicate: true,
          status: row?.status,
        };
      }

      logger.info('[WebhookRepository] Webhook record created in transaction', {
        webhookId: data.webhook_id,
        paymentId: data.payment_id,
        enqueuedAt: null,
      });

      return {
        isDuplicate: false,
      };
    } catch (error) {
      const sanitizedError = createSanitizedErrorLog(error);
      logger.error('[WebhookRepository] Error creating webhook record (will be rolled back)', {
        error_message: sanitizedError.sanitized_message,
        error_type: sanitizedError.error_type,
        webhookId: data.webhook_id,
      });
      throw error;
    }
  });
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
    const sanitizedError = createSanitizedErrorLog(error);
    logger.error('[WebhookRepository] Error finding webhook', {
      error_message: sanitizedError.sanitized_message,
      error_type: sanitizedError.error_type,
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
    const sanitizedError = createSanitizedErrorLog(error);
    logger.error('[WebhookRepository] Error updating webhook status', {
      error_message: sanitizedError.sanitized_message,
      error_type: sanitizedError.error_type,
      webhookId,
    });
    throw error;
  }
}
