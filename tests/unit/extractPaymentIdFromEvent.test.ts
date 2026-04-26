// Unit Tests for extractPaymentIdFromEvent Function
// Tests extraction of payment ID from GOV.UK Pay webhook event

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

import { extractPaymentIdFromEvent } from '../../src/middlewares/validateWebhookSignature';

describe('extractPaymentIdFromEvent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should extract payment ID from resource_id (primary source)', () => {
    const event = {
      webhook_message_id: 'evt_test_12345',
      api_version: 1,
      event_type: 'card_payment_succeeded',
      created_date: '2024-01-15T10:30:00Z',
      resource_id: 'pay_primary_12345',
      resource_type: 'payment',
      resource: {
        payment_id: 'pay_fallback_67890',
        amount: 5000,
      },
    };

    const result = extractPaymentIdFromEvent(event);

    expect(result).toBe('pay_primary_12345');
  });

  it('should fallback to resource.payment_id if resource_id is empty', () => {
    const event = {
      webhook_message_id: 'evt_test_12345',
      api_version: 1,
      event_type: 'card_payment_succeeded',
      created_date: '2024-01-15T10:30:00Z',
      resource_id: '',
      resource_type: 'payment',
      resource: {
        payment_id: 'pay_fallback_67890',
      },
    };

    const result = extractPaymentIdFromEvent(event);

    expect(result).toBe('pay_fallback_67890');
  });

  it('should return null if no payment ID found', () => {
    const event = {
      webhook_message_id: 'evt_test_12345',
      api_version: 1,
      event_type: 'card_payment_succeeded',
      created_date: '2024-01-15T10:30:00Z',
      resource_id: '',
      resource_type: 'payment',
      resource: {},
    };

    const result = extractPaymentIdFromEvent(event);

    expect(result).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[Webhook] Unable to extract payment ID from event',
      expect.objectContaining({
        webhookMessageId: 'evt_test_12345',
      })
    );
  });

  it('should handle non-string resource.payment_id', () => {
    const event = {
      webhook_message_id: 'evt_test_12345',
      api_version: 1,
      event_type: 'card_payment_succeeded',
      created_date: '2024-01-15T10:30:00Z',
      resource_id: '',
      resource_type: 'payment',
      resource: {
        payment_id: 12345 as any,
      },
    };

    const result = extractPaymentIdFromEvent(event);

    expect(result).toBeNull();
  });

  it('should handle null resource object', () => {
    const event = {
      webhook_message_id: 'evt_test_12345',
      api_version: 1,
      event_type: 'card_payment_succeeded',
      created_date: '2024-01-15T10:30:00Z',
      resource_id: '',
      resource_type: 'payment',
      resource: null as any,
    };

    const result = extractPaymentIdFromEvent(event);

    expect(result).toBeNull();
  });

  it('should prefer resource_id over resource.payment_id when both exist', () => {
    const event = {
      webhook_message_id: 'evt_test_12345',
      api_version: 1,
      event_type: 'card_payment_succeeded',
      created_date: '2024-01-15T10:30:00Z',
      resource_id: 'pay_from_resource_id',
      resource_type: 'payment',
      resource: {
        payment_id: 'pay_from_resource_obj',
      },
    };

    const result = extractPaymentIdFromEvent(event);

    expect(result).toBe('pay_from_resource_id');
  });
});
