/**
 * ===================================================================
 * Mock Builders
 * ===================================================================
 * Provides mock implementations of services, repositories, and dependencies
 * Used in integration tests to avoid real external dependencies
 * 
 * IMPORTANT: GOV.UK Pay is mocked - no real API calls
 */

import { PaymentRecord, PaymentStatus } from '../fixtures/payment-states.fixture';
import { WebhookPayload } from '../fixtures/webhook-payloads.fixture';

/**
 * In-Memory Payment Repository Mock
 * Simulates database operations without actual database
 */
export class InMemoryPaymentRepository {
  private payments: Map<string, PaymentRecord> = new Map();
  private webhooks: Map<string, any> = new Map();
  private events: any[] = [];

  /**
   * Find payment by GOV.UK Pay ID
   */
  async findByGovukPayId(govukPayId: string): Promise<PaymentRecord | null> {
    return this.payments.get(govukPayId) || null;
  }

  /**
   * Create a new payment
   */
  async create(payment: PaymentRecord): Promise<PaymentRecord> {
    const newPayment = {
      ...payment,
      id: this.payments.size + 1,
      created_at: payment.created_at || new Date(),
    };
    this.payments.set(payment.govuk_pay_id, newPayment);
    return newPayment;
  }

  /**
   * Update an existing payment
   */
  async update(govukPayId: string, updates: Partial<PaymentRecord>): Promise<PaymentRecord> {
    const existing = this.payments.get(govukPayId);
    if (!existing) {
      throw new Error(`Payment not found: ${govukPayId}`);
    }
    const updated = { ...existing, ...updates };
    this.payments.set(govukPayId, updated);
    return updated;
  }

  /**
   * Check if webhook has been processed
   */
  async webhookExists(webhookId: string): Promise<boolean> {
    return this.webhooks.has(webhookId);
  }

  /**
   * Store webhook record
   */
  async storeWebhook(webhookId: string, payload: any): Promise<void> {
    this.webhooks.set(webhookId, {
      webhook_id: webhookId,
      payload,
      received_at: new Date(),
    });
  }

  /**
   * Store payment event
   */
  async storeEvent(govukPayId: string, eventType: string, eventData: any): Promise<void> {
    this.events.push({
      govuk_pay_id: govukPayId,
      event_type: eventType,
      event_data: eventData,
      created_at: new Date(),
    });
  }

  /**
   * Get all events for a payment
   */
  async getEventsByPaymentId(govukPayId: string): Promise<any[]> {
    return this.events.filter((e) => e.govuk_pay_id === govukPayId);
  }

  /**
   * Clear all data (for test cleanup)
   */
  clear(): void {
    this.payments.clear();
    this.webhooks.clear();
    this.events = [];
  }

  /**
   * Get all payments (for testing)
   */
  getAllPayments(): PaymentRecord[] {
    return Array.from(this.payments.values());
  }

  /**
   * Get payment count (for testing)
   */
  getPaymentCount(): number {
    return this.payments.size;
  }
}

/**
 * Mock GOV.UK Pay API Client
 * Simulates GOV.UK Pay API responses without real API calls
 * 
 * NOTE: GOV.UK Pay NOT integrated yet - all methods return mocked data
 */
export class MockGovukPayClient {
  private shouldFail: boolean = false;
  private delayMs: number = 0;

  /**
   * Simulate API delay
   */
  withDelay(ms: number): this {
    this.delayMs = ms;
    return this;
  }

  /**
   * Simulate API failure
   */
  withFailure(): this {
    this.shouldFail = true;
    return this;
  }

  /**
   * Reset mock state
   */
  reset(): void {
    this.shouldFail = false;
    this.delayMs = 0;
  }

  /**
   * Mock: Get payment by ID
   * SKIPPED: GOV.UK Pay not integrated
   */
  async getPayment(paymentId: string): Promise<any> {
    if (this.delayMs > 0) {
      await this.sleep(this.delayMs);
    }

    if (this.shouldFail) {
      throw new Error('GOV.UK Pay API error (mocked)');
    }

    return {
      payment_id: paymentId,
      amount: 10000,
      state: { status: 'success', finished: true },
      reference: 'MOCK-REF-001',
      description: 'Mocked payment from GOV.UK Pay',
      created_date: new Date().toISOString(),
    };
  }

