/**
 * Unit Tests for validateWebhookPayloadMiddleware
 * Tests HIGH-006 fix: Event Type Validation Bypass
 */

// Mock logger BEFORE imports (hoisting issue fix)
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

jest.mock('../../src/utils/loggerHelper', () => {
  return jest.fn(() => mockLogger);
});

import { Request, Response, NextFunction } from 'express';
import { validateWebhookPayloadMiddleware } from '../../src/validators/webhookPayloadValidator';
import {
  PAYMENT_SUCCEEDED_WEBHOOK,
  INVALID_WEBHOOK_MISSING_FIELDS,
  INVALID_WEBHOOK_MALFORMED,
} from '../fixtures/webhook-payloads.fixture';

describe('validateWebhookPayloadMiddleware - HIGH-006 Fix', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: jest.MockedFunction<NextFunction>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Setup response mock chain
    jsonMock = jest.fn().mockReturnThis();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });

    mockRequest = {
      body: {},
    };

    mockResponse = {
      status: statusMock,
      json: jsonMock,
    };

    mockNext = jest.fn();
  });

  describe('✅ Valid webhook payloads', () => {
    it('should call next() for valid GOV.UK Pay webhook', () => {
      mockRequest.body = PAYMENT_SUCCEEDED_WEBHOOK;

      validateWebhookPayloadMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockResponse.status).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        '[WebhookValidator] Payload validation passed',
        {
          webhook_message_id: PAYMENT_SUCCEEDED_WEBHOOK.webhook_message_id,
          event_type: PAYMENT_SUCCEEDED_WEBHOOK.event_type,
        }
      );
    });

    it('should accept all valid event types', () => {
      const validEventTypes = [
        'card_payment_succeeded',
        'card_payment_captured',
        'card_payment_failed',
        'card_payment_cancelled',
        'card_payment_expired',
      ];

      validEventTypes.forEach((eventType) => {
        jest.clearAllMocks();

        const payload = {
          ...PAYMENT_SUCCEEDED_WEBHOOK,
          event_type: eventType,
        };

        mockRequest.body = payload;

        validateWebhookPayloadMiddleware(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        expect(mockNext).toHaveBeenCalledTimes(1);
        expect(mockResponse.status).not.toHaveBeenCalled();
      });
    });
  });

  describe('❌ Invalid webhook payloads - HIGH-006 Fix Validation', () => {
    it('should return 400 and halt processing for missing required fields', () => {
      mockRequest.body = INVALID_WEBHOOK_MISSING_FIELDS;

      validateWebhookPayloadMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // ✅ HIGH-006: Validation errors MUST halt processing
      expect(mockNext).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      
      // ✅ HIGH-006: Response must include 'errors' field (not 'details')
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid webhook payload',
          errors: expect.any(Array),
        })
      );

      // Verify errors array contains validation details
      const responseBody = jsonMock.mock.calls[0][0];
      expect(responseBody.errors.length).toBeGreaterThan(0);
      expect(responseBody.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: expect.any(String),
            message: expect.any(String),
          }),
        ])
      );
    });

    it('should return 400 for malformed resource object', () => {
      mockRequest.body = INVALID_WEBHOOK_MALFORMED;

      validateWebhookPayloadMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Invalid webhook payload',
        errors: expect.any(Array),
      });
    });

    it('should return 400 for invalid event_type', () => {
      const invalidPayload = {
        ...PAYMENT_SUCCEEDED_WEBHOOK,
        event_type: 'invalid_event_type',  // ❌ Not in allowed list
      };

      mockRequest.body = invalidPayload;

      validateWebhookPayloadMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // ✅ HIGH-006: Invalid event type MUST be rejected
      expect(mockNext).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(400);

      const responseBody = jsonMock.mock.calls[0][0];
      expect(responseBody.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'event_type',
            message: expect.stringContaining('Invalid event_type'),
          }),
        ])
      );
    });

    it('should return 400 for SQL injection attempt in event_type', () => {
      const maliciousPayload = {
        ...PAYMENT_SUCCEEDED_WEBHOOK,
        event_type: "'; DROP TABLE webhooks; --",  // SQL injection attempt
      };

      mockRequest.body = maliciousPayload;

      validateWebhookPayloadMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // ✅ HIGH-006: SQL injection must be blocked
      expect(mockNext).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid webhook payload',
          errors: expect.any(Array),
        })
      );
    });

    it('should return 400 for XSS attempt in event_type', () => {
      const xssPayload = {
        ...PAYMENT_SUCCEEDED_WEBHOOK,
        event_type: '<script>alert("XSS")</script>',  // XSS attempt
      };

      mockRequest.body = xssPayload;

      validateWebhookPayloadMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 for empty event_type', () => {
      const payload = {
        ...PAYMENT_SUCCEEDED_WEBHOOK,
        event_type: '',  // Empty string
      };

      mockRequest.body = payload;

      validateWebhookPayloadMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 for null event_type', () => {
      const payload = {
        ...PAYMENT_SUCCEEDED_WEBHOOK,
        event_type: null,
      };

      mockRequest.body = payload;

      validateWebhookPayloadMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 for null payload', () => {
      mockRequest.body = null;

      validateWebhookPayloadMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Invalid webhook payload',
        errors: [{ field: 'payload', message: 'Payload is required and must be an object' }],
      });
    });

    it('should return 400 for undefined payload', () => {
      mockRequest.body = undefined;

      validateWebhookPayloadMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });
  });

  describe('🔍 Security logging', () => {
    it('should log validation failure with error details', () => {
      mockRequest.body = INVALID_WEBHOOK_MISSING_FIELDS;

      validateWebhookPayloadMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[WebhookValidator] Payload validation failed',
        {
          errors: expect.any(Array),
          body: INVALID_WEBHOOK_MISSING_FIELDS,
        }
      );
    });

    it('should NOT log sensitive data in validation success', () => {
      const payloadWithSensitiveData = {
        ...PAYMENT_SUCCEEDED_WEBHOOK,
        resource: {
          ...PAYMENT_SUCCEEDED_WEBHOOK.resource,
          card_details: {
            card_brand: 'Visa',
            last_digits_card_number: '1234',
            first_digits_card_number: '424242',
            expiry_date: '12/25',
            cardholder_name: 'Test User',
          },
        },
      };

      mockRequest.body = payloadWithSensitiveData;

      validateWebhookPayloadMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Should only log identifiers, not full payload
      expect(mockLogger.info).toHaveBeenCalledWith(
        '[WebhookValidator] Payload validation passed',
        {
          webhook_message_id: expect.any(String),
          event_type: expect.any(String),
        }
      );

      // Verify card details are NOT in the log
      const logCalls = mockLogger.info.mock.calls;
      const loggedData = JSON.stringify(logCalls);
      expect(loggedData).not.toContain('card_details');
      expect(loggedData).not.toContain('cardholder_name');
    });
  });

  describe('📊 Edge cases', () => {
    it('should handle very large payload gracefully', () => {
      const largePayload = {
        ...PAYMENT_SUCCEEDED_WEBHOOK,
        resource: {
          ...PAYMENT_SUCCEEDED_WEBHOOK.resource,
          description: 'A'.repeat(10000),  // 10KB description
        },
      };

      mockRequest.body = largePayload;

      validateWebhookPayloadMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should handle unicode characters in event_type validation', () => {
      const unicodePayload = {
        ...PAYMENT_SUCCEEDED_WEBHOOK,
        event_type: 'card_payment_succeeded™',  // Invalid with unicode
      };

      mockRequest.body = unicodePayload;

      validateWebhookPayloadMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });

    it('should validate case-sensitive event_type', () => {
      const uppercasePayload = {
        ...PAYMENT_SUCCEEDED_WEBHOOK,
        event_type: 'CARD_PAYMENT_SUCCEEDED',  // Wrong case
      };

      mockRequest.body = uppercasePayload;

      validateWebhookPayloadMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Event types are case-sensitive
      expect(mockNext).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });
  });

  describe('🔄 Idempotency', () => {
    it('should produce consistent results for same invalid payload', () => {
      mockRequest.body = INVALID_WEBHOOK_MISSING_FIELDS;

      // Call twice
      validateWebhookPayloadMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      const firstCallErrors = jsonMock.mock.calls[0][0].errors;

      jest.clearAllMocks();
      jsonMock = jest.fn().mockReturnThis();
      statusMock = jest.fn().mockReturnValue({ json: jsonMock });
      mockResponse.status = statusMock;

      validateWebhookPayloadMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      const secondCallErrors = jsonMock.mock.calls[0][0].errors;

      expect(firstCallErrors).toEqual(secondCallErrors);
    });
  });
});
