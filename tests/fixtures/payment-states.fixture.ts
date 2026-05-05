/**
 * ===================================================================
 * Payment States Test Fixture
 * ===================================================================
 * Contains payment state definitions and transition rules
 * Represents the expected payment lifecycle in our system
 * 
 * State Machine: created → confirmed → captured → settled → refunded
 * 
 * IMPORTANT: GOV.UK Pay states differ from our internal states
 * This fixture defines OUR internal state model
 */

/**
 * Internal Payment Status (our domain model)
 */
export enum PaymentStatus {
  CREATED = 'created',
  CONFIRMED = 'confirmed',
  CAPTURED = 'captured',
  SETTLED = 'settled',
  REFUNDED = 'refunded',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * Payment record structure in our database
 */
export interface PaymentRecord {
  id?: number;
  govuk_pay_id: string;
  amount: number;
  reference: string;
  description?: string;
  status: PaymentStatus;
  payment_provider?: string;
  card_brand?: string;
  card_last_four?: string;
  cardholder_name?: string;
  event_count: number;
  created_at?: Date;
  confirmed_at?: Date;
  captured_at?: Date;
  settled_at?: Date;
  refunded_at?: Date;
  failed_at?: Date;
  cancelled_at?: Date;
  metadata?: Record<string, any>;
}

/**
 * Valid state transitions
 * Key: current state
 * Value: array of allowed next states
 */
export const VALID_STATE_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  [PaymentStatus.CREATED]: [
    PaymentStatus.CONFIRMED,
    PaymentStatus.FAILED,
    PaymentStatus.CANCELLED,
  ],
  [PaymentStatus.CONFIRMED]: [
    PaymentStatus.CAPTURED,
    PaymentStatus.FAILED,
    PaymentStatus.CANCELLED,
  ],
  [PaymentStatus.CAPTURED]: [
    PaymentStatus.SETTLED,
    PaymentStatus.REFUNDED,
  ],
  [PaymentStatus.SETTLED]: [
    PaymentStatus.REFUNDED,
  ],
  [PaymentStatus.REFUNDED]: [], // Terminal state
  [PaymentStatus.FAILED]: [], // Terminal state
  [PaymentStatus.CANCELLED]: [], // Terminal state
};

/**
 * Terminal states - cannot transition to any other state
 */
export const TERMINAL_STATES: PaymentStatus[] = [
  PaymentStatus.REFUNDED,
  PaymentStatus.FAILED,
  PaymentStatus.CANCELLED,
];

/**
 * Check if a state transition is valid
 */
export function isValidTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  if (from === to) {
    return true; // Idempotent - same state is always valid
  }
  return VALID_STATE_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Check if a state is terminal
 */
export function isTerminalState(state: PaymentStatus): boolean {
  return TERMINAL_STATES.includes(state);
}

/**
 * Payment State Fixtures
 */

export const PAYMENT_STATE_CREATED: PaymentRecord = {
  govuk_pay_id: 'pay_test_created_001',
  amount: 10000,
  reference: 'REF-CREATED-001',
  description: 'Test payment in created state',
  status: PaymentStatus.CREATED,
  payment_provider: 'worldpay',
  event_count: 1,
  created_at: new Date('2024-01-15T10:00:00.000Z'),
};

export const PAYMENT_STATE_CONFIRMED: PaymentRecord = {
  govuk_pay_id: 'pay_test_confirmed_001',
  amount: 10000,
  reference: 'REF-CONFIRMED-001',
  description: 'Test payment in confirmed state',
  status: PaymentStatus.CONFIRMED,
  payment_provider: 'worldpay',
  card_brand: 'Visa',
  card_last_four: '4242',
  cardholder_name: 'Test User',
  event_count: 2,
  created_at: new Date('2024-01-15T10:00:00.000Z'),
  confirmed_at: new Date('2024-01-15T10:02:00.000Z'),
};

export const PAYMENT_STATE_CAPTURED: PaymentRecord = {
  govuk_pay_id: 'pay_test_captured_001',
  amount: 10000,
  reference: 'REF-CAPTURED-001',
  description: 'Test payment in captured state',
  status: PaymentStatus.CAPTURED,
  payment_provider: 'worldpay',
  card_brand: 'Visa',
  card_last_four: '4242',
  cardholder_name: 'Test User',
  event_count: 3,
  created_at: new Date('2024-01-15T10:00:00.000Z'),
  confirmed_at: new Date('2024-01-15T10:02:00.000Z'),
  captured_at: new Date('2024-01-15T10:03:00.000Z'),
};

export const PAYMENT_STATE_SETTLED: PaymentRecord = {
  govuk_pay_id: 'pay_test_settled_001',
  amount: 10000,
  reference: 'REF-SETTLED-001',
  description: 'Test payment in settled state',
  status: PaymentStatus.SETTLED,
  payment_provider: 'worldpay',
  card_brand: 'Visa',
  card_last_four: '4242',
  cardholder_name: 'Test User',
  event_count: 4,
  created_at: new Date('2024-01-15T10:00:00.000Z'),
  confirmed_at: new Date('2024-01-15T10:02:00.000Z'),
  captured_at: new Date('2024-01-15T10:03:00.000Z'),
  settled_at: new Date('2024-01-15T12:00:00.000Z'),
};

