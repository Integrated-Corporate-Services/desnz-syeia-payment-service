/**
 * ===================================================================
 * Webhook Payloads Test Fixture
 * ===================================================================
 * Contains static webhook payload templates matching GOV.UK Pay specification
 * https://docs.payments.service.gov.uk/webhooks/
 * 
 * IMPORTANT: GOV.UK Pay is NOT integrated yet - these are mock payloads
 */

export interface WebhookPayload {
  webhook_message_id: string;
  api_version: number;
  event_type: string;
  created_date: string;
  resource_id: string;
  resource_type: string;
  resource: PaymentResource;
}

export interface PaymentResource {
  payment_id: string;
  payment_provider: string;
  amount: number;
  reference: string;
  description?: string;
  state: PaymentState;
  return_url?: string;
  created_date: string;
  card_details?: CardDetails;
  settlement_summary?: SettlementSummary;
}

export interface PaymentState {
  status: 'created' | 'started' | 'submitted' | 'success' | 'failed' | 'cancelled' | 'error';
  finished: boolean;
  message?: string;
  code?: string;
}

export interface CardDetails {
  card_brand: string;
  card_type: string;
  last_digits_card_number: string;
  first_digits_card_number: string;
  expiry_date: string;
  cardholder_name: string;
}

export interface SettlementSummary {
  capture_submit_time: string;
  captured_date: string;
  settled_date?: string;
}

/**
 * Base webhook payload template
 */
export const BASE_WEBHOOK_PAYLOAD: Partial<WebhookPayload> = {
  api_version: 1,
  resource_type: 'payment',
};

/**
 * Payment Created Event - Initial payment creation
 */
export const PAYMENT_CREATED_WEBHOOK: WebhookPayload = {
  webhook_message_id: 'evt_test_created_001',
  api_version: 1,
  event_type: 'card_payment_created',
  created_date: '2024-01-15T10:00:00.000Z',
  resource_id: 'pay_test_001',
  resource_type: 'payment',
  resource: {
    payment_id: 'pay_test_001',
    payment_provider: 'worldpay',
    amount: 10000, // £100.00 in pence
    reference: 'REF-CREATED-001',
    description: 'Test payment - created state',
    state: {
      status: 'created',
      finished: false,
    },
    return_url: 'https://example.com/return',
    created_date: '2024-01-15T10:00:00.000Z',
  },
};

/**
 * Payment Started Event - User has started payment
 */
export const PAYMENT_STARTED_WEBHOOK: WebhookPayload = {
  webhook_message_id: 'evt_test_started_001',
  api_version: 1,
  event_type: 'card_payment_started',
  created_date: '2024-01-15T10:01:00.000Z',
  resource_id: 'pay_test_001',
  resource_type: 'payment',
  resource: {
    payment_id: 'pay_test_001',
    payment_provider: 'worldpay',
    amount: 10000,
    reference: 'REF-STARTED-001',
    description: 'Test payment - started state',
    state: {
      status: 'started',
      finished: false,
    },
    return_url: 'https://example.com/return',
    created_date: '2024-01-15T10:00:00.000Z',
  },
};

/**
 * Payment Succeeded Event - Payment confirmed and successful
 */
export const PAYMENT_SUCCEEDED_WEBHOOK: WebhookPayload = {
  webhook_message_id: 'evt_test_succeeded_001',
  api_version: 1,
  event_type: 'card_payment_succeeded',
  created_date: '2024-01-15T10:02:00.000Z',
  resource_id: 'pay_test_001',
  resource_type: 'payment',
  resource: {
    payment_id: 'pay_test_001',
    payment_provider: 'worldpay',
    amount: 10000,
    reference: 'REF-SUCCEEDED-001',
    description: 'Test payment - success state',
    state: {
      status: 'success',
      finished: true,
    },
    return_url: 'https://example.com/return',
    created_date: '2024-01-15T10:00:00.000Z',
    card_details: {
      card_brand: 'Visa',
      card_type: 'debit',
      last_digits_card_number: '4242',
      first_digits_card_number: '424242',
      expiry_date: '12/25',
      cardholder_name: 'Test User',
    },
  },
};

