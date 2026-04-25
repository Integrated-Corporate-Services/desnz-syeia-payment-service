-- Payment Webhooks Table Migration
-- This table stores webhook events from GOV.UK Pay
-- Run this migration on the database before starting the callback service

CREATE TABLE IF NOT EXISTS payment_webhooks (
  webhook_id VARCHAR(255) PRIMARY KEY,
  payment_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'processing',
  raw_payload TEXT NOT NULL,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  next_retry_at TIMESTAMP,
  metadata JSONB DEFAULT '{}',
  correlation_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_payment_webhooks_payment_id 
  ON payment_webhooks(payment_id);

CREATE INDEX IF NOT EXISTS idx_payment_webhooks_status 
  ON payment_webhooks(status);

CREATE INDEX IF NOT EXISTS idx_payment_webhooks_created_at 
  ON payment_webhooks(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_webhooks_next_retry_at 
  ON payment_webhooks(next_retry_at) 
  WHERE status = 'retry_scheduled';

-- Add comments
COMMENT ON TABLE payment_webhooks IS 'Stores webhook events from GOV.UK Pay for audit and retry purposes';
COMMENT ON COLUMN payment_webhooks.webhook_id IS 'Unique webhook event ID from GOV.UK Pay';
COMMENT ON COLUMN payment_webhooks.payment_id IS 'Application ID or payment reference';
COMMENT ON COLUMN payment_webhooks.status IS 'Current webhook status: processing, success, retry_scheduled, dead_letter';
COMMENT ON COLUMN payment_webhooks.raw_payload IS 'Complete webhook payload for audit trail';
COMMENT ON COLUMN payment_webhooks.retry_count IS 'Number of retry attempts';
COMMENT ON COLUMN payment_webhooks.next_retry_at IS 'Scheduled time for next retry';
COMMENT ON COLUMN payment_webhooks.metadata IS 'Additional metadata (message IDs, backend responses, etc.)';
COMMENT ON COLUMN payment_webhooks.correlation_id IS 'Correlation ID for tracing across services';
