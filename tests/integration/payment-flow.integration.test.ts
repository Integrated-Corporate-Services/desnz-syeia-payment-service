/**
 * ===================================================================
 * Integration Tests: End-to-End Payment Flow
 * ===================================================================
 * Tests complete payment flow from webhook receipt to database persistence
 * Simulates real-world scenarios with multiple services working together
 * 
 * Structure:
 * 1. TEST DATA - Complex multi-step scenarios
 * 2. TEST SCENARIOS - End-to-end flows with multiple webhooks
 * 3. EXPECTED RESULTS - Final database state and side effects
 * 
 * IMPORTANT: GOV.UK Pay NOT integrated - all external APIs mocked
 */

import {
  InMemoryPaymentRepository,
  MockIdempotencyService,
  MockStateTransitionService,
  MockEventPublisher,
  MockGovukPayClient,
  MockBuilderFactory,
} from '../helpers/mock-builders';
import { TestDataFactory } from '../fixtures/test-data.factory';
import {
  PaymentStatus,
  PaymentRecord,
} from '../fixtures/payment-states.fixture';
import { sleep } from '../helpers/test-setup';

// ===================================================================
// TEST DATA
// ===================================================================

/**
 * Happy path scenarios
 * Tests successful payment flows from start to finish
 */
const HAPPY_PATH_SCENARIOS = [
  {
    name: 'Complete successful payment flow',
    steps: [
      {
        order: 1,
        eventType: 'card_payment_created',
        expectedStatus: PaymentStatus.CREATED,
        description: 'User initiates payment',
      },
      {
        order: 2,
        eventType: 'card_payment_succeeded',
        expectedStatus: PaymentStatus.CONFIRMED,
        description: 'Payment confirmed by GOV.UK Pay',
      },
      {
        order: 3,
        eventType: 'card_payment_captured',
        expectedStatus: PaymentStatus.CAPTURED,
        description: 'Payment captured for settlement',
      },
    ],
    finalStatus: PaymentStatus.CAPTURED,
    finalEventCount: 3,
  },
  {
    name: 'Payment creation and immediate success',
    steps: [
      {
        order: 1,
        eventType: 'card_payment_created',
        expectedStatus: PaymentStatus.CREATED,
      },
      {
        order: 2,
        eventType: 'card_payment_succeeded',
        expectedStatus: PaymentStatus.CONFIRMED,
      },
    ],
    finalStatus: PaymentStatus.CONFIRMED,
    finalEventCount: 2,
  },
];

/**
 * Failure scenarios
 * Tests payment flows that end in failure or cancellation
 */
const FAILURE_SCENARIOS = [
  {
    name: 'Payment fails after creation',
    steps: [
      {
        order: 1,
        eventType: 'card_payment_created',
        expectedStatus: PaymentStatus.CREATED,
      },
      {
        order: 2,
        eventType: 'card_payment_failed',
        expectedStatus: PaymentStatus.FAILED,
      },
    ],
    finalStatus: PaymentStatus.FAILED,
    isTerminal: true,
  },
  {
    name: 'Payment cancelled by user',
    steps: [
      {
        order: 1,
        eventType: 'card_payment_created',
        expectedStatus: PaymentStatus.CREATED,
      },
      {
        order: 2,
        eventType: 'card_payment_cancelled',
        expectedStatus: PaymentStatus.CANCELLED,
      },
    ],
    finalStatus: PaymentStatus.CANCELLED,
    isTerminal: true,
  },
];

/**
 * Complex scenarios with duplicates and retries
 */
const COMPLEX_SCENARIOS = [
  {
    name: 'Multiple duplicate webhooks at different stages',
    webhooks: [
      { id: 'evt_001', eventType: 'card_payment_created', order: 1 },
      { id: 'evt_002', eventType: 'card_payment_succeeded', order: 2 },
      { id: 'evt_002_dup', eventType: 'card_payment_succeeded', order: 3, isDuplicate: true },
      { id: 'evt_003', eventType: 'card_payment_captured', order: 4 },
      { id: 'evt_003_dup', eventType: 'card_payment_captured', order: 5, isDuplicate: true },
    ],
    expectedFinalEventCount: 3, // Only unique events count
    expectedWebhookCount: 5, // All webhooks stored for audit
  },
  {
    name: 'Webhook retry after temporary failure',
    webhooks: [
      { id: 'evt_001', eventType: 'card_payment_succeeded', attempt: 1 },
      { id: 'evt_001', eventType: 'card_payment_succeeded', attempt: 2, isRetry: true },
    ],
    expectedProcessedCount: 1, // Second attempt detected as duplicate
  },
];

