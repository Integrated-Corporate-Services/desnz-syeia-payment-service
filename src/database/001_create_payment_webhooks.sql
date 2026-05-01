-- Payment Webhooks Table Migration
-- This table stores webhook events from GOV.UK Pay
-- Run this migration on the database before starting the callback service
-- Schema aligned with ARCHITECTURE.md (3-tier webhook processing)

CREATE TABLE IF NOT EXISTS payment_webhooks (
  id SERIAL PRIMARY KEY,
  webhook_id TEXT UNIQUE NOT NULL,
  payment_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  raw_payload JSONB NOT NULL,
  enqueued_at TIMESTAMP WITH TIME ZONE,  -- NULL until sent to SQS by pay-callback-relay
  created_by TEXT,
  updated_by TEXT,
  correlation_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_payment_webhooks_webhook_id 
  ON payment_webhooks(webhook_id);

CREATE INDEX IF NOT EXISTS idx_payment_webhooks_payment_id 
  ON payment_webhooks(payment_id);

CREATE INDEX IF NOT EXISTS idx_payment_webhooks_status 
  ON payment_webhooks(status);

CREATE INDEX IF NOT EXISTS idx_payment_webhooks_created_at 
  ON payment_webhooks(created_at DESC);

-- Critical index for pay-callback-relay polling
CREATE INDEX IF NOT EXISTS idx_payment_webhooks_enqueued_at 
  ON payment_webhooks(enqueued_at) 
  WHERE enqueued_at IS NULL AND status = 'pending';

-- Add comments
COMMENT ON TABLE payment_webhooks IS 'Stores webhook events from GOV.UK Pay - received by inbound-event-receiver, polled by pay-callback-relay';
COMMENT ON COLUMN payment_webhooks.id IS 'Auto-incrementing primary key';
COMMENT ON COLUMN payment_webhooks.webhook_id IS 'Unique webhook event ID from GOV.UK Pay (for idempotency)';
COMMENT ON COLUMN payment_webhooks.payment_id IS 'Application ID or payment reference';
COMMENT ON COLUMN payment_webhooks.event_type IS 'GOV.UK Pay event type (e.g., card_payment_succeeded)';
COMMENT ON COLUMN payment_webhooks.status IS 'Current webhook status: pending, success, failed';
COMMENT ON COLUMN payment_webhooks.raw_payload IS 'Complete webhook payload as JSONB for audit trail';
COMMENT ON COLUMN payment_webhooks.enqueued_at IS 'Timestamp when webhook was sent to SQS by pay-callback-relay (NULL = not yet sent)';
COMMENT ON COLUMN payment_webhooks.created_by IS 'Service/user that created the record (audit trail)';
COMMENT ON COLUMN payment_webhooks.updated_by IS 'Service/user that last updated the record (audit trail)';
COMMENT ON COLUMN payment_webhooks.correlation_id IS 'Correlation ID for tracing across services';