export const PAYMENT_STATE_REFUNDED: PaymentRecord = {
  govuk_pay_id: 'pay_test_refunded_001',
  amount: 10000,
  reference: 'REF-REFUNDED-001',
  description: 'Test payment in refunded state (TERMINAL)',
  status: PaymentStatus.REFUNDED,
  payment_provider: 'worldpay',
  card_brand: 'Visa',
  card_last_four: '4242',
  cardholder_name: 'Test User',
  event_count: 5,
  created_at: new Date('2024-01-15T10:00:00.000Z'),
  confirmed_at: new Date('2024-01-15T10:02:00.000Z'),
  captured_at: new Date('2024-01-15T10:03:00.000Z'),
  settled_at: new Date('2024-01-15T12:00:00.000Z'),
  refunded_at: new Date('2024-01-16T09:00:00.000Z'),
};

export const PAYMENT_STATE_FAILED: PaymentRecord = {
  govuk_pay_id: 'pay_test_failed_001',
  amount: 5000,
  reference: 'REF-FAILED-001',
  description: 'Test payment in failed state (TERMINAL)',
  status: PaymentStatus.FAILED,
  payment_provider: 'worldpay',
  event_count: 2,
  created_at: new Date('2024-01-15T10:00:00.000Z'),
  failed_at: new Date('2024-01-15T10:02:00.000Z'),
};

export const PAYMENT_STATE_CANCELLED: PaymentRecord = {
  govuk_pay_id: 'pay_test_cancelled_001',
  amount: 7500,
  reference: 'REF-CANCELLED-001',
  description: 'Test payment in cancelled state (TERMINAL)',
  status: PaymentStatus.CANCELLED,
  payment_provider: 'worldpay',
  event_count: 2,
  created_at: new Date('2024-01-15T10:00:00.000Z'),
  cancelled_at: new Date('2024-01-15T10:02:00.000Z'),
};

/**
 * Invalid State Transition Scenarios
 * Used to test that invalid transitions are rejected
 */

export const INVALID_TRANSITION_SCENARIOS = [
  {
    name: 'Cannot transition from CONFIRMED to CREATED (regression)',
    from: PAYMENT_STATE_CONFIRMED,
    to: PaymentStatus.CREATED,
    reason: 'Cannot regress to earlier state',
  },
  {
    name: 'Cannot transition from CAPTURED to CONFIRMED (regression)',
    from: PAYMENT_STATE_CAPTURED,
    to: PaymentStatus.CONFIRMED,
    reason: 'Cannot regress to earlier state',
  },
  {
    name: 'Cannot transition from REFUNDED to SETTLED (terminal state)',
    from: PAYMENT_STATE_REFUNDED,
    to: PaymentStatus.SETTLED,
    reason: 'REFUNDED is a terminal state',
  },
  {
    name: 'Cannot transition from FAILED to CONFIRMED (terminal state)',
    from: PAYMENT_STATE_FAILED,
    to: PaymentStatus.CONFIRMED,
    reason: 'FAILED is a terminal state',
  },
  {
    name: 'Cannot transition from CANCELLED to CAPTURED (terminal state)',
    from: PAYMENT_STATE_CANCELLED,
    to: PaymentStatus.CAPTURED,
    reason: 'CANCELLED is a terminal state',
  },
  {
    name: 'Cannot transition from CREATED directly to CAPTURED (skip state)',
    from: PAYMENT_STATE_CREATED,
    to: PaymentStatus.CAPTURED,
    reason: 'Must go through CONFIRMED state first',
  },
];

/**
 * Out-of-Order Event Scenarios
 * Used to test handling of events arriving in wrong order
 */

export const OUT_OF_ORDER_SCENARIOS = [
  {
    name: 'Captured event arrives before Confirmed event',
    currentState: PAYMENT_STATE_CREATED,
    eventState: PaymentStatus.CAPTURED,
    expectedBehavior: 'Skip or queue event until CONFIRMED arrives',
  },
  {
    name: 'Settled event arrives before Captured event',
    currentState: PAYMENT_STATE_CONFIRMED,
    eventState: PaymentStatus.SETTLED,
    expectedBehavior: 'Skip or queue event until CAPTURED arrives',
  },
];

/**
 * Idempotency Test Scenarios
 * Used to test duplicate event handling
 */

export const IDEMPOTENCY_SCENARIOS = [
  {
    name: 'Duplicate CONFIRMED event for already confirmed payment',
    currentState: PAYMENT_STATE_CONFIRMED,
    duplicateEvent: PaymentStatus.CONFIRMED,
    expectedBehavior: 'No state change, no error, idempotent',
  },
  {
    name: 'Duplicate CAPTURED event for already captured payment',
    currentState: PAYMENT_STATE_CAPTURED,
    duplicateEvent: PaymentStatus.CAPTURED,
    expectedBehavior: 'No state change, no error, idempotent',
  },
  {
    name: 'Duplicate FAILED event for already failed payment',
    currentState: PAYMENT_STATE_FAILED,
    duplicateEvent: PaymentStatus.FAILED,
    expectedBehavior: 'No state change, terminal state protected',
  },
];
