/**
 * ===================================================================
 * Test Data Factory
 * ===================================================================
 * Provides builder functions for creating test data dynamically
 * Reusable across unit and integration tests
 * 
 * Usage:
 *   const webhook = TestDataFactory.webhook()
 *     .withEventType('card_payment_succeeded')
 *     .withPaymentId('pay_test_123')
 *     .withAmount(5000)
 *     .build();
 * 
 * IMPORTANT: All GOV.UK Pay data is mocked - no real API calls
 */

import crypto from 'crypto';
import {
  WebhookPayload,
  PaymentResource,
  PaymentState,
  BASE_WEBHOOK_PAYLOAD,
} from './webhook-payloads.fixture';
import {
  PaymentRecord,
  PaymentStatus,
} from './payment-states.fixture';

/**
 * Generate unique test IDs
 */
export class TestIdGenerator {
  private static counter = 0;

  static generatePaymentId(prefix = 'pay_test'): string {
    this.counter++;
    return `${prefix}_${Date.now()}_${this.counter}`;
  }

  static generateWebhookId(prefix = 'evt_test'): string {
    this.counter++;
    return `${prefix}_${Date.now()}_${this.counter}`;
  }

  static generateReference(prefix = 'REF'): string {
    this.counter++;
    return `${prefix}-${Date.now()}-${this.counter}`;
  }

  static reset(): void {
    this.counter = 0;
  }
}

/**
 * Webhook Payload Builder
 */
export class WebhookPayloadBuilder {
  private payload: Partial<WebhookPayload>;

  constructor() {
    this.payload = {
      ...BASE_WEBHOOK_PAYLOAD,
      webhook_message_id: TestIdGenerator.generateWebhookId(),
      event_type: 'card_payment_succeeded',
      created_date: new Date().toISOString(),
      resource_id: TestIdGenerator.generatePaymentId(),
      resource: {
        payment_id: TestIdGenerator.generatePaymentId(),
        payment_provider: 'worldpay',
        amount: 10000,
        reference: TestIdGenerator.generateReference(),
        state: {
          status: 'success',
          finished: true,
        },
        created_date: new Date().toISOString(),
      },
    };
  }

  withWebhookId(id: string): this {
    this.payload.webhook_message_id = id;
    return this;
  }

  withEventType(eventType: string): this {
    this.payload.event_type = eventType;
    return this;
  }

  withPaymentId(paymentId: string): this {
    this.payload.resource_id = paymentId;
    if (this.payload.resource) {
      this.payload.resource.payment_id = paymentId;
    }
    return this;
  }

  withAmount(amount: number): this {
    if (this.payload.resource) {
      this.payload.resource.amount = amount;
    }
    return this;
  }

  withReference(reference: string): this {
    if (this.payload.resource) {
      this.payload.resource.reference = reference;
    }
    return this;
  }

  withDescription(description: string): this {
    if (this.payload.resource) {
      this.payload.resource.description = description;
    }
    return this;
  }

  withState(status: PaymentState['status'], finished: boolean = true): this {
    if (this.payload.resource) {
      this.payload.resource.state = { status, finished };
    }
    return this;
  }

  withCreatedDate(date: Date | string): this {
    const isoDate = typeof date === 'string' ? date : date.toISOString();
    this.payload.created_date = isoDate;
    return this;
  }

  withCardDetails(
    cardBrand: string = 'Visa',
    lastFour: string = '4242',
    cardholderName: string = 'Test User'
  ): this {
    if (this.payload.resource) {
      this.payload.resource.card_details = {
        card_brand: cardBrand,
        card_type: 'debit',
        last_digits_card_number: lastFour,
        first_digits_card_number: '424242',
        expiry_date: '12/25',
        cardholder_name: cardholderName,
      };
    }
    return this;
  }

  withSettlementSummary(capturedDate: string): this {
    if (this.payload.resource) {
      this.payload.resource.settlement_summary = {
        capture_submit_time: new Date().toISOString(),
        captured_date: capturedDate,
      };
    }
    return this;
  }

  build(): WebhookPayload {
    return this.payload as WebhookPayload;
  }

  buildAsString(): string {
    return JSON.stringify(this.build());
  }
}

/**
 * Payment Record Builder
 */
export class PaymentRecordBuilder {
  private record: Partial<PaymentRecord>;

  constructor() {
    this.record = {
      govuk_pay_id: TestIdGenerator.generatePaymentId(),
      amount: 10000,
      reference: TestIdGenerator.generateReference(),
      status: PaymentStatus.CREATED,
      event_count: 1,
      created_at: new Date(),
    };
  }

  withPaymentId(paymentId: string): this {
    this.record.govuk_pay_id = paymentId;
    return this;
  }

  withAmount(amount: number): this {
    this.record.amount = amount;
    return this;
  }

  withReference(reference: string): this {
    this.record.reference = reference;
    return this;
  }

  withDescription(description: string): this {
    this.record.description = description;
    return this;
  }

  withStatus(status: PaymentStatus): this {
    this.record.status = status;
    return this;
  }

  withEventCount(count: number): this {
    this.record.event_count = count;
    return this;
  }

  withPaymentProvider(provider: string): this {
    this.record.payment_provider = provider;
    return this;
  }

  withCardDetails(brand: string, lastFour: string, cardholderName: string): this {
    this.record.card_brand = brand;
    this.record.card_last_four = lastFour;
    this.record.cardholder_name = cardholderName;
    return this;
  }

  withCreatedAt(date: Date): this {
    this.record.created_at = date;
    return this;
  }

