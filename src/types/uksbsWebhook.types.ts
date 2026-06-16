/**
 * UKSBS Webhook Payload Type Definitions
 * Based on UK Shared Business Services Payment Notification Specification
 */

/**
 * Main UKSBS Webhook Payload Structure
 */
export interface UKSBSWebhookPayload {
  event: UKSBSEvent;
  callback: UKSBSCallback;
  payment: UKSBSPayment;
  detail: UKSBSPaymentDetail;
}

/**
 * Event metadata section
 */
export interface UKSBSEvent {
  eventId: string;           // UUID identifying this webhook event
  eventType: string;         // Event type (e.g., "PAYMENT_STATUS_UPDATE")
  eventVersion: string;      // Event schema version (e.g., "1.0")
  occurredAt: string;        // ISO 8601 timestamp when event occurred
  source: string;            // Source system (e.g., "PARTNER-SYSTEM")
}

/**
 * Callback/delivery metadata section
 */
export interface UKSBSCallback {
  deliveryId: string;        // UUID for this delivery attempt
  attemptNumber: number;     // Delivery attempt count (starts at 1)
}

/**
 * Payment reference information
 */
export interface UKSBSPayment {
  paymentReference: string;  // Application payment reference (e.g., "PAY-2026-00123456")
}

/**
 * Payment status detail information
 */
export interface UKSBSPaymentDetail {
  status: string;            // Payment status (e.g., "PAID", "PENDING", "FAILED")
  amount: number;            // Payment amount in pence
  currency: string;          // Currency code (e.g., "GBP")
  paymentDate: string;       // Payment date in YYYY-MM-DD format
  transferReference: string; // Bank transfer reference
}

/**
 * UKSBS Payment Status Values
 */
export const UKSBS_PAYMENT_STATUSES = {
  PAID: 'PAID',                      // Payment completed successfully
  PENDING: 'PENDING',                // Payment pending processing
  FAILED: 'FAILED',                  // Payment failed
  CANCELLED: 'CANCELLED',            // Payment cancelled
  REFUNDED: 'REFUNDED',              // Payment refunded
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED', // Partial refund processed
} as const;

/**
 * UKSBS Event Types
 */
export const UKSBS_EVENT_TYPES = {
  PAYMENT_STATUS_UPDATE: 'PAYMENT_STATUS_UPDATE',
  PAYMENT_RECEIVED: 'PAYMENT_RECEIVED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  REFUND_PROCESSED: 'REFUND_PROCESSED',
} as const;

/**
 * UKSBS Currency Codes
 */
export const UKSBS_CURRENCY_CODES = {
  GBP: 'GBP',
  EUR: 'EUR',
  USD: 'USD',
} as const;

/**
 * Validation Error Response
 */
export interface UKSBSValidationError {
  field: string;
  message: string;
  value?: any;
}

/**
 * Validation Result
 */
export interface UKSBSValidationResult {
  valid: boolean;
  errors: UKSBSValidationError[];
}

/**
 * Type guard for UKSBS webhook payload
 */
export function isUKSBSWebhookPayload(payload: any): payload is UKSBSWebhookPayload {
  return (
    payload &&
    typeof payload === 'object' &&
    payload.event &&
    typeof payload.event === 'object' &&
    payload.callback &&
    typeof payload.callback === 'object' &&
    payload.payment &&
    typeof payload.payment === 'object' &&
    payload.detail &&
    typeof payload.detail === 'object'
  );
}
