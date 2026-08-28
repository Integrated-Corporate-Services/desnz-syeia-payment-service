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
  it('should extract Pay-Signature from headers and webhook_message_id from body', () => {
    const req = {
      headers: {
        'pay-signature': 'test-signature-123',
      },
      body: {
        webhook_message_id: 's3h4s4qiq1k25p5cs2d6574thk',
      },
    };

    const result = extractWebhookHeaders(req);

    expect(result).toEqual({
      signature: 'test-signature-123',
      webhookId: 's3h4s4qiq1k25p5cs2d6574thk',
    });
  });

  it('should handle array signature header by taking first element', () => {
    const req = {
      headers: {
        'pay-signature': ['first-signature', 'second-signature'],
      },
      body: {
        webhook_message_id: 's3h4s4qiq1k25p5cs2d6574thk',
      },
    };

    const result = extractWebhookHeaders(req);

    expect(result).toEqual({
      signature: 'first-signature',
      webhookId: 's3h4s4qiq1k25p5cs2d6574thk',
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
    });
  });

  it('should handle missing pay-signature header', () => {
    const req = {
      headers: {
        'content-type': 'application/json',
      },
      body: {
        webhook_message_id: 's3h4s4qiq1k25p5cs2d6574thk',
      },
    };

    const result = extractWebhookHeaders(req);

    expect(result).toEqual({
      signature: null,
      webhookId: 's3h4s4qiq1k25p5cs2d6574thk',
    });
  });
});
