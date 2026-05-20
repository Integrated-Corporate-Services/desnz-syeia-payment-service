/**
 * Webhook Payload Type Definitions
 * Based on GOV.UK Pay Webhook Specification
 * @see https://docs.payments.service.gov.uk/webhooks/
 */

export interface WebhookPayload {
  webhook_message_id: string;
  api_version: number;
  created_date: string; // ISO 8601 format
  resource_id: string; // payment_id
  resource_type: string; // "payment"
  event_type: string; // e.g., "card_payment_succeeded"
  resource: PaymentResource;
}

export interface PaymentResource {
  amount: number;
  description: string;
  reference: string;
  language?: string;
  email?: string;
  state: PaymentState;
  payment_id: string;
  payment_provider: string;
  created_date: string; // ISO 8601 format
  refund_summary?: RefundSummary;
  settlement_summary?: SettlementSummary;
  card_details?: CardDetails;
  delayed_capture?: boolean;
  moto?: boolean;
  provider_id?: string;
  return_url?: string;
}

export interface PaymentState {
  status: string; // "success", "failed", "cancelled", etc.
  finished: boolean;
  message?: string;
  code?: string;
}

export interface RefundSummary {
  status: string;
  amount_available: number;
  amount_submitted: number;
}

export interface SettlementSummary {
  capture_submit_time?: string;
  captured_date?: string;
  settled_date?: string;
}

export interface CardDetails {
  last_digits_card_number?: string;
  first_digits_card_number?: string;
  cardholder_name?: string;
  expiry_date?: string; // Format: "MM/YY"
  billing_address?: BillingAddress;
  card_brand?: string; // "Visa", "Mastercard", etc.
  card_type?: string; // "debit", "credit", "prepaid"
}

export interface BillingAddress {
  line1?: string;
  line2?: string;
  postcode?: string;
  city?: string;
  country?: string; // ISO 3166-1 alpha-2 (e.g., "GB")
}

/**
 * Validation Error Response
 */
export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}
