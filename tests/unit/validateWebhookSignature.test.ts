// Unit Tests for Webhook Signature Validation Middleware

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

// Mock config BEFORE importing anything else
const mockConfig = {
  server: {
    port: 3000,
    host: 'localhost',
    nodeEnv: 'test',
  },
  db: {
    host: 'localhost',
    port: 5432,
    database: 'test_db',
    user: 'test_user',
    password: 'test_password',
    poolMax: 10,
  },
  webhook: {
    signingKey: 'test-signing-key',
    signingAlgorithm: 'sha256',
    maxRetries: 3,
    retryIntervals: [300000, 600000, 900000],
  },
  features: {
    signatureVerificationEnabled: true,
    callbackServiceEnabled: true,
    retryEnabled: true,
    dlqEnabled: true,
    metricsEnabled: false,
    detailedLogging: true,
  },
  aws: {
    region: 'eu-west-2',
    endpoint: 'http://localhost:4566',
    sqsQueueUrl: '',
    accessKeyId: '',
    secretAccessKey: '',
    sqsEnabled: false,
  },
};

jest.mock('../../src/config/config', () => ({
  __esModule: true,
  default: mockConfig,
}));

jest.mock('../../src/utils/loggerHelper', () => jest.fn(() => mockLogger));

import crypto from 'crypto';
import {
  extractWebhookHeaders,
  verifyWebhookSignature,
  parseWebhookEvent,
  extractPaymentIdFromEvent,
  validateWebhookSignature,
  validateWebhookSignatureMiddleware,
} from '../../src/middlewares/validateWebhookSignature';
import { WEBHOOK_SIGNING_ALGORITHM } from '../../src/constants';

