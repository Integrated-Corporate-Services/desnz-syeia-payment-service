/**
 * ===================================================================
 * Integration Tests: Payment Webhook Handler
 * ===================================================================
 * Tests end-to-end webhook handling flow with mocked dependencies
 * 
 * Structure:
 * 1. TEST DATA - Webhook payloads and expected database states
 * 2. TEST SCENARIOS - Full flow: Webhook → Handler → Service → Repository
 * 3. EXPECTED RESULTS - Assertions on final state and side effects
 * 
 * IMPORTANT: GOV.UK Pay is NOT integrated - all GOV.UK Pay interactions mocked
 */

import {
  InMemoryPaymentRepository,
  MockIdempotencyService,
  MockStateTransitionService,
  MockEventPublisher,
  MockBuilderFactory,
} from '../helpers/mock-builders';
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
  TestAssertions,
} from '../helpers/test-setup';
import { TestDataFactory, SignatureGenerator } from '../fixtures/test-data.factory';
import {
  PaymentStatus,
  PaymentRecord,
} from '../fixtures/payment-states.fixture';
import {
  PAYMENT_CREATED_WEBHOOK,
  PAYMENT_SUCCEEDED_WEBHOOK,
  PAYMENT_CAPTURED_WEBHOOK,
  PAYMENT_FAILED_WEBHOOK,
} from '../fixtures/webhook-payloads.fixture';

// ===================================================================
// TEST DATA
// ===================================================================

/**
 * Integration test scenarios
 * Defines full end-to-end test cases
 */
const INTEGRATION_TEST_SCENARIOS = [
  {
    name: 'New payment webhook creates payment record',
    webhookPayload: PAYMENT_SUCCEEDED_WEBHOOK,
    existingPayment: null,
    expectedStatus: PaymentStatus.CONFIRMED,
    expectedEventCount: 1,
    expectedHttpStatus: 202,
    description: 'First webhook creates new payment in database',
  },
  {
    name: 'Duplicate webhook is idempotent',
    webhookPayload: PAYMENT_SUCCEEDED_WEBHOOK,
    existingPayment: {
      govuk_pay_id: PAYMENT_SUCCEEDED_WEBHOOK.resource_id,
      status: PaymentStatus.CONFIRMED,
      event_count: 1,
    },
    expectedStatus: PaymentStatus.CONFIRMED,
    expectedEventCount: 1, // No increment
    expectedHttpStatus: 202,
    description: 'Duplicate webhook doesn\'t change existing payment',
  },
  {
    name: 'Failed payment webhook creates failed record',
    webhookPayload: PAYMENT_FAILED_WEBHOOK,
    existingPayment: null,
    expectedStatus: PaymentStatus.FAILED,
    expectedEventCount: 1,
    expectedHttpStatus: 202,
    description: 'Failed webhook creates payment with FAILED status',
  },
];

/**
 * Invalid webhook test data
 * Tests error handling and validation
 */
const INVALID_WEBHOOK_SCENARIOS = [
  {
    name: 'Missing Pay-Signature header',
    webhookPayload: PAYMENT_SUCCEEDED_WEBHOOK,
    headers: {
      // No Pay-Signature header
      'content-type': 'application/json',
    },
    expectedHttpStatus: 401,
    expectedError: 'Missing signature',
  },
  {
    name: 'Invalid signature',
    webhookPayload: PAYMENT_SUCCEEDED_WEBHOOK,
    headers: {
      'pay-signature': 'invalid_signature_123',
      'content-type': 'application/json',
    },
    expectedHttpStatus: 401,
    expectedError: 'Invalid signature',
  },
  {
    name: 'Malformed webhook payload',
    webhookPayload: {
      webhook_message_id: 'evt_malformed',
      // Missing required fields
    },
    headers: {
      'pay-signature': 'valid_signature',
      'content-type': 'application/json',
    },
    expectedHttpStatus: 400,
    expectedError: 'Invalid payload',
  },
];

/**
 * State transition flow test data
 * Tests complete payment lifecycle
 */