  /**
   * Mock: Create payment
   * SKIPPED: GOV.UK Pay not integrated
   */
  async createPayment(amount: number, reference: string): Promise<any> {
    if (this.delayMs > 0) {
      await this.sleep(this.delayMs);
    }

    if (this.shouldFail) {
      throw new Error('GOV.UK Pay API error (mocked)');
    }

    return {
      payment_id: `pay_mock_${Date.now()}`,
      amount,
      reference,
      state: { status: 'created', finished: false },
      created_date: new Date().toISOString(),
      _links: {
        next_url: { href: 'https://mock-govuk-pay.com/payments/12345' },
      },
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Mock Idempotency Service
 * Tracks processed webhook IDs to prevent duplicate processing
 */
export class MockIdempotencyService {
  private processedWebhooks: Set<string> = new Set();

  /**
   * Check if webhook has been processed
   */
  async hasBeenProcessed(webhookId: string): Promise<boolean> {
    return this.processedWebhooks.has(webhookId);
  }

  /**
   * Mark webhook as processed
   */
  async markAsProcessed(webhookId: string): Promise<void> {
    this.processedWebhooks.add(webhookId);
  }

  /**
   * Clear all processed webhooks (for test cleanup)
   */
  clear(): void {
    this.processedWebhooks.clear();
  }

  /**
   * Get count of processed webhooks (for testing)
   */
  getProcessedCount(): number {
    return this.processedWebhooks.size;
  }
}

/**
 * Mock State Transition Service
 * Validates payment state transitions
 */
export class MockStateTransitionService {
  /**
   * Validate state transition
   */
  async validateTransition(
    currentState: PaymentStatus,
    newState: PaymentStatus
  ): Promise<{ valid: boolean; reason?: string }> {
    // Same state is always valid (idempotent)
    if (currentState === newState) {
      return { valid: true };
    }

    // Define valid transitions
    const validTransitions: Record<PaymentStatus, PaymentStatus[]> = {
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
      [PaymentStatus.CAPTURED]: [PaymentStatus.SETTLED, PaymentStatus.REFUNDED],
      [PaymentStatus.SETTLED]: [PaymentStatus.REFUNDED],
      [PaymentStatus.REFUNDED]: [],
      [PaymentStatus.FAILED]: [],
      [PaymentStatus.CANCELLED]: [],
    };

    const allowedTransitions = validTransitions[currentState] || [];

    if (allowedTransitions.includes(newState)) {
      return { valid: true };
    }

    return {
      valid: false,
      reason: `Invalid transition from ${currentState} to ${newState}`,
    };
  }

  /**
   * Check if state is terminal
   */
  isTerminalState(state: PaymentStatus): boolean {
    return [
      PaymentStatus.REFUNDED,
      PaymentStatus.FAILED,
      PaymentStatus.CANCELLED,
    ].includes(state);
  }
}

/**
 * Mock Event Publisher
 * Simulates publishing events to message queue or event bus
 */
export class MockEventPublisher {
  private publishedEvents: any[] = [];

  /**
   * Publish an event
   */
  async publish(eventType: string, eventData: any): Promise<void> {
    this.publishedEvents.push({
      event_type: eventType,
      event_data: eventData,
      published_at: new Date(),
    });
  }

  /**
   * Get all published events
   */
  getPublishedEvents(): any[] {
    return this.publishedEvents;
  }

  /**
   * Get events by type
   */
  getEventsByType(eventType: string): any[] {
    return this.publishedEvents.filter((e) => e.event_type === eventType);
  }

  /**
   * Clear all events (for test cleanup)
   */
  clear(): void {
    this.publishedEvents = [];
  }

  /**
   * Get event count (for testing)
   */
  getEventCount(): number {
    return this.publishedEvents.length;
  }
}

/**
 * Mock Builder Factory
 * Provides convenient factory methods for creating mocks
 */
export class MockBuilderFactory {
  static paymentRepository(): InMemoryPaymentRepository {
    return new InMemoryPaymentRepository();
  }

  static govukPayClient(): MockGovukPayClient {
    return new MockGovukPayClient();
  }

  static idempotencyService(): MockIdempotencyService {
    return new MockIdempotencyService();
  }

  static stateTransitionService(): MockStateTransitionService {
    return new MockStateTransitionService();
  }

  static eventPublisher(): MockEventPublisher {
    return new MockEventPublisher();
  }
}
