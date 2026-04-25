/**
 * SQL Query Constants
 * Centralized SQL queries for payment webhook operations
 */

/**
 * Payment Webhooks Table Queries
 */
export const WEBHOOK_QUERIES = {
  /**
   * Insert a new webhook record
   * Parameters: webhook_id, govuk_pay_id, event_type, status, webhook_data, retry_count
   */
  CREATE_WEBHOOK: `
    INSERT INTO payment_webhooks 
    (webhook_id, govuk_pay_id, event_type, status, webhook_data, retry_count, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
  `,

  /**
   * Insert a new webhook record with conflict handling (race condition protection)
   * Parameters: webhook_id, govuk_pay_id, event_type, status, webhook_data, retry_count
   * Returns: webhook_id if inserted, or null if duplicate
   */
  CREATE_WEBHOOK_WITH_CONFLICT: `
    WITH insert_attempt AS (
      INSERT INTO payment_webhooks 
      (webhook_id, govuk_pay_id, event_type, status, webhook_data, retry_count, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
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
   * Record retryable error and schedule next retry
   * Parameters: webhook_id, error_message
   */
  RECORD_RETRYABLE_ERROR: `
    UPDATE payment_webhooks 
    SET 
      retry_count = retry_count + 1,
      status = 'retry_scheduled',
      error_message = $2,
      updated_at = NOW()
    WHERE webhook_id = $1
  `,

  /**
   * Move webhook to dead-letter queue
   * Parameters: webhook_id, error_message
   */
  MOVE_TO_DEAD_LETTER: `
    UPDATE payment_webhooks 
    SET 
      status = 'dead_letter',
      error_message = $2,
      updated_at = NOW()
    WHERE webhook_id = $1
  `,

  /**
   * Get webhooks pending retry
   * Parameters: current_timestamp
   */
  GET_PENDING_RETRIES: `
    SELECT * FROM payment_webhooks 
    WHERE status = 'retry_scheduled' 
    AND next_retry_at <= $1
    ORDER BY next_retry_at ASC
    LIMIT 100
  `,

  /**
   * Get webhook history by govuk_pay_id
   * Parameters: govuk_pay_id
   */
  GET_WEBHOOK_HISTORY: `
    SELECT * FROM payment_webhooks 
    WHERE govuk_pay_id = $1
    ORDER BY created_at DESC
  `,

  /**
   * Get failed webhooks
   * Parameters: limit
   */
  GET_FAILED_WEBHOOKS: `
    SELECT * FROM payment_webhooks 
    WHERE status = 'dead_letter'
    ORDER BY updated_at DESC
    LIMIT $1
  `,
};
