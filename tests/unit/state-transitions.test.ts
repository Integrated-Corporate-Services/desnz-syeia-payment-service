/**
 * ===================================================================
 * Unit Tests: State Transition Logic
 * ===================================================================
 * Tests payment state transition validation
 * 
 * Structure:
 * 1. TEST DATA - Static state fixtures and transition scenarios
 * 2. TEST SCENARIOS - Given/When/Then test cases
 * 3. EXPECTED RESULTS - Assertions on valid/invalid transitions
 */

import {
  PaymentStatus,
  VALID_STATE_TRANSITIONS,
  TERMINAL_STATES,
  isValidTransition,
  isTerminalState,
  INVALID_TRANSITION_SCENARIOS,
  PAYMENT_STATE_CREATED,
  PAYMENT_STATE_CONFIRMED,
  PAYMENT_STATE_CAPTURED,
  PAYMENT_STATE_REFUNDED,
  PAYMENT_STATE_FAILED,
} from '../fixtures/payment-states.fixture';
import { TestDataFactory } from '../fixtures/test-data.factory';

// ===================================================================
// TEST DATA
// ===================================================================

/**
 * Valid transition test data
 * Defines all allowed state transitions in our system
 */
const VALID_TRANSITIONS_TEST_DATA = [
  {
    name: 'CREATED → CONFIRMED',
    from: PaymentStatus.CREATED,
    to: PaymentStatus.CONFIRMED,
    description: 'Payment moves from created to confirmed when user completes payment',
  },
  {
    name: 'CREATED → FAILED',
    from: PaymentStatus.CREATED,
    to: PaymentStatus.FAILED,
    description: 'Payment can fail from created state',
  },
  {
    name: 'CREATED → CANCELLED',
    from: PaymentStatus.CREATED,
    to: PaymentStatus.CANCELLED,
    description: 'Payment can be cancelled from created state',
  },
  {
    name: 'CONFIRMED → CAPTURED',
    from: PaymentStatus.CONFIRMED,
    to: PaymentStatus.CAPTURED,
    description: 'Confirmed payment moves to captured',
  },
  {
    name: 'CAPTURED → SETTLED',
    from: PaymentStatus.CAPTURED,
    to: PaymentStatus.SETTLED,
    description: 'Captured payment moves to settled',
  },
  {
    name: 'CAPTURED → REFUNDED',
    from: PaymentStatus.CAPTURED,
    to: PaymentStatus.REFUNDED,
    description: 'Captured payment can be refunded',
  },
  {
    name: 'SETTLED → REFUNDED',
    from: PaymentStatus.SETTLED,
    to: PaymentStatus.REFUNDED,
    description: 'Settled payment can be refunded',
  },
];

/**
 * Invalid transition test data
 * Defines all disallowed state transitions
 */
const INVALID_TRANSITIONS_TEST_DATA = [
  {
    name: 'CONFIRMED → CREATED (regression)',
    from: PaymentStatus.CONFIRMED,
    to: PaymentStatus.CREATED,
    expectedError: 'Cannot regress to earlier state',
  },
  {
    name: 'CAPTURED → CONFIRMED (regression)',
    from: PaymentStatus.CAPTURED,
    to: PaymentStatus.CONFIRMED,
    expectedError: 'Cannot regress to earlier state',
  },
  {
    name: 'REFUNDED → SETTLED (terminal state violation)',
    from: PaymentStatus.REFUNDED,
    to: PaymentStatus.SETTLED,
    expectedError: 'REFUNDED is a terminal state',
  },
  {
    name: 'FAILED → CONFIRMED (terminal state violation)',
    from: PaymentStatus.FAILED,
    to: PaymentStatus.CONFIRMED,
    expectedError: 'FAILED is a terminal state',
  },
  {
    name: 'CANCELLED → CAPTURED (terminal state violation)',
    from: PaymentStatus.CANCELLED,
    to: PaymentStatus.CAPTURED,
    expectedError: 'CANCELLED is a terminal state',
  },
  {
    name: 'CREATED → CAPTURED (skip state)',
    from: PaymentStatus.CREATED,
    to: PaymentStatus.CAPTURED,
    expectedError: 'Must go through CONFIRMED first',
  },
  {
    name: 'CREATED → SETTLED (skip multiple states)',
    from: PaymentStatus.CREATED,
    to: PaymentStatus.SETTLED,
    expectedError: 'Must go through intermediate states',
  },
];

/**
 * Idempotent transition test data
 * Same state → same state should always be valid
 */
const IDEMPOTENT_TRANSITIONS_TEST_DATA = [
  {
    name: 'CREATED → CREATED (idempotent)',
    state: PaymentStatus.CREATED,
    description: 'Duplicate created event should be idempotent',
  },
  {
    name: 'CONFIRMED → CONFIRMED (idempotent)',
    state: PaymentStatus.CONFIRMED,
    description: 'Duplicate confirmed event should be idempotent',
  },
  {
    name: 'CAPTURED → CAPTURED (idempotent)',
    state: PaymentStatus.CAPTURED,
    description: 'Duplicate captured event should be idempotent',
  },
  {
    name: 'REFUNDED → REFUNDED (idempotent terminal)',
    state: PaymentStatus.REFUNDED,
    description: 'Duplicate refunded event on terminal state should be idempotent',
  },
  {
    name: 'FAILED → FAILED (idempotent terminal)',
    state: PaymentStatus.FAILED,
    description: 'Duplicate failed event on terminal state should be idempotent',
  },
];

// ===================================================================
// TEST SCENARIOS
// ===================================================================