  withConfirmedAt(date: Date): this {
    this.record.confirmed_at = date;
    return this;
  }

  withCapturedAt(date: Date): this {
    this.record.captured_at = date;
    return this;
  }

  withSettledAt(date: Date): this {
    this.record.settled_at = date;
    return this;
  }

  withRefundedAt(date: Date): this {
    this.record.refunded_at = date;
    return this;
  }

  withFailedAt(date: Date): this {
    this.record.failed_at = date;
    return this;
  }

  withCancelledAt(date: Date): this {
    this.record.cancelled_at = date;
    return this;
  }

  withMetadata(metadata: Record<string, any>): this {
    this.record.metadata = metadata;
    return this;
  }

  build(): PaymentRecord {
    return this.record as PaymentRecord;
  }
}

/**
 * Webhook Signature Generator
 * Generates HMAC-SHA256 signatures for webhook payloads
 * 
 * IMPORTANT: Uses test signing key - NOT production key
 */
export class SignatureGenerator {
  static readonly TEST_SIGNING_KEY = 'test-signing-key-456';

  static generate(payload: string, secret: string = this.TEST_SIGNING_KEY): string {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  static generateInvalidSignature(): string {
    return 'invalid_signature_' + Math.random().toString(36).substring(7);
  }
}

/**
 * Test Data Factory - Main Export
 * Provides convenient factory methods
 */
export class TestDataFactory {
  /**
   * Create a webhook payload builder
   */
  static webhook(): WebhookPayloadBuilder {
    return new WebhookPayloadBuilder();
  }

  /**
   * Create a payment record builder
   */
  static payment(): PaymentRecordBuilder {
    return new PaymentRecordBuilder();
  }

  /**
   * Create a webhook for CREATED state
   */
  static webhookForCreated(paymentId?: string): WebhookPayload {
    return new WebhookPayloadBuilder()
      .withEventType('card_payment_created')
      .withPaymentId(paymentId || TestIdGenerator.generatePaymentId())
      .withState('created', false)
      .build();
  }

  /**
   * Create a webhook for CONFIRMED/SUCCESS state
   */
  static webhookForConfirmed(paymentId?: string): WebhookPayload {
    return new WebhookPayloadBuilder()
      .withEventType('card_payment_succeeded')
      .withPaymentId(paymentId || TestIdGenerator.generatePaymentId())
      .withState('success', true)
      .withCardDetails()
      .build();
  }

  /**
   * Create a webhook for CAPTURED state
   */
  static webhookForCaptured(paymentId?: string): WebhookPayload {
    return new WebhookPayloadBuilder()
      .withEventType('card_payment_captured')
      .withPaymentId(paymentId || TestIdGenerator.generatePaymentId())
      .withState('success', true)
      .withCardDetails()
      .withSettlementSummary(new Date().toISOString().split('T')[0])
      .build();
  }

  /**
   * Create a webhook for FAILED state
   */
  static webhookForFailed(paymentId?: string): WebhookPayload {
    return new WebhookPayloadBuilder()
      .withEventType('card_payment_failed')
      .withPaymentId(paymentId || TestIdGenerator.generatePaymentId())
      .withState('failed', true)
      .build();
  }

  /**
   * Create a webhook for CANCELLED state
   */
  static webhookForCancelled(paymentId?: string): WebhookPayload {
    return new WebhookPayloadBuilder()
      .withEventType('card_payment_cancelled')
      .withPaymentId(paymentId || TestIdGenerator.generatePaymentId())
      .withState('cancelled', true)
      .build();
  }

  /**
   * Create a payment in CREATED state
   */
  static paymentCreated(paymentId?: string): PaymentRecord {
    return new PaymentRecordBuilder()
      .withPaymentId(paymentId || TestIdGenerator.generatePaymentId())
      .withStatus(PaymentStatus.CREATED)
      .withEventCount(1)
      .build();
  }

  /**
   * Create a payment in CONFIRMED state
   */
  static paymentConfirmed(paymentId?: string): PaymentRecord {
    return new PaymentRecordBuilder()
      .withPaymentId(paymentId || TestIdGenerator.generatePaymentId())
      .withStatus(PaymentStatus.CONFIRMED)
      .withEventCount(2)
      .withCardDetails('Visa', '4242', 'Test User')
      .withConfirmedAt(new Date())
      .build();
  }

  /**
   * Create a payment in CAPTURED state
   */
  static paymentCaptured(paymentId?: string): PaymentRecord {
    return new PaymentRecordBuilder()
      .withPaymentId(paymentId || TestIdGenerator.generatePaymentId())
      .withStatus(PaymentStatus.CAPTURED)
      .withEventCount(3)
      .withCardDetails('Visa', '4242', 'Test User')
      .withConfirmedAt(new Date(Date.now() - 60000))
      .withCapturedAt(new Date())
      .build();
  }

  /**
   * Create a payment in REFUNDED state (terminal)
   */
  static paymentRefunded(paymentId?: string): PaymentRecord {
    return new PaymentRecordBuilder()
      .withPaymentId(paymentId || TestIdGenerator.generatePaymentId())
      .withStatus(PaymentStatus.REFUNDED)
      .withEventCount(5)
      .withCardDetails('Visa', '4242', 'Test User')
      .withConfirmedAt(new Date(Date.now() - 180000))
      .withCapturedAt(new Date(Date.now() - 120000))
      .withSettledAt(new Date(Date.now() - 60000))
      .withRefundedAt(new Date())
      .build();
  }

  /**
   * Reset ID generators (useful between tests)
   */
  static reset(): void {
    TestIdGenerator.reset();
  }
}
