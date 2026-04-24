/**
 * Webhook Domain Constants
 * All webhook-specific status values, event types, and GOV.UK Pay integrations
 */

/**
 * Webhook Processing Status Values
 * Maps to database 'status' column
 */
export const WEBHOOK_STATUS = {
  QUEUED: 'queued',
  PROCESSING: 'processing',
  SUCCESS: 'success',
  FAILED: 'failed',
  RETRY_SCHEDULED: 'retry_scheduled',
  DEAD_LETTER: 'dead_letter',
} as const;

/**
 * GOV.UK Pay Webhook Event Types
 * Official event types as documented by GOV.UK Pay
 * @see https://docs.payments.service.gov.uk/webhooks/#receive-automatic-payment-event-updates-using-webhooks
 */
export const WEBHOOK_EVENT_TYPES = {
  // Payment event types (used for application flow)
  CARD_PAYMENT_SUCCEEDED: 'card_payment_succeeded',      // Payment service provider has authorised the payment
  CARD_PAYMENT_CAPTURED: 'card_payment_captured',        // GOV.UK Pay has taken ('captured') the payment from user's bank account
  CARD_PAYMENT_REFUNDED: 'card_payment_refunded',        // Refund has been sent to user's bank account by payment service provider
  
  // Note: card_payment_settled is available but not used - it's for reconciliation/accounting purposes only
  
  // Legacy event types (for backward compatibility - may not be sent by GOV.UK Pay)
  PAYMENT_COMPLETED: 'PAYMENT_COMPLETED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PAYMENT_CANCELLED: 'PAYMENT_CANCELLED',
  PAYMENT_EXPIRED: 'PAYMENT_EXPIRED',
  REFUND_SUCCEEDED: 'REFUND_SUCCEEDED',
  REFUND_FAILED: 'REFUND_FAILED',
} as const;

/**
 * GOV.UK Pay Payment Status Values
 * As received in webhook payload resource.state.status
 * @see https://docs.payments.service.gov.uk/api_reference/#payment-status-lifecycle
 */
export const GOV_UK_PAY_STATUSES = {
  // Initial states
  CREATED: 'created',                    // Payment created but not yet attempted
  STARTED: 'started',                    // User has started the payment journey
  SUBMITTED: 'submitted',                // User has submitted payment details to provider
  
  // Final states (finished: true)
  SUCCESS: 'success',                    // Payment completed successfully
  FAILED: 'failed',                      // Payment failed
  CANCELLED: 'cancelled',                // Payment cancelled by user or service
  ERROR: 'error',                        // Payment error occurred
  
  // Special states
  CAPTURABLE: 'capturable',              // Payment authorized and ready to capture (delayed capture)
  EXPIRED: 'expired',                    // Payment session expired without completion
} as const;

/**
 * Refund Status Values
 * As received in webhook payload
 */
export const REFUND_STATUSES = {
  SUBMITTED: 'submitted',
  SUCCESS: 'success',
  ERROR: 'error',
} as const;

/**
 * Payment Card Types
 */
export const CARD_TYPES = {
  CREDIT: 'credit',
  DEBIT: 'debit',
  PREPAID: 'prepaid',
} as const;

/**
 * Payment Card Brands
 */
export const CARD_BRANDS = {
  VISA: 'visa',
  MASTERCARD: 'master-card',
  AMEX: 'american-express',
  DINERS_CLUB: 'diners-club',
  DISCOVER: 'discover',
  JCB: 'jcb',
  MAESTRO: 'maestro',
  UNION_PAY: 'union-pay',
} as const;

/**
 * Webhook Signature Algorithm
 */
export const WEBHOOK_SIGNING_ALGORITHM = 'sha256' as const;

/**
 * Webhook Header Names
 */
export const WEBHOOK_HEADERS = {
  SIGNATURE: 'govuk-pay-signature',
  WEBHOOK_ID: 'govuk-pay-webhook-id',
} as const;

/**
 * Retry Strategy
 */
export const RETRY_STRATEGY = {
  MAX_RETRIES: 3,
  INTERVALS_MS: {
    FIRST: 5 * 60 * 1000,  // 5 minutes
    SECOND: 10 * 60 * 1000, // 10 minutes
    THIRD: 15 * 60 * 1000,  // 15 minutes
  },
} as const;

/**
 * Type exports for type safety
 */
export type WebhookStatus = typeof WEBHOOK_STATUS[keyof typeof WEBHOOK_STATUS];
export type WebhookEventType = typeof WEBHOOK_EVENT_TYPES[keyof typeof WEBHOOK_EVENT_TYPES];
export type GovUkPayStatus = typeof GOV_UK_PAY_STATUSES[keyof typeof GOV_UK_PAY_STATUSES];
export type RefundStatus = typeof REFUND_STATUSES[keyof typeof REFUND_STATUSES];
export type CardType = typeof CARD_TYPES[keyof typeof CARD_TYPES];
export type CardBrand = typeof CARD_BRANDS[keyof typeof CARD_BRANDS];