describe('WebhookSignatureValidation', () => {
  describe('extractWebhookHeaders', () => {
    it('should extract Pay-Signature from headers and webhook_message_id from body with UUID validation', () => {
      const req = {
        headers: {
          'pay-signature': 'test-signature-123',
        },
        body: {
          webhook_message_id: '550e8400-e29b-41d4-a716-446655440000', // Valid UUID
        },
      };

      const result = extractWebhookHeaders(req);

      expect(result).toEqual({
        signature: 'test-signature-123',
        webhookId: '550e8400-e29b-41d4-a716-446655440000',
        isValidWebhookId: true,
      });
    });

    // ✅ FIX HIGH-005: Test invalid webhook_message_id format
    it('should detect invalid webhook_message_id (not a UUID)', () => {
      const req = {
        headers: {
          'pay-signature': 'test-signature-123',
        },
        body: {
          webhook_message_id: 'evt_test_12345', // Not a UUID
        },
      };

      const result = extractWebhookHeaders(req);

      expect(result).toEqual({
        signature: 'test-signature-123',
        webhookId: 'evt_test_12345',
        isValidWebhookId: false,
      });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[Webhook] Invalid webhook_message_id format (not a valid UUID)',
        expect.objectContaining({
          webhookId: 'evt_test_12345',
          type: 'string',
        })
      );
    });

    // ✅ FIX HIGH-005: Test SQL injection attempt
    it('should detect SQL injection attempt in webhook_message_id', () => {
      const req = {
        headers: {
          'pay-signature': 'test-signature-123',
        },
        body: {
          webhook_message_id: "1'; DROP TABLE payment_webhooks; --",
        },
      };

      const result = extractWebhookHeaders(req);

      expect(result).toEqual({
        signature: 'test-signature-123',
        webhookId: "1'; DROP TABLE payment_webhooks; --",
        isValidWebhookId: false,
      });
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should handle array signature header with valid UUID', () => {
      const req = {
        headers: {
          'pay-signature': ['test-signature-123', 'extra'],
        },
        body: {
          webhook_message_id: '123e4567-e89b-12d3-a456-426614174000', // Valid UUID
        },
      };

      const result = extractWebhookHeaders(req);

      expect(result).toEqual({
        signature: 'test-signature-123',
        webhookId: '123e4567-e89b-12d3-a456-426614174000',
        isValidWebhookId: true,
      });
    });

    it('should return null for missing headers', () => {
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

    // ✅ FIX HIGH-005: Test empty string webhook_message_id
    it('should handle empty string webhook_message_id', () => {
      const req = {
        headers: {
          'pay-signature': 'test-signature-123',
        },
        body: {
          webhook_message_id: '',
        },
      };

      const result = extractWebhookHeaders(req);

      expect(result).toEqual({
        signature: 'test-signature-123',
        webhookId: null, // Empty string coerces to null
        isValidWebhookId: false,
      });
    });
  });

  describe('verifyWebhookSignature', () => {
    it('should verify valid signature', () => {
      const signingKey = 'test-signing-key';
      const body = JSON.stringify({ test: 'data' });
      const validSignature = crypto
        .createHmac(WEBHOOK_SIGNING_ALGORITHM, signingKey)
        .update(body, 'utf-8')
        .digest('hex');

      const result = verifyWebhookSignature(validSignature, body, signingKey);

      expect(result).toBe(true);
    });

    it('should reject invalid signature', () => {
      const signingKey = 'test-signing-key';
      const body = JSON.stringify({ test: 'data' });
      const invalidSignature = 'invalid-signature-123';

      const result = verifyWebhookSignature(invalidSignature, body, signingKey);

      expect(result).toBe(false);
    });

    it('should handle signature verification errors', () => {
      const signingKey = 'test-signing-key';
      const body = JSON.stringify({ test: 'data' });
      const signature = null as any;

      const result = verifyWebhookSignature(signature, body, signingKey);

      expect(result).toBe(false);
    });
  });

  describe('parseWebhookEvent', () => {
    it('should parse valid GOV.UK Pay webhook event', () => {
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
        },
      });
    });

    it('should return null for null body', () => {
      const result = parseWebhookEvent(null as any);

      expect(result).toBeNull();
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

    it('should default api_version to 1 if not provided', () => {
      const rawBody = {
        webhook_message_id: 'evt_test_12345',
        event_type: 'card_payment_succeeded',
        resource_id: 'pay_12345',
        resource_type: 'payment',
        resource: { payment_id: 'pay_12345' },
      };

      const result = parseWebhookEvent(rawBody);

      expect(result?.api_version).toBe(1);
    });

    it('should handle missing created_date with current timestamp', () => {
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
    });
  });

  describe('extractPaymentIdFromEvent', () => {
    it('should extract payment ID from resource_id', () => {
      const event = {
        webhook_message_id: 'evt_test_12345',
        api_version: 1,
        event_type: 'card_payment_succeeded',
        created_date: '2024-01-15T10:30:00Z',
        resource_id: 'pay_12345',
        resource_type: 'payment',
        resource: {
          payment_id: 'pay_12345',
          amount: 5000,
        },
      };

      const result = extractPaymentIdFromEvent(event);

      expect(result).toBe('pay_12345');
    });

    it('should fallback to resource.payment_id if resource_id not present', () => {
      const event = {
        webhook_message_id: 'evt_test_12345',
        api_version: 1,
        event_type: 'card_payment_succeeded',
        created_date: '2024-01-15T10:30:00Z',
        resource_id: '',
        resource_type: 'payment',
        resource: {
          payment_id: 'pay_67890',
        },
      };

      const result = extractPaymentIdFromEvent(event);

      expect(result).toBe('pay_67890');
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
          payment_id: 12345,
        },
      };

      const result = extractPaymentIdFromEvent(event);

      expect(result).toBeNull();
    });
  });

  describe('validateWebhookSignature', () => {
    const signingKey = 'test-signing-key';

    it('should validate complete valid webhook with UUID webhook_message_id', () => {
      const body = {
        webhook_message_id: '550e8400-e29b-41d4-a716-446655440000', // ✅ Valid UUID
        api_version: 1,
        event_type: 'card_payment_succeeded',
        created_date: '2024-01-15T10:30:00Z',
        resource_id: 'pay_12345',
        resource_type: 'payment',
        resource: {
          payment_id: 'pay_12345',
          amount: 5000,
        },
      };
      const bodyString = JSON.stringify(body);
      const signature = crypto
        .createHmac(WEBHOOK_SIGNING_ALGORITHM, signingKey)
        .update(bodyString, 'utf-8')
        .digest('hex');

      const req = {
        headers: {
          'pay-signature': signature,
        },
        body,
        rawBody: bodyString,
      };

      const result = validateWebhookSignature(req, signingKey);

      expect(result.valid).toBe(true);
      expect(result.event).toEqual(body);
      expect(result.paymentId).toBe('pay_12345');
    });

    it('should reject missing signature', () => {
      const req = {
        headers: {},
        body: {
          webhook_message_id: 'evt_test_12345',
        },
      };

      const result = validateWebhookSignature(req, signingKey);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid webhook signature');
    });

    it('should reject invalid signature', () => {
      const body = {
        webhook_message_id: '123e4567-e89b-12d3-a456-426614174000', // Valid UUID
        api_version: 1,
        event_type: 'card_payment_succeeded',
        resource_id: 'pay_12345',
        resource_type: 'payment',
        resource: { payment_id: 'pay_12345' },
      };
      const req = {
        headers: {
          'pay-signature': 'invalid-signature',
        },
        body,
        rawBody: JSON.stringify(body),
      };

      const result = validateWebhookSignature(req, signingKey);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid webhook signature');
    });

    it('should reject invalid event structure', () => {
      const body = {
        webhook_message_id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d', // Valid UUID but invalid event structure
      };
      const bodyString = JSON.stringify(body);
      const signature = crypto
        .createHmac(WEBHOOK_SIGNING_ALGORITHM, signingKey)
        .update(bodyString, 'utf-8')
        .digest('hex');

      const req = {
        headers: {
          'pay-signature': signature,
        },
        body,
        rawBody: bodyString,
      };

      const result = validateWebhookSignature(req, signingKey);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid webhook event structure');
    });

    it('should handle missing resource_id by defaulting to unknown', () => {
      const body = {
        webhook_message_id: 'c9bf9e57-1685-4c89-bafb-ff5af830be8a', // Valid UUID
        api_version: 1,
        event_type: 'card_payment_succeeded',
        created_date: '2024-01-15T10:30:00Z',
        resource_id: '',
        resource_type: 'payment',
        resource: {},
      };
      const bodyString = JSON.stringify(body);
      const signature = crypto
        .createHmac(WEBHOOK_SIGNING_ALGORITHM, signingKey)
        .update(bodyString, 'utf-8')
        .digest('hex');

      const req = {
        headers: {
          'pay-signature': signature,
        },
        body,
        rawBody: bodyString,
      };

      const result = validateWebhookSignature(req, signingKey);

      expect(result.valid).toBe(true);
      expect(result.event).toBeDefined();
      expect(result.event?.resource_id).toBe('unknown');
    });

    it('should handle missing rawBody by reconstructing from body', () => {
      const body = {
        webhook_message_id: 'd290f1ee-6c54-4b01-90e6-d701748f0851', // Valid UUID
        api_version: 1,
        event_type: 'card_payment_succeeded',
        created_date: '2024-01-15T10:30:00Z',
        resource_id: 'pay_12345',
        resource_type: 'payment',
        resource: {
          payment_id: 'pay_12345',
        },
      };
      const bodyString = JSON.stringify(body);
      const signature = crypto
        .createHmac(WEBHOOK_SIGNING_ALGORITHM, signingKey)
        .update(bodyString, 'utf-8')
        .digest('hex');

      const req = {
        headers: {
          'pay-signature': signature,
        },
        body,
      };

      const result = validateWebhookSignature(req, signingKey);

      expect(result.valid).toBe(true);
    });

    // ✅ FIX HIGH-005: Test invalid webhook_message_id format rejection
    it('should reject webhook with invalid webhook_message_id format (not UUID)', () => {
      const body = {
        webhook_message_id: 'evt_test_12345', // Not a valid UUID
        api_version: 1,
        event_type: 'card_payment_succeeded',
        created_date: '2024-01-15T10:30:00Z',
        resource_id: 'pay_12345',
        resource_type: 'payment',
        resource: {
          payment_id: 'pay_12345',
        },
      };
      const bodyString = JSON.stringify(body);
      const signature = crypto
        .createHmac(WEBHOOK_SIGNING_ALGORITHM, signingKey)
        .update(bodyString, 'utf-8')
        .digest('hex');

      const req = {
        headers: {
          'pay-signature': signature,
        },
        body,
        rawBody: bodyString,
      };

      const result = validateWebhookSignature(req, signingKey);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid webhook_message_id format');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[Webhook] Rejected webhook with invalid webhook_message_id format',
        expect.objectContaining({
          webhookId: 'evt_test_12345',
          reason: 'Not a valid UUID',
        })
      );
    });

    // ✅ FIX HIGH-005: Test SQL injection attempt rejection
    it('should reject SQL injection attempt in webhook_message_id', () => {
      const body = {
        webhook_message_id: "1'; DROP TABLE payment_webhooks; --",
        api_version: 1,
        event_type: 'card_payment_succeeded',
        created_date: '2024-01-15T10:30:00Z',
        resource_id: 'pay_12345',
        resource_type: 'payment',
        resource: {
          payment_id: 'pay_12345',
        },
      };
      const bodyString = JSON.stringify(body);
      const signature = crypto
        .createHmac(WEBHOOK_SIGNING_ALGORITHM, signingKey)
        .update(bodyString, 'utf-8')
        .digest('hex');

      const req = {
        headers: {
          'pay-signature': signature,
        },
        body,
        rawBody: bodyString,
      };

      const result = validateWebhookSignature(req, signingKey);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid webhook_message_id format');
    });

    // ✅ FIX HIGH-005: Test valid UUID passes
    it('should accept valid UUID webhook_message_id', () => {
      const body = {
        webhook_message_id: '550e8400-e29b-41d4-a716-446655440000', // Valid UUID
        api_version: 1,
        event_type: 'card_payment_succeeded',
        created_date: '2024-01-15T10:30:00Z',
        resource_id: 'pay_12345',
        resource_type: 'payment',
        resource: {
          payment_id: 'pay_12345',
        },
      };
      const bodyString = JSON.stringify(body);
      const signature = crypto
        .createHmac(WEBHOOK_SIGNING_ALGORITHM, signingKey)
        .update(bodyString, 'utf-8')
        .digest('hex');

      const req = {
        headers: {
          'pay-signature': signature,
        },
        body,
        rawBody: bodyString,
      };

      const result = validateWebhookSignature(req, signingKey);

      expect(result.valid).toBe(true);
      expect(result.event).toBeDefined();
      expect(result.paymentId).toBe('pay_12345');
    });
  });

  describe('validateWebhookSignatureMiddleware', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should call next() for valid webhook', () => {
      const signingKey = 'test-signing-key';
      process.env.GOVPAY_WEBHOOK_SIGNING_KEY = signingKey;

      const body = {
        webhook_message_id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479', // Valid UUID
        api_version: 1,
        event_type: 'card_payment_succeeded',
        created_date: '2024-01-15T10:30:00Z',
        resource_id: 'pay_12345',
        resource_type: 'payment',
        resource: { payment_id: 'pay_12345' },
      };
      const bodyString = JSON.stringify(body);
      const signature = crypto
        .createHmac(WEBHOOK_SIGNING_ALGORITHM, signingKey)
        .update(bodyString, 'utf-8')
        .digest('hex');

      const req: any = {
        headers: {
          'pay-signature': signature,
        },
        body,
        rawBody: bodyString,
      };
      const res: any = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      validateWebhookSignatureMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.webhookEvent).toEqual(body);
      expect(req.paymentId).toBe('pay_12345');
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 401 for invalid signature', () => {
      const signingKey = 'test-signing-key';
      process.env.GOVPAY_WEBHOOK_SIGNING_KEY = signingKey;

      const req: any = {
        headers: {
          'pay-signature': 'invalid-signature',
        },
        body: {
          webhook_message_id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8', // Valid UUID
        },
        rawBody: JSON.stringify({ webhook_message_id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8' }),
      };
      const res: any = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      validateWebhookSignatureMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid webhook signature',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 500 if signing key not configured', () => {
      delete process.env.GOVPAY_WEBHOOK_SIGNING_KEY;

      const req: any = { headers: {}, body: {} };
      const res: any = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      validateWebhookSignatureMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Webhook signing key not configured',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 for missing webhook_message_id', () => {
      const signingKey = 'test-signing-key';
      process.env.GOVPAY_WEBHOOK_SIGNING_KEY = signingKey;

      const req: any = {
        headers: {
          'pay-signature': 'some-signature',
        },
        body: {},
      };
      const res: any = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      validateWebhookSignatureMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 for incomplete event structure', () => {
      const signingKey = 'test-signing-key';
      process.env.GOVPAY_WEBHOOK_SIGNING_KEY = signingKey;

      const body = {
        webhook_message_id: '6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b', // Valid UUID
      };
      const bodyString = JSON.stringify(body);
      const signature = crypto
        .createHmac(WEBHOOK_SIGNING_ALGORITHM, signingKey)
        .update(bodyString, 'utf-8')
        .digest('hex');

      const req: any = {
        headers: {
          'pay-signature': signature,
        },
        body,
        rawBody: bodyString,
      };
      const res: any = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      validateWebhookSignatureMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid webhook event structure',
      });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
