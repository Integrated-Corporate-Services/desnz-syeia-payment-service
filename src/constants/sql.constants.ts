/**
 * SQL Query Constants
 * Centralized SQL queries for payment webhook operations
 */

/**
 * Payment Webhooks Table Queries
 */
export const WEBHOOK_QUERIES = {
  /**
   * Insert a new webhook record (aligned with new architecture)
   * Parameters: webhook_id, payment_id, event_type, status, raw_payload (JSONB), created_by, correlation_id
   */
  CREATE_WEBHOOK: `
    INSERT INTO payment_webhooks 
    (webhook_id, payment_id, event_type, status, raw_payload, created_by, correlation_id, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
  `,

  /**
   * Insert a new webhook record with conflict handling (race condition protection)
   * Parameters: webhook_id, payment_id, event_type, status, raw_payload (JSONB), created_by, correlation_id
   * Returns: webhook_id if inserted, or null if duplicate
   * Note: enqueued_at is NULL until pay-callback-relay sends to SQS
   */
  CREATE_WEBHOOK_WITH_CONFLICT: `
    WITH insert_attempt AS (
      INSERT INTO payment_webhooks 
      (webhook_id, payment_id, event_type, status, raw_payload, created_by, correlation_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      ON CONFLICT (webhook_id) DO NOTHING
      RETURNING webhook_id, status, false as is_duplicate
    )
    SELECT * FROM insert_attempt
    UNION ALL
    SELECT webhook_id, status, true as is_duplicate
    FROM payment_webhooks
    WHERE webhook_id = $1
    AND NOT EXISTS (SELECT 1 FROM insert_attempt)
  `,

  /**
   * Find webhook by webhook_id
   * Parameters: webhook_id
   */
  FIND_BY_WEBHOOK_ID: `
    SELECT * FROM payment_webhooks WHERE webhook_id = $1
  `,

  /**
   * Update webhook status
   * Parameters: status, webhook_id
   */
  UPDATE_STATUS: `
    UPDATE payment_webhooks 
    SET status = $1, updated_at = NOW()
    WHERE webhook_id = $2
  `,

  /**
   * Get webhooks pending relay to SQS (for pay-callback-relay Lambda)
   * Used by pay-callback-relay to poll for unsent webhooks
   * Parameters: limit
   */
  GET_PENDING_RELAY: `
    SELECT * FROM payment_webhooks 
    WHERE enqueued_at IS NULL 
    AND status = 'pending'
    ORDER BY created_at ASC
    LIMIT $1
  `,

  /**
   * Update enqueued_at timestamp after sending to SQS
   * Parameters: webhook_id
   */
  UPDATE_ENQUEUED_AT: `
    UPDATE payment_webhooks 
    SET 
      enqueued_at = NOW(),
      updated_at = NOW(),
      updated_by = 'pay-callback-relay'
    WHERE webhook_id = $1
  `,

  /**
   * Get webhook history by payment_id
   * Parameters: payment_id
   */
  GET_WEBHOOK_HISTORY: `
    SELECT * FROM payment_webhooks 
    WHERE payment_id = $1
    ORDER BY created_at DESC
  `,

  /**
   * Get failed webhooks (updated by pay-callback-reconciler)
   * Parameters: limit
   */
  GET_FAILED_WEBHOOKS: `
    SELECT * FROM payment_webhooks 
    WHERE status = 'failed'
    ORDER BY updated_at DESC
    LIMIT $1
  `,
};
