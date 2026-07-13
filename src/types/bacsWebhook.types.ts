/**
 * BACS Webhook Payload Type Definitions
 * BACS (Bankers' Automated Clearing Services) payment notifications

 */

/**
 * Main BACS Webhook Payload Structure
 */
export interface BACSWebhookPayload {
  event: BACSEvent;
  callback: BACSCallback;
  payment: BACSPayment;
  detail: BACSPaymentDetail;
}

/**
 * Event metadata section
 */
export interface BACSEvent {
  eventId: string;           // UUID identifying this webhook event
  eventType: string;         // Event type (e.g., "PAYMENT_STATUS_UPDATE")
  eventVersion: string;      // Event schema version (e.g., "1.0")
  occurredAt: string;        // ISO 8601 timestamp when event occurred
  source: string;            // Source system (e.g., "UKSBS-SYSTEM")
}

/**
 * Callback/delivery metadata section
 */
export interface BACSCallback {
  deliveryId: string;        // UUID for this delivery attempt
  attemptNumber: number;     // Delivery attempt count (starts at 1)
}

/**
 * Payment reference information
 */
export interface BACSPayment {
  paymentReference: string;  // Application payment reference (e.g., "PAY-2026-00123456")
}

/**
 * Payment status detail information
 */
export interface BACSPaymentDetail {
  status: string;            // Payment status (e.g., "PAID", "PENDING", "FAILED")
  amount: number;            // Payment amount in pence
  currency: string;          // Currency code (e.g., "GBP")
  paymentDate: string;       // Payment date in YYYY-MM-DD format
  bacsReference: string; // Bank transfer reference
}

/**
 * BACS Payment Status Values
 */
export const BACS_PAYMENT_STATUSES = {
  PAID: 'PAID',                      // Payment completed successfully
  PENDING: 'PENDING',                // Payment pending processing
  FAILED: 'FAILED'                  // Payment failed
} as const;

/**
 * BACS Event Types
 */
export const BACS_EVENT_TYPES = {
  PAYMENT_STATUS_UPDATE: 'PAYMENT_STATUS_UPDATE',
  PAYMENT_RECEIVED: 'PAYMENT_RECEIVED',
  PAYMENT_FAILED: 'PAYMENT_FAILED'
} as const;

/**
 * BACS Currency Codes
 */
export const BACS_CURRENCY_CODES = {
  GBP: 'GBP',
  EUR: 'EUR',
  USD: 'USD',
} as const;

/**
 * Validation Error Response
 */
export interface BACSValidationError {
  field: string;
  message: string;
  value?: any;
}

/**
 * Validation Result
 */
export interface BACSValidationResult {
  valid: boolean;
  errors: BACSValidationError[];
}

/**
 * Type guard for BACS webhook payload
 * Note: callback is optional
 */
export function isBACSWebhookPayload(payload: any): payload is BACSWebhookPayload {
  return (
    payload &&
    typeof payload === 'object' &&
    payload.event &&
    typeof payload.event === 'object' &&
    payload.payment &&
    typeof payload.payment === 'object' &&
    payload.detail &&
    typeof payload.detail === 'object'
  );
}
