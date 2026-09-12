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
    logger.info('[WebhookRepository] Executing INSERT query on payment_webhooks', {
      table: 'payment_webhooks',
      operation: 'insert',
      webhookId: data.webhook_id,
      paymentId: data.payment_id,
      correlationId: data.correlation_id,
    });
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
        logger.info('[WebhookRepository] Duplicate webhook detected via ON CONFLICT - no row inserted into payment_webhooks', {
          table: 'payment_webhooks',
          operation: 'insert',
          webhookId: data.webhook_id,
          paymentId: data.payment_id,
          existingStatus: row?.status,
          correlationId: data.correlation_id,
        });
        return {
          isDuplicate: true,
          status: row?.status,
        };
      }

      logger.info('[WebhookRepository] Webhook record inserted into payment_webhooks', {
        table: 'payment_webhooks',
        operation: 'insert',
        webhookId: data.webhook_id,
        paymentId: data.payment_id,
        enqueuedAt: null,
        correlationId: data.correlation_id,
      });

      return {
        isDuplicate: false,
      };
    } catch (error) {
      logger.error('[WebhookRepository] Error inserting webhook record into payment_webhooks (will be rolled back)', {
        table: 'payment_webhooks',
        operation: 'insert',
        error: error instanceof Error ? error.message : String(error),
        webhookId: data.webhook_id,
        correlationId: data.correlation_id,
      });
      throw error;
    }
  });
}

/**
 * Find a webhook record by its unique webhook_id
 * 
 * @param webhookId - The unique webhook message ID to search for
 * @param correlationId - Correlation ID for request tracing
 * @returns Webhook record object or null if not found
 * @throws {Error} If database query fails
 */
export async function findByWebhookId(webhookId: string, correlationId?: string): Promise<any | null> {
  logger.info('[WebhookRepository] Executing SELECT query on payment_webhooks', {
    table: 'payment_webhooks',
    operation: 'select',
    webhookId,
    correlationId,
  });
  try {
    const result = await db.query(WEBHOOK_QUERIES.FIND_BY_WEBHOOK_ID, [webhookId]);
    const row = result.rows?.[0] || null;

    logger.info('[WebhookRepository] Webhook record retrieved from payment_webhooks', {
      table: 'payment_webhooks',
      operation: 'select',
      webhookId,
      found: !!row,
      correlationId,
    });

    return row;
  } catch (error) {
    logger.error('[WebhookRepository] Error selecting webhook record from payment_webhooks', {
      table: 'payment_webhooks',
      operation: 'select',
      error: error instanceof Error ? error.message : String(error),
      webhookId,
      correlationId,
    });
    throw error;
  }
}

/**
 * Update the processing status of a webhook record
 * 
 * @param webhookId - The webhook message ID to update
 * @param status - New status ('pending', 'processed', 'failed', 'retrying', 'dead_letter')
 * @param correlationId - Correlation ID for request tracing
 * @throws {Error} If database update fails
 */
export async function updateWebhookStatus(webhookId: string, status: string, correlationId?: string): Promise<void> {
  logger.info('[WebhookRepository] Executing UPDATE query on payment_webhooks', {
    table: 'payment_webhooks',
    operation: 'update',
    webhookId,
    status,
    correlationId,
  });
  try {
    await db.query(WEBHOOK_QUERIES.UPDATE_STATUS, [status, webhookId]);

    logger.info('[WebhookRepository] Webhook status updated in payment_webhooks', {
      table: 'payment_webhooks',
      operation: 'update',
      webhookId,
      status,
      correlationId,
    });
  } catch (error) {
    logger.error('[WebhookRepository] Error updating webhook status in payment_webhooks', {
      table: 'payment_webhooks',
      operation: 'update',
      error: error instanceof Error ? error.message : String(error),
      webhookId,
      correlationId,
    });
    throw error;
  }
}
