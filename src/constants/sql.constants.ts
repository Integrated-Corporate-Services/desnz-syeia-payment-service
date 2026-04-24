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
   * Parameters: webhook_id, payment_id, event_type, status, raw_payload, retry_count, max_retries, correlation_id
   */
  CREATE_WEBHOOK: `
    INSERT INTO payment_webhooks 
    (webhook_id, payment_id, event_type, status, raw_payload, retry_count, max_retries, correlation_id, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
  `,

  /**
   * Find webhook by webhook_id
   * Parameters: webhook_id
   */
  FIND_BY_WEBHOOK_ID: `
    SELECT * FROM payment_webhooks WHERE webhook_id = $1
  `,

  /**
   * Update webhook status and metadata
   * Parameters: status, metadata, webhook_id
   */
  UPDATE_STATUS: `
    UPDATE payment_webhooks 
    SET status = $1, metadata = $2, updated_at = NOW()
    WHERE webhook_id = $3
  `,

  /**
   * Record retryable error and schedule next retry
   * Parameters: webhook_id, error_message, next_retry_at
   */
  RECORD_RETRYABLE_ERROR: `
    UPDATE payment_webhooks 
    SET 
      retry_count = retry_count + 1,
      status = 'retry_scheduled',
      error_message = $2,
      next_retry_at = $3,
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
   * Get webhook history by payment_id
   * Parameters: payment_id
   */
  GET_WEBHOOK_HISTORY: `
    SELECT * FROM payment_webhooks 
    WHERE payment_id = $1
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
