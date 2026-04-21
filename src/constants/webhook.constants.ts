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
 * As per GOV.UK Pay API documentation
 * @see https://docs.payments.service.gov.uk/api_reference/#payment-events
 */
export const WEBHOOK_EVENT_TYPES = {
  PAYMENT_COMPLETED: 'PAYMENT_COMPLETED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PAYMENT_CANCELLED: 'PAYMENT_CANCELLED',
  PAYMENT_EXPIRED: 'PAYMENT_EXPIRED',
  REFUND_SUCCEEDED: 'REFUND_SUCCEEDED',
  REFUND_FAILED: 'REFUND_FAILED',
} as const;

/**
 * GOV.UK Pay Payment Status Values
 * As received in webhook payload
 */
export const GOV_UK_PAY_STATUSES = {
  CREATED: 'created',
  STARTED: 'started',
  SUBMITTED: 'submitted',
  SUCCESS: 'success',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  ERROR: 'error',
  CAPTURABLE: 'capturable',
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
