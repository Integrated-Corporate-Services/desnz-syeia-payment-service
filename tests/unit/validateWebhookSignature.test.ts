// Unit Tests for Webhook Signature Validation Middleware

import crypto from 'crypto';
import {
  extractWebhookHeaders,
  verifyWebhookSignature,
  parseWebhookEvent,
  extractPaymentIdFromEvent,
  validateWebhookSignature,
  validateWebhookSignatureMiddleware,
} from '../../src/middlewares/validateWebhookSignature';
import { WEBHOOK_SIGNING_ALGORITHM, ERROR_MESSAGES } from '../../src/constants';

jest.mock('../../src/utils/loggerHelper');

describe('WebhookSignatureValidation', () => {
  describe('extractWebhookHeaders', () => {
    it('should extract signature and webhook ID from headers', () => {
      // Arrange
      const req = {
        headers: {
          'x-webhook-signature': 'test-signature-123',
          'x-webhook-id': 'evt_test_12345',
        },
        body: {},
      };

      // Act
      const result = extractWebhookHeaders(req);

      // Assert
      expect(result).toEqual({
        signature: 'test-signature-123',
        webhookId: 'evt_test_12345',
      });
    });

    it('should get webhook ID from body if not in headers', () => {
      // Arrange
      const req = {
        headers: {
          'x-webhook-signature': 'test-signature-123',
        },
        body: {
          webhook_id: 'evt_from_body_12345',
        },
      };

      // Act
      const result = extractWebhookHeaders(req);

      // Assert
      expect(result).toEqual({
        signature: 'test-signature-123',
        webhookId: 'evt_from_body_12345',
      });
    });

    it('should return null for missing headers', () => {
      // Arrange
      const req = {
        headers: {},
        body: {},
      };

      // Act
      const result = extractWebhookHeaders(req);

      // Assert
      expect(result).toEqual({
        signature: null,
        webhookId: null,
      });
    });
  });

  describe('verifyWebhookSignature', () => {
    it('should verify valid signature', () => {
      // Arrange
      const signingKey = 'test-signing-key';
      const body = JSON.stringify({ test: 'data' });
      const validSignature = crypto
        .createHmac(WEBHOOK_SIGNING_ALGORITHM, signingKey)
        .update(body, 'utf-8')
        .digest('hex');

      // Act
      const result = verifyWebhookSignature(validSignature, body, signingKey);

      // Assert
      expect(result).toBe(true);
    });

    it('should reject invalid signature', () => {
      // Arrange
      const signingKey = 'test-signing-key';
      const body = JSON.stringify({ test: 'data' });
      const invalidSignature = 'invalid-signature-123';

      // Act
      const result = verifyWebhookSignature(invalidSignature, body, signingKey);

      // Assert
      expect(result).toBe(false);
    });

    it('should handle signature verification errors', () => {
      // Arrange
      const signingKey = 'test-signing-key';
      const body = JSON.stringify({ test: 'data' });
      const signature = null as any; // Force error

      // Act
      const result = verifyWebhookSignature(signature, body, signingKey);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('parseWebhookEvent', () => {
    it('should parse valid webhook event', () => {
      // Arrange
      const rawBody = {
        webhook_id: 'evt_test_12345',
        event_type: 'PAYMENT_COMPLETED',
        created_date: '2024-01-15T10:30:00Z',
        resource: {
          payment_id: 'pay_12345',
          external_id: 'APP-001',
        },
      };

      // Act
      const result = parseWebhookEvent(rawBody);

      // Assert
      expect(result).toEqual(rawBody);
    });

    it('should return null for invalid body structure', () => {
      // Arrange
      const rawBody = null;

      // Act
      const result = parseWebhookEvent(rawBody);

      // Assert
      expect(result).toBeNull();
    });

    it('should return null for missing required fields', () => {
      // Arrange
      const rawBody = {
        webhook_id: 'evt_test_12345',
        // Missing event_type and resource
      };

      // Act
      const result = parseWebhookEvent(rawBody);

      // Assert
      expect(result).toBeNull();
    });

    it('should handle parsing errors', () => {
      // Arrange
      const rawBody = {
        webhook_id: 'evt_test_12345',
        event_type: 'PAYMENT_COMPLETED',
        created_date: '2024-01-15T10:30:00Z',
        resource: null, // Invalid resource
      };

      // Act
      const result = parseWebhookEvent(rawBody);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('extractPaymentIdFromEvent', () => {
    it('should extract payment ID from external_id', () => {
      // Arrange
      const event = {
        webhook_id: 'evt_test_12345',
        event_type: 'PAYMENT_COMPLETED',
        created_date: '2024-01-15T10:30:00Z',
        resource: {
          external_id: 'APP-001',
          payment_id: 'pay_12345',
        },
      };

      // Act
      const result = extractPaymentIdFromEvent(event);

      // Assert
      expect(result).toBe('APP-001');
    });

    it('should fallback to payment_id if external_id not present', () => {
      // Arrange
      const event = {
        webhook_id: 'evt_test_12345',
        event_type: 'PAYMENT_COMPLETED',
        created_date: '2024-01-15T10:30:00Z',
        resource: {
          payment_id: 'pay_12345',
        },
      };

      // Act
      const result = extractPaymentIdFromEvent(event);

      // Assert
      expect(result).toBe('pay_12345');
    });

    it('should return null if no payment ID found', () => {
      // Arrange
      const event = {
        webhook_id: 'evt_test_12345',
        event_type: 'PAYMENT_COMPLETED',
        created_date: '2024-01-15T10:30:00Z',
        resource: {},
      };

      // Act
      const result = extractPaymentIdFromEvent(event);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('validateWebhookSignature', () => {
    const signingKey = 'test-signing-key';

    it('should validate complete valid webhook', () => {
      // Arrange
      const body = {
        webhook_id: 'evt_test_12345',
        event_type: 'PAYMENT_COMPLETED',
        created_date: '2024-01-15T10:30:00Z',
        resource: {
          external_id: 'APP-001',
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
          'x-webhook-signature': signature,
          'x-webhook-id': 'evt_test_12345',
        },
        body,
      };

      // Act
      const result = validateWebhookSignature(req, signingKey);

      // Assert
      expect(result.valid).toBe(true);
      expect(result.event).toEqual(body);
      expect(result.paymentId).toBe('APP-001');
    });

    it('should reject missing signature', () => {
      // Arrange
      const req = {
        headers: {},
        body: {},
      };

      // Act
      const result = validateWebhookSignature(req, signingKey);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.error).toBe(ERROR_MESSAGES.MISSING_SIGNATURE);
    });

    it('should reject invalid signature', () => {
      // Arrange
      const body = {
        webhook_id: 'evt_test_12345',
        event_type: 'PAYMENT_COMPLETED',
        resource: { external_id: 'APP-001' },
      };
      const req = {
        headers: {
          'x-webhook-signature': 'invalid-signature',
          'x-webhook-id': 'evt_test_12345',
        },
        body,
      };

      // Act
      const result = validateWebhookSignature(req, signingKey);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.error).toBe(ERROR_MESSAGES.INVALID_SIGNATURE);
    });
  });

  describe('validateWebhookSignatureMiddleware', () => {
    it('should call next() for valid webhook', () => {
      // Arrange
      const signingKey = 'test-signing-key';
      process.env.GOVPAY_WEBHOOK_SIGNING_KEY = signingKey;

      const body = {
        webhook_id: 'evt_test_12345',
        event_type: 'PAYMENT_COMPLETED',
        resource: { external_id: 'APP-001' },
      };
      const bodyString = JSON.stringify(body);
      const signature = crypto
        .createHmac(WEBHOOK_SIGNING_ALGORITHM, signingKey)
        .update(bodyString, 'utf-8')
        .digest('hex');

      const req: any = {
        headers: {
          'x-webhook-signature': signature,
          'x-webhook-id': 'evt_test_12345',
        },
        body,
      };
      const res: any = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      // Act
      validateWebhookSignatureMiddleware(req, res, next);

      // Assert
      expect(next).toHaveBeenCalled();
      expect(req.webhookEvent).toEqual(body);
      expect(req.paymentId).toBe('APP-001');
    });

    it('should return 401 for invalid signature', () => {
      // Arrange
      const signingKey = 'test-signing-key';
      process.env.GOVPAY_WEBHOOK_SIGNING_KEY = signingKey;

      const req: any = {
        headers: {
          'x-webhook-signature': 'invalid-signature',
          'x-webhook-id': 'evt_test_12345',
        },
        body: {},
      };
      const res: any = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      // Act
      validateWebhookSignatureMiddleware(req, res, next);

      // Assert
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 500 if signing key not configured', () => {
      // Arrange
      delete process.env.GOVPAY_WEBHOOK_SIGNING_KEY;

      const req: any = { headers: {}, body: {} };
      const res: any = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      // Act
      validateWebhookSignatureMiddleware(req, res, next);

      // Assert
      expect(res.status).toHaveBeenCalledWith(500);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