describe('State Transition Validation', () => {
  // ===================================================================
  // SCENARIO 1: Valid State Transitions
  // ===================================================================
  describe('SCENARIO: Valid State Transitions', () => {
    /**
     * Given: A payment in a specific state
     * When: A valid transition is attempted
     * Then: The transition should be allowed
     */
    VALID_TRANSITIONS_TEST_DATA.forEach(({ name, from, to, description }) => {
      test(`should allow ${name}`, () => {
        // GIVEN: Payment in source state
        const currentState = from;

        // WHEN: Attempting valid transition
        const result = isValidTransition(currentState, to);

        // THEN: Transition is allowed
        expect(result).toBe(true);
      });
    });
  });

  // ===================================================================
  // SCENARIO 2: Invalid State Transitions
  // ===================================================================
  describe('SCENARIO: Invalid State Transitions', () => {
    /**
     * Given: A payment in a specific state
     * When: An invalid transition is attempted
     * Then: The transition should be rejected
     */
    INVALID_TRANSITIONS_TEST_DATA.forEach(({ name, from, to, expectedError }) => {
      test(`should reject ${name}`, () => {
        // GIVEN: Payment in source state
        const currentState = from;

        // WHEN: Attempting invalid transition
        const result = isValidTransition(currentState, to);

        // THEN: Transition is rejected
        expect(result).toBe(false);
      });
    });
  });

  // ===================================================================
  // SCENARIO 3: Idempotent Transitions (Same State)
  // ===================================================================
  describe('SCENARIO: Idempotent Transitions', () => {
    /**
     * Given: A payment in a specific state
     * When: A transition to the same state is attempted (duplicate event)
     * Then: The transition should be allowed (idempotent)
     */
    IDEMPOTENT_TRANSITIONS_TEST_DATA.forEach(({ name, state, description }) => {
      test(`should allow ${name}`, () => {
        // GIVEN: Payment in current state
        const currentState = state;

        // WHEN: Attempting transition to same state
        const result = isValidTransition(currentState, state);

        // THEN: Transition is allowed (idempotent)
        expect(result).toBe(true);
      });
    });
  });

  // ===================================================================
  // SCENARIO 4: Terminal State Protection
  // ===================================================================
  describe('SCENARIO: Terminal State Protection', () => {
    /**
     * Given: A payment in a terminal state
     * When: Any transition is attempted
     * Then: Only same-state transitions should be allowed
     */
    const terminalStatesTestData = [
      { state: PaymentStatus.REFUNDED, name: 'REFUNDED' },
      { state: PaymentStatus.FAILED, name: 'FAILED' },
      { state: PaymentStatus.CANCELLED, name: 'CANCELLED' },
    ];

    terminalStatesTestData.forEach(({ state, name }) => {
      test(`should protect ${name} terminal state`, () => {
        // GIVEN: Payment in terminal state
        const currentState = state;

        // WHEN: Checking if state is terminal
        const result = isTerminalState(currentState);

        // THEN: State is identified as terminal
        expect(result).toBe(true);

        // AND: No outbound transitions are allowed (except same state)
        const allowedTransitions = VALID_STATE_TRANSITIONS[currentState];
        expect(allowedTransitions).toEqual([]);
      });

      test(`should reject all transitions from ${name} (except same state)`, () => {
        // GIVEN: Payment in terminal state
        const currentState = state;

        // WHEN: Attempting transitions to other states
        const otherStates = Object.values(PaymentStatus).filter((s) => s !== state);

        // THEN: All transitions are rejected
        otherStates.forEach((targetState) => {
          const result = isValidTransition(currentState, targetState);
          expect(result).toBe(false);
        });
      });
    });
  });

  // ===================================================================
  // SCENARIO 5: Transition Rules Configuration
  // ===================================================================
  describe('SCENARIO: Transition Rules Configuration', () => {
    /**
     * Given: System configuration
     * When: Checking transition rules
     * Then: Rules should match business requirements
     */
    test('should have exactly 3 terminal states', () => {
      // GIVEN: System configuration

      // WHEN: Counting terminal states
      const terminalStateCount = TERMINAL_STATES.length;

      // THEN: Exactly 3 terminal states
      expect(terminalStateCount).toBe(3);
      expect(TERMINAL_STATES).toContain(PaymentStatus.REFUNDED);
      expect(TERMINAL_STATES).toContain(PaymentStatus.FAILED);
      expect(TERMINAL_STATES).toContain(PaymentStatus.CANCELLED);
    });

    test('should define transitions for all payment statuses', () => {
      // GIVEN: All payment statuses

      // WHEN: Checking transition rules
      const allStatuses = Object.values(PaymentStatus);

      // THEN: Every status has transition rules defined
      allStatuses.forEach((status) => {
        expect(VALID_STATE_TRANSITIONS).toHaveProperty(status);
      });
    });
  });
});

// ===================================================================
// EXPECTED RESULTS SUMMARY
// ===================================================================

/**
 * EXPECTED RESULTS:
 * 
 * ✅ Valid Transitions:
 *    - CREATED → CONFIRMED, FAILED, CANCELLED
 *    - CONFIRMED → CAPTURED, FAILED, CANCELLED
 *    - CAPTURED → SETTLED, REFUNDED
 *    - SETTLED → REFUNDED
 * 
 * ❌ Invalid Transitions:
 *    - Any regression to earlier state
 *    - Any transition from terminal states
 *    - Skipping intermediate states
 * 
 * 🔄 Idempotent Transitions:
 *    - Same state → same state always valid
 *    - Handles duplicate webhook events
 * 
 * 🛡️ Terminal State Protection:
 *    - REFUNDED, FAILED, CANCELLED are terminal
 *    - No transitions allowed from terminal states
 *    - Terminal state cannot be overwritten
 */