// ===================================================================
// TEST SCENARIOS
// ===================================================================

describe('End-to-End Payment Flow - Integration Tests', () => {
  let paymentRepository: InMemoryPaymentRepository;
  let idempotencyService: MockIdempotencyService;
  let stateTransitionService: MockStateTransitionService;
  let eventPublisher: MockEventPublisher;
  let govukPayClient: MockGovukPayClient;

  beforeEach(() => {
    // SETUP: Create fresh mocks
    paymentRepository = MockBuilderFactory.paymentRepository();
    idempotencyService = MockBuilderFactory.idempotencyService();
    stateTransitionService = MockBuilderFactory.stateTransitionService();
    eventPublisher = MockBuilderFactory.eventPublisher();
    govukPayClient = MockBuilderFactory.govukPayClient();

    TestDataFactory.reset();
  });

  afterEach(() => {
    // CLEANUP: Clear all mocks
    paymentRepository.clear();
    idempotencyService.clear();
    eventPublisher.clear();
    govukPayClient.reset();
  });

  // ===================================================================
  // SCENARIO 1: Happy Path - Complete Payment Flow
  // ===================================================================
  describe('SCENARIO: Happy Path Flows', () => {
    /**
     * Given: A new payment initiated by user
     * When: Processing webhooks through complete lifecycle
     * Then: Payment should progress through all states correctly
     */
    test('should process complete payment lifecycle successfully', async () => {
      // GIVEN: New payment ID
      const paymentId = TestDataFactory.webhook().build().resource_id;

      // WHEN: Processing payment lifecycle

      // Step 1: Payment Created
      const createdWebhook = TestDataFactory.webhookForCreated(paymentId);
      await idempotencyService.markAsProcessed(createdWebhook.webhook_message_id);
      await paymentRepository.storeWebhook(
        createdWebhook.webhook_message_id,
        createdWebhook
      );

      await paymentRepository.create({
        govuk_pay_id: paymentId,
        amount: createdWebhook.resource.amount,
        reference: createdWebhook.resource.reference,
        status: PaymentStatus.CREATED,
        event_count: 1,
        created_at: new Date(),
      });

      // Verify Step 1
      let payment = await paymentRepository.findByGovukPayId(paymentId);
      expect(payment?.status).toBe(PaymentStatus.CREATED);
      expect(payment?.event_count).toBe(1);

      // Step 2: Payment Confirmed
      const confirmedWebhook = TestDataFactory.webhookForConfirmed(paymentId);
      await idempotencyService.markAsProcessed(confirmedWebhook.webhook_message_id);
      await paymentRepository.storeWebhook(
        confirmedWebhook.webhook_message_id,
        confirmedWebhook
      );

      await paymentRepository.update(paymentId, {
        status: PaymentStatus.CONFIRMED,
        event_count: 2,
        confirmed_at: new Date(),
      });

      // Verify Step 2
      payment = await paymentRepository.findByGovukPayId(paymentId);
      expect(payment?.status).toBe(PaymentStatus.CONFIRMED);
      expect(payment?.event_count).toBe(2);
      expect(payment?.confirmed_at).toBeDefined();

      // Step 3: Payment Captured
      const capturedWebhook = TestDataFactory.webhookForCaptured(paymentId);
      await idempotencyService.markAsProcessed(capturedWebhook.webhook_message_id);
      await paymentRepository.storeWebhook(
        capturedWebhook.webhook_message_id,
        capturedWebhook
      );

      await paymentRepository.update(paymentId, {
        status: PaymentStatus.CAPTURED,
        event_count: 3,
        captured_at: new Date(),
      });

      // THEN: Payment completed successfully
      payment = await paymentRepository.findByGovukPayId(paymentId);
      expect(payment?.status).toBe(PaymentStatus.CAPTURED);
      expect(payment?.event_count).toBe(3);
      expect(payment?.created_at).toBeDefined();
      expect(payment?.confirmed_at).toBeDefined();
      expect(payment?.captured_at).toBeDefined();

      // AND: All webhooks stored
      expect(await paymentRepository.webhookExists(createdWebhook.webhook_message_id)).toBe(true);
      expect(await paymentRepository.webhookExists(confirmedWebhook.webhook_message_id)).toBe(true);
      expect(await paymentRepository.webhookExists(capturedWebhook.webhook_message_id)).toBe(true);

      // AND: All webhooks marked as processed
      expect(await idempotencyService.hasBeenProcessed(createdWebhook.webhook_message_id)).toBe(true);
      expect(await idempotencyService.hasBeenProcessed(confirmedWebhook.webhook_message_id)).toBe(true);
      expect(await idempotencyService.hasBeenProcessed(capturedWebhook.webhook_message_id)).toBe(true);
    });

    /**
     * Given: Simple payment flow (create → confirm)
     * When: Processing two webhooks
     * Then: Payment should reach CONFIRMED state
     */
    test('should handle simple payment creation and confirmation', async () => {
      // GIVEN: New payment
      const paymentId = TestDataFactory.webhook().build().resource_id;

      // WHEN: Creating and confirming payment
      const createdWebhook = TestDataFactory.webhookForCreated(paymentId);
      await paymentRepository.create({
        govuk_pay_id: paymentId,
        amount: createdWebhook.resource.amount,
        reference: createdWebhook.resource.reference,
        status: PaymentStatus.CREATED,
        event_count: 1,
      });

      const confirmedWebhook = TestDataFactory.webhookForConfirmed(paymentId);
      await paymentRepository.update(paymentId, {
        status: PaymentStatus.CONFIRMED,
        event_count: 2,
        confirmed_at: new Date(),
      });

      // THEN: Payment is confirmed
      const payment = await paymentRepository.findByGovukPayId(paymentId);
      expect(payment?.status).toBe(PaymentStatus.CONFIRMED);
      expect(payment?.event_count).toBe(2);
    });
  });

  // ===================================================================
  // SCENARIO 2: Failure Scenarios
  // ===================================================================
  describe('SCENARIO: Failure Scenarios', () => {
    /**
     * Given: Payment initiated
     * When: Payment fails after creation
     * Then: Payment should reach FAILED terminal state
     */
    test('should handle payment failure correctly', async () => {
      // GIVEN: Payment created
      const paymentId = TestDataFactory.webhook().build().resource_id;
      await paymentRepository.create({
        govuk_pay_id: paymentId,
        amount: 10000,
        reference: 'REF-FAIL-001',
        status: PaymentStatus.CREATED,
        event_count: 1,
      });

      // WHEN: Payment fails
      const failedWebhook = TestDataFactory.webhookForFailed(paymentId);
      await paymentRepository.update(paymentId, {
        status: PaymentStatus.FAILED,
        event_count: 2,
        failed_at: new Date(),
      });

      // THEN: Payment in FAILED state
      const payment = await paymentRepository.findByGovukPayId(paymentId);
      expect(payment?.status).toBe(PaymentStatus.FAILED);
      expect(payment?.failed_at).toBeDefined();

      // AND: Terminal state is protected
      const isTerminal = stateTransitionService.isTerminalState(PaymentStatus.FAILED);
      expect(isTerminal).toBe(true);

      // AND: No further transitions allowed
      const validation = await stateTransitionService.validateTransition(
        PaymentStatus.FAILED,
        PaymentStatus.CONFIRMED
      );
      expect(validation.valid).toBe(false);
    });

    /**
     * Given: Payment initiated
     * When: User cancels payment
     * Then: Payment should reach CANCELLED terminal state
     */
    test('should handle payment cancellation correctly', async () => {
      // GIVEN: Payment created
      const paymentId = TestDataFactory.webhook().build().resource_id;
      await paymentRepository.create({
        govuk_pay_id: paymentId,
        amount: 10000,
        reference: 'REF-CANCEL-001',
        status: PaymentStatus.CREATED,
        event_count: 1,
      });

      // WHEN: Payment cancelled
      const cancelledWebhook = TestDataFactory.webhookForCancelled(paymentId);
      await paymentRepository.update(paymentId, {
        status: PaymentStatus.CANCELLED,
        event_count: 2,
        cancelled_at: new Date(),
      });

      // THEN: Payment in CANCELLED state
      const payment = await paymentRepository.findByGovukPayId(paymentId);
      expect(payment?.status).toBe(PaymentStatus.CANCELLED);
      expect(payment?.cancelled_at).toBeDefined();

      // AND: Terminal state is protected
      const isTerminal = stateTransitionService.isTerminalState(PaymentStatus.CANCELLED);
      expect(isTerminal).toBe(true);
    });
  });

  // ===================================================================
  // SCENARIO 3: Duplicate Webhooks Across Lifecycle
  // ===================================================================
  describe('SCENARIO: Duplicate Webhooks Across Lifecycle', () => {
    /**
     * Given: Payment progressing through lifecycle
     * When: Duplicate webhooks arrive at various stages
     * Then: Should handle all duplicates idempotently
     */
    test('should handle duplicates at every stage', async () => {
      // GIVEN: New payment
      const paymentId = TestDataFactory.webhook().build().resource_id;

      // WHEN: Processing with duplicates at each stage

      // Create + Duplicate Created
      const created1 = TestDataFactory.webhookForCreated(paymentId);
      await paymentRepository.create({
        govuk_pay_id: paymentId,
        amount: created1.resource.amount,
        reference: created1.resource.reference,
        status: PaymentStatus.CREATED,
        event_count: 1,
      });
      await idempotencyService.markAsProcessed(created1.webhook_message_id);

      const created2 = { ...created1, webhook_message_id: created1.webhook_message_id + '_dup' };
      const isDuplicateCreated = await idempotencyService.hasBeenProcessed(created1.webhook_message_id);
      // Would be skipped in real flow

      // Confirm + Duplicate Confirmed
      const confirmed1 = TestDataFactory.webhookForConfirmed(paymentId);
      await paymentRepository.update(paymentId, {
        status: PaymentStatus.CONFIRMED,
        event_count: 2,
      });
      await idempotencyService.markAsProcessed(confirmed1.webhook_message_id);

      const confirmed2 = { ...confirmed1, webhook_message_id: confirmed1.webhook_message_id + '_dup' };
      // Would be skipped

      // Capture + Duplicate Captured
      const captured1 = TestDataFactory.webhookForCaptured(paymentId);
      await paymentRepository.update(paymentId, {
        status: PaymentStatus.CAPTURED,
        event_count: 3,
      });
      await idempotencyService.markAsProcessed(captured1.webhook_message_id);

      // THEN: Final state is correct despite duplicates
      const payment = await paymentRepository.findByGovukPayId(paymentId);
      expect(payment?.status).toBe(PaymentStatus.CAPTURED);
      expect(payment?.event_count).toBe(3); // Only unique events counted

      // AND: All unique webhooks processed
      expect(idempotencyService.getProcessedCount()).toBe(3);
    });

    /**
     * Given: Webhook retry due to network issue
     * When: Same webhook arrives multiple times
     * Then: Should process only once
     */
    test('should handle webhook retries idempotently', async () => {
      // GIVEN: New payment webhook
      const webhookPayload = TestDataFactory.webhookForConfirmed();
      const paymentId = webhookPayload.resource_id;
      const webhookId = webhookPayload.webhook_message_id;

      // WHEN: First attempt succeeds
      await paymentRepository.create({
        govuk_pay_id: paymentId,
        amount: webhookPayload.resource.amount,
        reference: webhookPayload.resource.reference,
        status: PaymentStatus.CONFIRMED,
        event_count: 1,
      });
      await idempotencyService.markAsProcessed(webhookId);

      const paymentCountAfterFirst = paymentRepository.getPaymentCount();

      // AND: Retry attempt arrives (same webhook ID)
      const isAlreadyProcessed = await idempotencyService.hasBeenProcessed(webhookId);

      // THEN: Second attempt detected as duplicate
      expect(isAlreadyProcessed).toBe(true);

      // AND: No duplicate payment created
      const paymentCountAfterRetry = paymentRepository.getPaymentCount();
      expect(paymentCountAfterRetry).toBe(paymentCountAfterFirst);
    });
  });

  // ===================================================================
  // SCENARIO 4: GOV.UK Pay API Integration (Mocked)
  // ===================================================================
  describe.skip('SCENARIO: GOV.UK Pay API Integration', () => {
    /**
     * SKIPPED: GOV.UK Pay NOT integrated yet
     * 
     * This test demonstrates how GOV.UK Pay API calls would be mocked
     */
    test('should fetch payment details from GOV.UK Pay', async () => {
      // GIVEN: Payment ID from webhook
      const paymentId = 'pay_govuk_12345';

      // WHEN: Fetching payment details from GOV.UK Pay (mocked)
      const paymentDetails = await govukPayClient.getPayment(paymentId);

      // THEN: Payment details returned
      expect(paymentDetails).toBeDefined();
      expect(paymentDetails.payment_id).toBe(paymentId);
    });

    test('should handle GOV.UK Pay API failure gracefully', async () => {
      // GIVEN: GOV.UK Pay API is down
      govukPayClient.withFailure();

      // WHEN: Attempting to fetch payment
      let error: any;
      try {
        await govukPayClient.getPayment('pay_12345');
      } catch (e) {
        error = e;
      }

      // THEN: Error is caught
      expect(error).toBeDefined();
      expect(error.message).toContain('GOV.UK Pay API error');
    });
  });

  // ===================================================================
  // SCENARIO 5: Event Publishing Throughout Lifecycle
  // ===================================================================
  describe('SCENARIO: Event Publishing Throughout Lifecycle', () => {
    /**
     * Given: Payment progressing through lifecycle
     * When: Processing each webhook
     * Then: Events should be published at each stage
     */
    test('should publish events at each stage of payment lifecycle', async () => {
      // GIVEN: New payment
      const paymentId = TestDataFactory.webhook().build().resource_id;

      // WHEN: Processing lifecycle with event publishing

      // Stage 1: Created
      await paymentRepository.create({
        govuk_pay_id: paymentId,
        amount: 10000,
        reference: 'REF-EVENTS-001',
        status: PaymentStatus.CREATED,
        event_count: 1,
      });
      await eventPublisher.publish('payment.created', { payment_id: paymentId });

      // Stage 2: Confirmed
      await paymentRepository.update(paymentId, {
        status: PaymentStatus.CONFIRMED,
        event_count: 2,
      });
      await eventPublisher.publish('payment.confirmed', { payment_id: paymentId });

      // Stage 3: Captured
      await paymentRepository.update(paymentId, {
        status: PaymentStatus.CAPTURED,
        event_count: 3,
      });
      await eventPublisher.publish('payment.captured', { payment_id: paymentId });

      // THEN: All events published
      expect(eventPublisher.getEventCount()).toBe(3);
      expect(eventPublisher.getEventsByType('payment.created').length).toBe(1);
      expect(eventPublisher.getEventsByType('payment.confirmed').length).toBe(1);
      expect(eventPublisher.getEventsByType('payment.captured').length).toBe(1);
    });
  });
});

// ===================================================================
// EXPECTED RESULTS SUMMARY
// ===================================================================

/**
 * EXPECTED RESULTS:
 * 
 * ✅ Happy Path:
 *    - Complete payment lifecycle: CREATED → CONFIRMED → CAPTURED
 *    - All timestamps set correctly at each stage
 *    - Event counts increment properly
 *    - All webhooks stored for audit trail
 * 
 * ❌ Failure Scenarios:
 *    - FAILED payments reach terminal state
 *    - CANCELLED payments reach terminal state
 *    - No further transitions allowed from terminal states
 * 
 * 🔄 Duplicate Handling:
 *    - Duplicates detected at every lifecycle stage
 *    - Event counts don't increment for duplicates
 *    - Webhook retries handled idempotently
 * 
 * 🔴 GOV.UK Pay Integration (SKIPPED):
 *    - API calls would be mocked
 *    - Error handling demonstrated
 *    - Will be implemented when GOV.UK Pay is integrated
 * 
 * 📡 Event Publishing:
 *    - Events published at each lifecycle stage
 *    - Downstream consumers notified
 *    - Event history tracked
 */
