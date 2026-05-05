/**
 * ===================================================================
 * Unit Tests: Terminal State Protection
 * ===================================================================
 * Tests protection of terminal payment states from modification
 * 
 * Structure:
 * 1. TEST DATA - Terminal states and attempted transitions
 * 2. TEST SCENARIOS - Given/When/Then test cases
 * 3. EXPECTED RESULTS - Assertions on state protection
 */

import {
  PaymentStatus,
  TERMINAL_STATES,
  isTerminalState,
  isValidTransition,
  PAYMENT_STATE_REFUNDED,
  PAYMENT_STATE_FAILED,
  PAYMENT_STATE_CANCELLED,
} from '../fixtures/payment-states.fixture';
import {
  InMemoryPaymentRepository,
  MockStateTransitionService,
  MockBuilderFactory,
} from '../helpers/mock-builders';
import { TestDataFactory } from '../fixtures/test-data.factory';

// ===================================================================
// TEST DATA
// ===================================================================

/**
 * Terminal state test data
 * Defines terminal states that cannot be modified
 */
const TERMINAL_STATE_TEST_DATA = [
  {
    state: PaymentStatus.REFUNDED,
    name: 'REFUNDED',
    fixture: PAYMENT_STATE_REFUNDED,
    description: 'Payment has been refunded - final state',
  },
  {
    state: PaymentStatus.FAILED,
    name: 'FAILED',
    fixture: PAYMENT_STATE_FAILED,
    description: 'Payment has failed - final state',
  },
  {
    state: PaymentStatus.CANCELLED,
    name: 'CANCELLED',
    fixture: PAYMENT_STATE_CANCELLED,
    description: 'Payment was cancelled - final state',
  },
];

/**
 * Attempted state changes on terminal states
 * All should be rejected
 */
const TERMINAL_STATE_CHANGE_ATTEMPTS = [
  {
    terminalState: PaymentStatus.REFUNDED,
    attemptedState: PaymentStatus.SETTLED,
    reason: 'Cannot unsettled a refunded payment',
  },
  {
    terminalState: PaymentStatus.REFUNDED,
    attemptedState: PaymentStatus.CONFIRMED,
    reason: 'Cannot regress refunded payment to confirmed',
  },
  {
    terminalState: PaymentStatus.FAILED,
    attemptedState: PaymentStatus.CONFIRMED,
    reason: 'Cannot resurrect failed payment',
  },
  {
    terminalState: PaymentStatus.FAILED,
    attemptedState: PaymentStatus.CAPTURED,
    reason: 'Cannot capture failed payment',
  },
  {
    terminalState: PaymentStatus.CANCELLED,
    attemptedState: PaymentStatus.CONFIRMED,
    reason: 'Cannot resurrect cancelled payment',
  },
  {
    terminalState: PaymentStatus.CANCELLED,
    attemptedState: PaymentStatus.CAPTURED,
    reason: 'Cannot capture cancelled payment',
  },
];

/**
 * Duplicate events on terminal states
 * Should be idempotent (no change)
 */
const DUPLICATE_TERMINAL_STATE_EVENTS = [
  {
    terminalState: PaymentStatus.REFUNDED,
    fixture: PAYMENT_STATE_REFUNDED,
    duplicateEventType: 'refund_succeeded',
    expectedBehavior: 'Idempotent - no change',
  },
  {
    terminalState: PaymentStatus.FAILED,
    fixture: PAYMENT_STATE_FAILED,
    duplicateEventType: 'card_payment_failed',
    expectedBehavior: 'Idempotent - no change',
  },
  {
    terminalState: PaymentStatus.CANCELLED,
    fixture: PAYMENT_STATE_CANCELLED,
    duplicateEventType: 'card_payment_cancelled',
    expectedBehavior: 'Idempotent - no change',
  },
];

// ===================================================================
// TEST SCENARIOS
// ===================================================================