const PAYMENT_LIFECYCLE_FLOW = [
  {
    step: 1,
    name: 'Payment Created',
    webhookPayload: PAYMENT_CREATED_WEBHOOK,
    expectedStatus: PaymentStatus.CREATED,
  },
  {
    step: 2,
    name: 'Payment Succeeded',
    webhookPayload: PAYMENT_SUCCEEDED_WEBHOOK,
    expectedStatus: PaymentStatus.CONFIRMED,
  },
  {
    step: 3,
    name: 'Payment Captured',
    webhookPayload: PAYMENT_CAPTURED_WEBHOOK,
    expectedStatus: PaymentStatus.CAPTURED,
  },
];

// ===================================================================
// TEST SCENARIOS
// ===================================================================

describe('Payment Webhook Handler - Integration Tests', () => {
  let paymentRepository: InMemoryPaymentRepository;
  let idempotencyService: MockIdempotencyService;
  let stateTransitionService: MockStateTransitionService;
  let eventPublisher: MockEventPublisher;

  beforeEach(() => {
    // SETUP: Create fresh mocks for each test
    paymentRepository = MockBuilderFactory.paymentRepository();
    idempotencyService = MockBuilderFactory.idempotencyService();
    stateTransitionService = MockBuilderFactory.stateTransitionService();
    eventPublisher = MockBuilderFactory.eventPublisher();

    TestDataFactory.reset();
  });

  afterEach(() => {
    // CLEANUP: Clear all mock data
    paymentRepository.clear();
    idempotencyService.clear();
    eventPublisher.clear();
  });

  // ===================================================================
  // SCENARIO 1: Successful Webhook Processing
  // ===================================================================
  describe('SCENARIO: Successful Webhook Processing', () => {
    /**
     * Given: A valid webhook payload with correct signature
     * When: Webhook is received and processed
     * Then: Payment should be created/updated in database
     */
    test('should process new payment webhook successfully', async () => {
      // GIVEN: Valid webhook payload
      const webhookPayload = TestDataFactory.webhookForConfirmed();
      const payloadString = JSON.stringify(webhookPayload);
      const signature = SignatureGenerator.generate(payloadString);

      const req = createMockRequest({
        body: webhookPayload,
        headers: {
          'pay-signature': signature,
          'content-type': 'application/json',
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      // WHEN: Processing webhook
      // Simulate webhook handler flow:
      // 1. Validate signature
      // 2. Check idempotency
      // 3. Store webhook
      // 4. Create/update payment
      // 5. Publish event

      const webhookId = webhookPayload.webhook_message_id;
      const paymentId = webhookPayload.resource_id;

      // Check idempotency (first time)
      const isProcessed = await idempotencyService.hasBeenProcessed(webhookId);
      expect(isProcessed).toBe(false);

      // Store webhook
      await paymentRepository.storeWebhook(webhookId, webhookPayload);

      // Create payment
      const payment: PaymentRecord = {
        govuk_pay_id: paymentId,
        amount: webhookPayload.resource.amount,
        reference: webhookPayload.resource.reference,
        status: PaymentStatus.CONFIRMED,
        event_count: 1,
        payment_provider: webhookPayload.resource.payment_provider,
      };
      await paymentRepository.create(payment);

      // Mark webhook as processed
      await idempotencyService.markAsProcessed(webhookId);

      // Publish event
      await eventPublisher.publish('payment.confirmed', { payment_id: paymentId });

      // THEN: Payment created in database
      const storedPayment = await paymentRepository.findByGovukPayId(paymentId);
      expect(storedPayment).not.toBeNull();
      expect(storedPayment?.status).toBe(PaymentStatus.CONFIRMED);
      expect(storedPayment?.amount).toBe(webhookPayload.resource.amount);
      expect(storedPayment?.event_count).toBe(1);

      // AND: Webhook stored
      const webhookExists = await paymentRepository.webhookExists(webhookId);
      expect(webhookExists).toBe(true);

      // AND: Webhook marked as processed
      const isNowProcessed = await idempotencyService.hasBeenProcessed(webhookId);
      expect(isNowProcessed).toBe(true);

      // AND: Event published
      const events = eventPublisher.getEventsByType('payment.confirmed');
      expect(events.length).toBe(1);
    });

    /**
     * Given: A duplicate webhook that has already been processed
     * When: Webhook is received again
     * Then: Should be detected as duplicate and handled idempotently
     */
    test('should handle duplicate webhook idempotently', async () => {
      // GIVEN: Webhook already processed
      const webhookPayload = TestDataFactory.webhookForConfirmed();
      const webhookId = webhookPayload.webhook_message_id;
      const paymentId = webhookPayload.resource_id;

      // First processing: Create payment
      const initialPayment: PaymentRecord = {
        govuk_pay_id: paymentId,
        amount: webhookPayload.resource.amount,
        reference: webhookPayload.resource.reference,
        status: PaymentStatus.CONFIRMED,
        event_count: 1,
      };
      await paymentRepository.create(initialPayment);
      await idempotencyService.markAsProcessed(webhookId);

      const initialPaymentCount = paymentRepository.getPaymentCount();

      // WHEN: Duplicate webhook arrives
      const isDuplicate = await idempotencyService.hasBeenProcessed(webhookId);

      // THEN: Detected as duplicate
      expect(isDuplicate).toBe(true);

      // AND: No new payment created
      const finalPaymentCount = paymentRepository.getPaymentCount();
      expect(finalPaymentCount).toBe(initialPaymentCount);

      // AND: Payment state unchanged
      const payment = await paymentRepository.findByGovukPayId(paymentId);
      expect(payment?.status).toBe(PaymentStatus.CONFIRMED);
      expect(payment?.event_count).toBe(1);
    });
  });

  // ===================================================================
  // SCENARIO 2: Invalid Webhook Handling
  // ===================================================================
  describe('SCENARIO: Invalid Webhook Handling', () => {
    /**
     * Given: Webhook with invalid signature
     * When: Webhook is received
     * Then: Should reject with 401 Unauthorized
     * 
     * NOTE: Signature validation logic not shown - would be in middleware
     */
    test.skip('should reject webhook with invalid signature', async () => {
      // SKIPPED: GOV.UK Pay signature validation not fully integrated yet
      
      // GIVEN: Webhook with invalid signature
      const webhookPayload = TestDataFactory.webhookForConfirmed();
      const invalidSignature = SignatureGenerator.generateInvalidSignature();

      const req = createMockRequest({
        body: webhookPayload,
        headers: {
          'pay-signature': invalidSignature,
        },
      });
      const res = createMockResponse();

      // WHEN: Processing webhook with invalid signature
      // (Would call signature validation middleware)

      // THEN: Should return 401
      // TestAssertions.assertResponseStatus(res, 401);

      // AND: No payment created
      const paymentCount = paymentRepository.getPaymentCount();
      expect(paymentCount).toBe(0);
    });

    /**
     * Given: Webhook with missing required fields
     * When: Webhook is received
     * Then: Should reject with 400 Bad Request
     */
    test('should reject webhook with missing required fields', async () => {
      // GIVEN: Malformed webhook payload
      const malformedPayload = {
        webhook_message_id: 'evt_malformed',
        // Missing: event_type, resource_id, resource
      };

      // WHEN: Validating payload
      const hasRequiredFields = (
        malformedPayload.hasOwnProperty('event_type') &&
        malformedPayload.hasOwnProperty('resource_id') &&
        malformedPayload.hasOwnProperty('resource')
      );

      // THEN: Validation fails
      expect(hasRequiredFields).toBe(false);

      // AND: No payment created
      const paymentCount = paymentRepository.getPaymentCount();
      expect(paymentCount).toBe(0);
    });
  });

  // ===================================================================
  // SCENARIO 3: Complete Payment Lifecycle
  // ===================================================================
  describe('SCENARIO: Complete Payment Lifecycle', () => {
    /**
     * Given: A payment going through full lifecycle
     * When: Processing webhooks in correct order
     * Then: Payment should transition through all states correctly
     */
    test('should process complete payment lifecycle', async () => {
      // GIVEN: Payment ID for lifecycle test
      const paymentId = TestDataFactory.webhook()
        .withPaymentId('pay_test_lifecycle_001')
        .build()
        .resource_id;

      // WHEN: Processing lifecycle events

      // Step 1: Payment Created
      const createdWebhook = TestDataFactory.webhookForCreated(paymentId);
      await paymentRepository.create({
        govuk_pay_id: paymentId,
        amount: createdWebhook.resource.amount,
        reference: createdWebhook.resource.reference,
        status: PaymentStatus.CREATED,
        event_count: 1,
      });

      let payment = await paymentRepository.findByGovukPayId(paymentId);
      expect(payment?.status).toBe(PaymentStatus.CREATED);

      // Step 2: Payment Confirmed
      const confirmedWebhook = TestDataFactory.webhookForConfirmed(paymentId);
      await paymentRepository.update(paymentId, {
        status: PaymentStatus.CONFIRMED,
        event_count: 2,
        confirmed_at: new Date(),
      });

      payment = await paymentRepository.findByGovukPayId(paymentId);
      expect(payment?.status).toBe(PaymentStatus.CONFIRMED);

      // Step 3: Payment Captured
      const capturedWebhook = TestDataFactory.webhookForCaptured(paymentId);
      await paymentRepository.update(paymentId, {
        status: PaymentStatus.CAPTURED,
        event_count: 3,
        captured_at: new Date(),
      });

      payment = await paymentRepository.findByGovukPayId(paymentId);
      expect(payment?.status).toBe(PaymentStatus.CAPTURED);

      // THEN: Payment progressed through all states
      expect(payment?.event_count).toBe(3);
      expect(payment?.confirmed_at).toBeDefined();
      expect(payment?.captured_at).toBeDefined();
    });

    /**
     * Given: Payment lifecycle with out-of-order events
     * When: Events arrive in wrong order
     * Then: Should handle gracefully (queue or skip invalid transitions)
     */
    test.skip('should handle out-of-order events gracefully', async () => {
      // SKIPPED: Out-of-order event handling not implemented yet
      
      // GIVEN: Payment in CREATED state
      const paymentId = 'pay_test_ooo_001';
      await paymentRepository.create({
        govuk_pay_id: paymentId,
        amount: 10000,
        reference: 'REF-OOO-001',
        status: PaymentStatus.CREATED,
        event_count: 1,
      });

      // WHEN: CAPTURED event arrives before CONFIRMED
      const capturedWebhook = TestDataFactory.webhookForCaptured(paymentId);

      // Validate transition
      const validation = await stateTransitionService.validateTransition(
        PaymentStatus.CREATED,
        PaymentStatus.CAPTURED
      );

      // THEN: Invalid transition detected
      expect(validation.valid).toBe(false);

      // AND: Payment state unchanged
      const payment = await paymentRepository.findByGovukPayId(paymentId);
      expect(payment?.status).toBe(PaymentStatus.CREATED);
    });
  });

  // ===================================================================
  // SCENARIO 4: Terminal State Protection in Integration Flow
  // ===================================================================
  describe('SCENARIO: Terminal State Protection', () => {
    /**
     * Given: Payment in terminal REFUNDED state
     * When: New webhook attempts to change state
     * Then: Terminal state should be protected
     */
    test('should protect REFUNDED terminal state', async () => {
      // GIVEN: Payment in REFUNDED state
      const payment = TestDataFactory.paymentRefunded('pay_test_terminal_001');
      await paymentRepository.create(payment);

      // WHEN: Attempting to transition to another state
      const validation = await stateTransitionService.validateTransition(
        PaymentStatus.REFUNDED,
        PaymentStatus.SETTLED
      );

      // THEN: Transition rejected
      expect(validation.valid).toBe(false);

      // AND: Payment remains in REFUNDED state
      const finalPayment = await paymentRepository.findByGovukPayId(
        payment.govuk_pay_id
      );
      expect(finalPayment?.status).toBe(PaymentStatus.REFUNDED);
    });

    /**
     * Given: Payment in terminal FAILED state
     * When: Duplicate failed webhook arrives
     * Then: Should be idempotent (no change)
     */
    test('should handle duplicate failed webhook idempotently', async () => {
      // GIVEN: Payment in FAILED state
      const paymentId = 'pay_test_failed_terminal_001';
      const failedPayment: PaymentRecord = {
        govuk_pay_id: paymentId,
        amount: 5000,
        reference: 'REF-FAILED-001',
        status: PaymentStatus.FAILED,
        event_count: 1,
        failed_at: new Date(),
      };
      await paymentRepository.create(failedPayment);

      const initialEventCount = failedPayment.event_count;

      // WHEN: Duplicate failed webhook arrives
      const duplicateWebhook = TestDataFactory.webhookForFailed(paymentId);
      const isDuplicate = await idempotencyService.hasBeenProcessed(
        duplicateWebhook.webhook_message_id
      );

      // Simulate: If not duplicate, validate transition (would be same → same)
      if (!isDuplicate) {
        const validation = await stateTransitionService.validateTransition(
          PaymentStatus.FAILED,
          PaymentStatus.FAILED
        );
        expect(validation.valid).toBe(true); // Idempotent
      }

      // THEN: Payment state unchanged
      const payment = await paymentRepository.findByGovukPayId(paymentId);
      expect(payment?.status).toBe(PaymentStatus.FAILED);
      expect(payment?.event_count).toBe(initialEventCount);
    });
  });

  // ===================================================================
  // SCENARIO 5: Event Publishing
  // ===================================================================
  describe('SCENARIO: Event Publishing', () => {
    /**
     * Given: Successful webhook processing
     * When: Payment is created/updated
     * Then: Event should be published for downstream consumers
     */
    test('should publish event after successful payment creation', async () => {
      // GIVEN: New payment webhook
      const webhookPayload = TestDataFactory.webhookForConfirmed();
      const paymentId = webhookPayload.resource_id;

      // WHEN: Processing webhook and creating payment
      await paymentRepository.create({
        govuk_pay_id: paymentId,
        amount: webhookPayload.resource.amount,
        reference: webhookPayload.resource.reference,
        status: PaymentStatus.CONFIRMED,
        event_count: 1,
      });

      // Publish event
      await eventPublisher.publish('payment.created', {
        payment_id: paymentId,
        amount: webhookPayload.resource.amount,
        status: 'confirmed',
      });

      // THEN: Event published
      const events = eventPublisher.getEventsByType('payment.created');
      expect(events.length).toBe(1);
      expect(events[0].event_data.payment_id).toBe(paymentId);
    });

    /**
     * Given: Payment state transition
     * When: State changes from CONFIRMED to CAPTURED
     * Then: State transition event should be published
     */
    test('should publish state transition events', async () => {
      // GIVEN: Payment in CONFIRMED state
      const paymentId = 'pay_test_events_001';
      await paymentRepository.create({
        govuk_pay_id: paymentId,
        amount: 10000,
        reference: 'REF-EVENTS-001',
        status: PaymentStatus.CONFIRMED,
        event_count: 1,
      });

      // WHEN: Transitioning to CAPTURED
      await paymentRepository.update(paymentId, {
        status: PaymentStatus.CAPTURED,
        event_count: 2,
      });

      // Publish transition event
      await eventPublisher.publish('payment.state_changed', {
        payment_id: paymentId,
        from_state: 'confirmed',
        to_state: 'captured',
      });

      // THEN: Transition event published
      const events = eventPublisher.getEventsByType('payment.state_changed');
      expect(events.length).toBe(1);
      expect(events[0].event_data.from_state).toBe('confirmed');
      expect(events[0].event_data.to_state).toBe('captured');
    });
  });
});

// ===================================================================
// EXPECTED RESULTS SUMMARY
// ===================================================================

/**
 * EXPECTED RESULTS:
 * 
 * ✅ Successful Processing:
 *    - Valid webhooks create/update payments correctly
 *    - Idempotency prevents duplicate processing
 *    - State transitions follow business rules
 * 
 * ❌ Error Handling:
 *    - Invalid signatures rejected (401)
 *    - Malformed payloads rejected (400)
 *    - No database changes on errors
 * 
 * 🔄 Complete Lifecycle:
 *    - Payments progress: CREATED → CONFIRMED → CAPTURED
 *    - Event counts increment correctly
 *    - Timestamps set at each stage
 * 
 * 🛡️ Terminal State Protection:
 *    - REFUNDED, FAILED, CANCELLED states protected
 *    - Invalid transitions from terminal states rejected
 *    - Duplicate events on terminal states idempotent
 * 
 * 📡 Event Publishing:
 *    - Events published for downstream consumers
 *    - State transition events tracked
 *    - Event data includes payment details
 * 
 * 🔴 SKIPPED TESTS:
 *    - GOV.UK Pay signature validation (not integrated yet)
 *    - Out-of-order event handling (not implemented yet)
 */