/**
 * Payment Captured Event - Payment has been captured
 */
export const PAYMENT_CAPTURED_WEBHOOK: WebhookPayload = {
  webhook_message_id: 'evt_test_captured_001',
  api_version: 1,
  event_type: 'card_payment_captured',
  created_date: '2024-01-15T10:03:00.000Z',
  resource_id: 'pay_test_001',
  resource_type: 'payment',
  resource: {
    payment_id: 'pay_test_001',
    payment_provider: 'worldpay',
    amount: 10000,
    reference: 'REF-CAPTURED-001',
    description: 'Test payment - captured state',
    state: {
      status: 'success',
      finished: true,
    },
    return_url: 'https://example.com/return',
    created_date: '2024-01-15T10:00:00.000Z',
    settlement_summary: {
      capture_submit_time: '2024-01-15T10:03:00.000Z',
      captured_date: '2024-01-15',
    },
  },
};

/**
 * Payment Failed Event - Payment has failed
 */
export const PAYMENT_FAILED_WEBHOOK: WebhookPayload = {
  webhook_message_id: 'evt_test_failed_001',
  api_version: 1,
  event_type: 'card_payment_failed',
  created_date: '2024-01-15T10:02:00.000Z',
  resource_id: 'pay_test_002',
  resource_type: 'payment',
  resource: {
    payment_id: 'pay_test_002',
    payment_provider: 'worldpay',
    amount: 5000,
    reference: 'REF-FAILED-001',
    description: 'Test payment - failed state',
    state: {
      status: 'failed',
      finished: true,
      message: 'Payment was declined',
      code: 'P0010',
    },
    return_url: 'https://example.com/return',
    created_date: '2024-01-15T10:00:00.000Z',
  },
};

/**
 * Payment Cancelled Event - Payment was cancelled by user
 */
export const PAYMENT_CANCELLED_WEBHOOK: WebhookPayload = {
  webhook_message_id: 'evt_test_cancelled_001',
  api_version: 1,
  event_type: 'card_payment_cancelled',
  created_date: '2024-01-15T10:02:00.000Z',
  resource_id: 'pay_test_003',
  resource_type: 'payment',
  resource: {
    payment_id: 'pay_test_003',
    payment_provider: 'worldpay',
    amount: 7500,
    reference: 'REF-CANCELLED-001',
    description: 'Test payment - cancelled state',
    state: {
      status: 'cancelled',
      finished: true,
      message: 'Payment was cancelled by user',
      code: 'P0030',
    },
    return_url: 'https://example.com/return',
    created_date: '2024-01-15T10:00:00.000Z',
  },
};

/**
 * Refund Succeeded Event - Refund has been processed
 * NOTE: GOV.UK Pay not integrated yet - this is a mock payload
 */
export const REFUND_SUCCEEDED_WEBHOOK = {
  webhook_message_id: 'evt_test_refund_001',
  api_version: 1,
  event_type: 'refund_succeeded',
  created_date: '2024-01-15T11:00:00.000Z',
  resource_id: 'refund_test_001',
  resource_type: 'refund',
  resource: {
    refund_id: 'refund_test_001',
    payment_id: 'pay_test_001',
    amount: 10000,
    status: 'success',
    created_date: '2024-01-15T11:00:00.000Z',
  },
};

/**
 * Invalid webhook payload - missing required fields
 */
export const INVALID_WEBHOOK_MISSING_FIELDS = {
  webhook_message_id: 'evt_test_invalid_001',
  api_version: 1,
  // Missing event_type
  // Missing resource_id
  resource_type: 'payment',
};

/**
 * Invalid webhook payload - malformed structure
 */
export const INVALID_WEBHOOK_MALFORMED = {
  webhook_message_id: 'evt_test_invalid_002',
  api_version: 1,
  event_type: 'card_payment_succeeded',
  resource_id: 'pay_test_004',
  resource_type: 'payment',
  resource: {
    // Missing required payment fields
    payment_id: 'pay_test_004',
    // Missing amount
    // Missing state
  },
};