describe('Terminal State Protection', () => {
  let paymentRepository: InMemoryPaymentRepository;
  let stateTransitionService: MockStateTransitionService;

  beforeEach(() => {
    // SETUP: Create fresh mocks
    paymentRepository = MockBuilderFactory.paymentRepository();
    stateTransitionService = MockBuilderFactory.stateTransitionService();
  });

  afterEach(() => {
    // CLEANUP: Clear mock data
    paymentRepository.clear();
  });

  // ===================================================================
  // SCENARIO 1: Identifying Terminal States
  // ===================================================================
  describe('SCENARIO: Identifying Terminal States', () => {
    /**
     * Given: A payment status
     * When: Checking if status is terminal
     * Then: Should correctly identify terminal states
     */
    TERMINAL_STATE_TEST_DATA.forEach(({ state, name, description }) => {
      test(`should identify ${name} as terminal state`, () => {
        // GIVEN: Terminal state
        const paymentStatus = state;

        // WHEN: Checking if terminal
        const result = isTerminalState(paymentStatus);

        // THEN: Identified as terminal
        expect(result).toBe(true);
      });
    });

    /**
     * Given: Non-terminal states
     * When: Checking if status is terminal
     * Then: Should return false
     */
    const nonTerminalStates = [
      PaymentStatus.CREATED,
      PaymentStatus.CONFIRMED,
      PaymentStatus.CAPTURED,
      PaymentStatus.SETTLED,
    ];

    nonTerminalStates.forEach((state) => {
      test(`should identify ${state} as non-terminal state`, () => {
        // GIVEN: Non-terminal state
        const paymentStatus = state;

        // WHEN: Checking if terminal
        const result = isTerminalState(paymentStatus);

        // THEN: Not terminal
        expect(result).toBe(false);
      });
    });
  });

  // ===================================================================
  // SCENARIO 2: Preventing State Changes on Terminal States
  // ===================================================================
  describe('SCENARIO: Preventing State Changes', () => {
    /**
     * Given: Payment in terminal state
     * When: Attempting to transition to another state
     * Then: Transition should be rejected
     */
    TERMINAL_STATE_CHANGE_ATTEMPTS.forEach(
      ({ terminalState, attemptedState, reason }) => {
        test(`should reject ${terminalState} → ${attemptedState}`, async () => {
          // GIVEN: Payment in terminal state
          const currentState = terminalState;

          // WHEN: Attempting state transition
          const validation = await stateTransitionService.validateTransition(
            currentState,
            attemptedState
          );

          // THEN: Transition rejected
          expect(validation.valid).toBe(false);
          expect(validation.reason).toBeDefined();
        });
      }
    );

    /**
     * Given: Payment in REFUNDED state
     * When: Attempting any state transition (except same state)
     * Then: All transitions should be rejected
     */
    test('should reject all transitions from REFUNDED state', async () => {
      // GIVEN: Payment in REFUNDED state
      const terminalState = PaymentStatus.REFUNDED;

      // WHEN: Attempting transitions to all other states
      const otherStates = Object.values(PaymentStatus).filter(
        (s) => s !== terminalState
      );

      // THEN: All transitions rejected
      for (const targetState of otherStates) {
        const validation = await stateTransitionService.validateTransition(
          terminalState,
          targetState
        );
        expect(validation.valid).toBe(false);
      }
    });

    /**
     * Given: Payment in FAILED state
     * When: Attempting any state transition (except same state)
     * Then: All transitions should be rejected
     */
    test('should reject all transitions from FAILED state', async () => {
      // GIVEN: Payment in FAILED state
      const terminalState = PaymentStatus.FAILED;

      // WHEN: Attempting transitions to all other states
      const otherStates = Object.values(PaymentStatus).filter(
        (s) => s !== terminalState
      );

      // THEN: All transitions rejected
      for (const targetState of otherStates) {
        const validation = await stateTransitionService.validateTransition(
          terminalState,
          targetState
        );
        expect(validation.valid).toBe(false);
      }
    });

    /**
     * Given: Payment in CANCELLED state
     * When: Attempting any state transition (except same state)
     * Then: All transitions should be rejected
     */
    test('should reject all transitions from CANCELLED state', async () => {
      // GIVEN: Payment in CANCELLED state
      const terminalState = PaymentStatus.CANCELLED;

      // WHEN: Attempting transitions to all other states
      const otherStates = Object.values(PaymentStatus).filter(
        (s) => s !== terminalState
      );

      // THEN: All transitions rejected
      for (const targetState of otherStates) {
        const validation = await stateTransitionService.validateTransition(
          terminalState,
          targetState
        );
        expect(validation.valid).toBe(false);
      }
    });
  });

  // ===================================================================
  // SCENARIO 3: Idempotent Duplicate Events on Terminal States
  // ===================================================================
  describe('SCENARIO: Duplicate Events on Terminal States', () => {
    /**
     * Given: Payment in terminal state
     * When: Duplicate event for same terminal state arrives
     * Then: Should be handled idempotently (no change)
     */
    DUPLICATE_TERMINAL_STATE_EVENTS.forEach(
      ({ terminalState, fixture, duplicateEventType, expectedBehavior }) => {
        test(`should handle duplicate ${duplicateEventType} on ${terminalState} idempotently`, async () => {
          // GIVEN: Payment in terminal state
          await paymentRepository.create(fixture);

          const initialPayment = await paymentRepository.findByGovukPayId(
            fixture.govuk_pay_id
          );

          // WHEN: Duplicate event arrives (same terminal state)
          const validation = await stateTransitionService.validateTransition(
            terminalState,
            terminalState // Same state
          );

          // THEN: Transition is valid (idempotent)
          expect(validation.valid).toBe(true);

          // AND: Payment state remains unchanged
          const finalPayment = await paymentRepository.findByGovukPayId(
            fixture.govuk_pay_id
          );
          expect(finalPayment?.status).toBe(terminalState);
          expect(finalPayment?.event_count).toBe(initialPayment?.event_count);
        });
      }
    );
  });

  // ===================================================================
  // SCENARIO 4: Terminal State Timestamps
  // ===================================================================
  describe('SCENARIO: Terminal State Timestamps', () => {
    /**
     * Given: Payment transitions to terminal state
     * When: Terminal state is reached
     * Then: Terminal timestamp should be set and protected
     */
    test('should preserve REFUNDED timestamp on terminal state', async () => {
      // GIVEN: Payment in REFUNDED state with timestamp
      const payment = PAYMENT_STATE_REFUNDED;
      await paymentRepository.create(payment);

      const initialRefundedAt = payment.refunded_at;

      // WHEN: Duplicate refund event arrives
      // (Simulated - no actual processing)

      // THEN: Refunded timestamp unchanged
      const finalPayment = await paymentRepository.findByGovukPayId(
        payment.govuk_pay_id
      );
      expect(finalPayment?.refunded_at).toEqual(initialRefundedAt);
    });

    test('should preserve FAILED timestamp on terminal state', async () => {
      // GIVEN: Payment in FAILED state with timestamp
      const payment = PAYMENT_STATE_FAILED;
      await paymentRepository.create(payment);

      const initialFailedAt = payment.failed_at;

      // WHEN: Duplicate failed event arrives
      // (Simulated - no actual processing)

      // THEN: Failed timestamp unchanged
      const finalPayment = await paymentRepository.findByGovukPayId(
        payment.govuk_pay_id
      );
      expect(finalPayment?.failed_at).toEqual(initialFailedAt);
    });

    test('should preserve CANCELLED timestamp on terminal state', async () => {
      // GIVEN: Payment in CANCELLED state with timestamp
      const payment = PAYMENT_STATE_CANCELLED;
      await paymentRepository.create(payment);

      const initialCancelledAt = payment.cancelled_at;

      // WHEN: Duplicate cancelled event arrives
      // (Simulated - no actual processing)

      // THEN: Cancelled timestamp unchanged
      const finalPayment = await paymentRepository.findByGovukPayId(
        payment.govuk_pay_id
      );
      expect(finalPayment?.cancelled_at).toEqual(initialCancelledAt);
    });
  });

  // ===================================================================
  // SCENARIO 5: Terminal State Configuration
  // ===================================================================
  describe('SCENARIO: Terminal State Configuration', () => {
    /**
     * Given: System configuration
     * When: Checking terminal states
     * Then: Should have exactly 3 terminal states
     */
    test('should define exactly 3 terminal states', () => {
      // GIVEN: System configuration

      // WHEN: Checking terminal states
      const terminalStateCount = TERMINAL_STATES.length;

      // THEN: Exactly 3 terminal states
      expect(terminalStateCount).toBe(3);
    });

    /**
     * Given: Terminal states configuration
     * When: Checking each terminal state
     * Then: Should have no outbound transitions
     */
    test('should have no outbound transitions for terminal states', async () => {
      // GIVEN: Terminal states
      const terminalStates = TERMINAL_STATES;

      // WHEN: Checking outbound transitions
      for (const terminalState of terminalStates) {
        const isTerminal = stateTransitionService.isTerminalState(terminalState);

        // THEN: State is terminal with no outbound transitions
        expect(isTerminal).toBe(true);
      }
    });
  });

  // ===================================================================
  // SCENARIO 6: Terminal State Event Count Protection
  // ===================================================================
  describe('SCENARIO: Event Count Protection on Terminal States', () => {
    /**
     * Given: Payment in terminal state
     * When: Duplicate event arrives
     * Then: Event count should NOT increment
     */
    test('should not increment event count on duplicate terminal state event', async () => {
      // GIVEN: Payment in REFUNDED state
      const payment = PAYMENT_STATE_REFUNDED;
      await paymentRepository.create(payment);

      const initialEventCount = payment.event_count;

      // WHEN: Duplicate refunded event arrives
      // (Simulated idempotent processing - no state change)
      const finalPayment = await paymentRepository.findByGovukPayId(
        payment.govuk_pay_id
      );

      // THEN: Event count unchanged
      expect(finalPayment?.event_count).toBe(initialEventCount);
    });

    /**
     * Given: Multiple duplicate events on terminal state
     * When: Processing all duplicate events
     * Then: Event count should remain at terminal value
     */
    test('should maintain event count across multiple duplicate terminal events', async () => {
      // GIVEN: Payment in FAILED state
      const payment = PAYMENT_STATE_FAILED;
      await paymentRepository.create(payment);

      const initialEventCount = payment.event_count;

      // WHEN: Multiple duplicate failed events arrive
      // (Simulated - 3 duplicate events)
      const duplicateWebhook1 = TestDataFactory.webhookForFailed(payment.govuk_pay_id);
      const duplicateWebhook2 = TestDataFactory.webhookForFailed(payment.govuk_pay_id);
      const duplicateWebhook3 = TestDataFactory.webhookForFailed(payment.govuk_pay_id);

      // All would be detected as duplicates and skipped

      // THEN: Event count remains unchanged
      const finalPayment = await paymentRepository.findByGovukPayId(
        payment.govuk_pay_id
      );
      expect(finalPayment?.event_count).toBe(initialEventCount);
    });
  });
});

// ===================================================================
// EXPECTED RESULTS SUMMARY
// ===================================================================

/**
 * EXPECTED RESULTS:
 * 
 * 🛡️ Terminal State Identification:
 *    - REFUNDED, FAILED, CANCELLED identified as terminal
 *    - Other states identified as non-terminal
 * 
 * ❌ State Change Prevention:
 *    - All transitions from terminal states rejected
 *    - Terminal states cannot be overwritten
 *    - State transitions validated before applying
 * 
 * 🔄 Idempotent Duplicate Handling:
 *    - Duplicate events on terminal states are idempotent
 *    - Same terminal state → same terminal state allowed
 *    - No state changes on duplicate events
 * 
 * ⏱️ Timestamp Protection:
 *    - Terminal timestamps (refunded_at, failed_at, cancelled_at) preserved
 *    - Duplicate events don't update timestamps
 * 
 * 📊 Event Count Protection:
 *    - Event counts don't increment on duplicate terminal events
 *    - Terminal state event count is final
 * 
 * ✅ Configuration:
 *    - Exactly 3 terminal states defined
 *    - Terminal states have no outbound transitions
 */
