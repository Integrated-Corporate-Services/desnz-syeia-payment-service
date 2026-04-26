// Unit Tests for parseWebhookEvent Function
// Tests parsing and validation of GOV.UK Pay webhook event structure

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

jest.mock('../../src/config/config', () => ({
  default: {
    port: 3000,
    host: 'localhost',
    nodeEnv: 'test',
    database: {
      host: 'localhost',
      port: 5432,
      name: 'test_db',
      user: 'test_user',
      password: 'test_password',
      maxConnections: 10,
    },
    webhookSigningKey: 'test-signing-key',
  },
}));

jest.mock('../../src/utils/loggerHelper', () => jest.fn(() => mockLogger));

import { parseWebhookEvent } from '../../src/middlewares/validateWebhookSignature';

describe('parseWebhookEvent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should parse complete GOV.UK Pay webhook event', () => {
    const rawBody = {
      webhook_message_id: 'evt_test_12345',
      api_version: 1,
      event_type: 'card_payment_succeeded',
      created_date: '2024-01-15T10:30:00Z',
      resource_id: 'pay_12345',
      resource_type: 'payment',
      resource: {
        payment_id: 'pay_12345',
        amount: 5000,
        status: 'success',
      },
    };

    const result = parseWebhookEvent(rawBody);

    expect(result).toEqual({
      webhook_message_id: 'evt_test_12345',
      api_version: 1,
      event_type: 'card_payment_succeeded',
      created_date: '2024-01-15T10:30:00Z',
      resource_id: 'pay_12345',
      resource_type: 'payment',
      resource: {
        payment_id: 'pay_12345',
        amount: 5000,
        status: 'success',
      },
    });
  });

  it('should return null for null body', () => {
    const result = parseWebhookEvent(null as any);

    expect(result).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith('[Webhook] Invalid webhook body structure');
  });

  it('should return null for non-object body', () => {
    const result = parseWebhookEvent('not an object' as any);

    expect(result).toBeNull();
  });

  it('should return null for missing webhook_message_id', () => {
    const rawBody = {
      api_version: 1,
      event_type: 'card_payment_succeeded',
      resource_id: 'pay_12345',
      resource_type: 'payment',
      resource: { payment_id: 'pay_12345' },
    };

    const result = parseWebhookEvent(rawBody);

    expect(result).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[Webhook] Webhook missing required fields',
      expect.objectContaining({
        hasWebhookMessageId: false,
      })
    );
  });

  it('should return null for missing event_type', () => {
    const rawBody = {
      webhook_message_id: 'evt_test_12345',
      api_version: 1,
      resource_id: 'pay_12345',
      resource_type: 'payment',
      resource: { payment_id: 'pay_12345' },
    };

    const result = parseWebhookEvent(rawBody);

    expect(result).toBeNull();
  });

  it('should return null for missing resource', () => {
    const rawBody = {
      webhook_message_id: 'evt_test_12345',
      api_version: 1,
      event_type: 'card_payment_succeeded',
      resource_id: 'pay_12345',
      resource_type: 'payment',
    };

    const result = parseWebhookEvent(rawBody);

    expect(result).toBeNull();
  });

  it('should return null for missing resource_id', () => {
    const rawBody = {
      webhook_message_id: 'evt_test_12345',
      api_version: 1,
      event_type: 'card_payment_succeeded',
      resource_type: 'payment',
      resource: { payment_id: 'pay_12345' },
    };

    const result = parseWebhookEvent(rawBody);

    expect(result).toBeNull();
  });

  it('should return null for missing resource_type', () => {
    const rawBody = {
      webhook_message_id: 'evt_test_12345',
      api_version: 1,
      event_type: 'card_payment_succeeded',
      resource_id: 'pay_12345',
      resource: { payment_id: 'pay_12345' },
    };

    const result = parseWebhookEvent(rawBody);

    expect(result).toBeNull();
  });

  it('should default api_version to 1 if not provided', () => {
    const rawBody = {
      webhook_message_id: 'evt_test_12345',
      event_type: 'card_payment_succeeded',
      resource_id: 'pay_12345',
      resource_type: 'payment',
      resource: { payment_id: 'pay_12345' },
    };

    const result = parseWebhookEvent(rawBody);

    expect(result).not.toBeNull();
    expect(result?.api_version).toBe(1);
  });

  it('should generate created_date if not provided', () => {
    const rawBody = {
      webhook_message_id: 'evt_test_12345',
      api_version: 1,
      event_type: 'card_payment_succeeded',
      resource_id: 'pay_12345',
      resource_type: 'payment',
      resource: { payment_id: 'pay_12345' },
    };

    const result = parseWebhookEvent(rawBody);

    expect(result).not.toBeNull();
    expect(result?.created_date).toBeTruthy();
    expect(new Date(result!.created_date).getTime()).toBeGreaterThan(0);
  });

  it('should handle different event types', () => {
    const eventTypes = [
      'card_payment_succeeded',
      'card_payment_failed',
      'card_payment_refunded',
      'card_payment_captured',
    ];

    eventTypes.forEach((eventType) => {
      const rawBody = {
        webhook_message_id: 'evt_test_12345',
        api_version: 1,
        event_type: eventType,
        resource_id: 'pay_12345',
        resource_type: 'payment',
        resource: { payment_id: 'pay_12345' },
      };

      const result = parseWebhookEvent(rawBody);

      expect(result).not.toBeNull();
      expect(result?.event_type).toBe(eventType);
    });
  });
});
