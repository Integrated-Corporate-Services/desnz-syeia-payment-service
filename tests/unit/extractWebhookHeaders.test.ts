// Unit Tests for extractWebhookHeaders Function
// Tests the extraction of Pay-Signature header and webhook_message_id from request

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

import { extractWebhookHeaders } from '../../src/middlewares/validateWebhookSignature';

describe('extractWebhookHeaders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should extract Pay-Signature from headers and webhook_message_id from body', () => {
    const req = {
      headers: {
        'pay-signature': 'test-signature-123',
      },
      body: {
        webhook_message_id: 'evt_test_12345',
      },
    };

    const result = extractWebhookHeaders(req);

    expect(result).toEqual({
      signature: 'test-signature-123',
      webhookId: 'evt_test_12345',
      isValidWebhookId: false, // 'evt_test_12345' is not a valid UUID
    });
  });

  it('should handle array signature header by taking first element', () => {
    const req = {
      headers: {
        'pay-signature': ['first-signature', 'second-signature'],
      },
      body: {
        webhook_message_id: 'evt_test_12345',
      },
    };

    const result = extractWebhookHeaders(req);

    expect(result).toEqual({
      signature: 'first-signature',
      webhookId: 'evt_test_12345',
      isValidWebhookId: false, // 'evt_test_12345' is not a valid UUID
    });
  });

  it('should return null values for missing headers', () => {
    const req = {
      headers: {},
      body: {},
    };

    const result = extractWebhookHeaders(req);

    expect(result).toEqual({
      signature: null,
      webhookId: null,
      isValidWebhookId: false,
    });
  });

  it('should return null webhookId if not in body', () => {
    const req = {
      headers: {
        'pay-signature': 'test-signature-123',
      },
      body: {},
    };

    const result = extractWebhookHeaders(req);

    expect(result).toEqual({
      signature: 'test-signature-123',
      webhookId: null,
      isValidWebhookId: false,
    });
  });

  it('should handle missing pay-signature header', () => {
    const req = {
      headers: {
        'content-type': 'application/json',
      },
      body: {
        webhook_message_id: 'evt_test_12345',
      },
    };

    const result = extractWebhookHeaders(req);

    expect(result).toEqual({
      signature: null,
      webhookId: 'evt_test_12345',
      isValidWebhookId: false, // 'evt_test_12345' is not a valid UUID
    });
  });

  it('should validate webhook_message_id as valid UUID (HIGH-005 fix)', () => {
    const req = {
      headers: {
        'pay-signature': 'test-signature-123',
      },
      body: {
        webhook_message_id: '550e8400-e29b-41d4-a716-446655440000', // Valid UUID v4
      },
    };

    const result = extractWebhookHeaders(req);

    expect(result).toEqual({
      signature: 'test-signature-123',
      webhookId: '550e8400-e29b-41d4-a716-446655440000',
      isValidWebhookId: true, // Valid UUID
    });
  });

  it('should reject invalid UUID format in webhook_message_id', () => {
    const req = {
      headers: {
        'pay-signature': 'test-signature-123',
      },
      body: {
        webhook_message_id: 'not-a-valid-uuid-12345',
      },
    };

    const result = extractWebhookHeaders(req);

    expect(result).toEqual({
      signature: 'test-signature-123',
      webhookId: 'not-a-valid-uuid-12345',
      isValidWebhookId: false, // Invalid UUID format
    });
    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[Webhook] Invalid webhook_message_id format (not a valid UUID)',
      {
        webhookId: 'not-a-valid-uuid-12345',
        type: 'string',
      }
    );
  });

  it('should handle numeric webhook_message_id as invalid', () => {
    const req: any = {
      headers: {
        'pay-signature': 'test-signature-123',
      },
      body: {
        webhook_message_id: 12345,
      },
    };

    const result = extractWebhookHeaders(req);

    expect(result).toEqual({
      signature: 'test-signature-123',
      webhookId: 12345,
      isValidWebhookId: false, // Not a string UUID
    });
  });
});
