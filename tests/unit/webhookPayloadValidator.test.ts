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
    features: {
      callbackServiceEnabled: true,
      signatureVerificationEnabled: false,
    },
  },
}));

jest.mock('../../src/utils/loggerHelper', () => jest.fn(() => mockLogger));

import { validateWebhookPayload } from '../../src/validators/webhookPayloadValidator';
import {
  PAYMENT_SUCCEEDED_WEBHOOK,
  PAYMENT_CAPTURED_WEBHOOK,
  PAYMENT_FAILED_WEBHOOK,
  PAYMENT_CANCELLED_WEBHOOK,
  PAYMENT_EXPIRED_WEBHOOK,
  INVALID_WEBHOOK_MISSING_FIELDS,
  INVALID_WEBHOOK_MALFORMED,
} from '../fixtures/webhook-payloads.fixture';

describe('validateWebhookPayload', () => {
  describe('valid payloads', () => {
    it.each([
      ['card_payment_succeeded', PAYMENT_SUCCEEDED_WEBHOOK],
      ['card_payment_captured', PAYMENT_CAPTURED_WEBHOOK],
      ['card_payment_failed', PAYMENT_FAILED_WEBHOOK],
      ['card_payment_cancelled', PAYMENT_CANCELLED_WEBHOOK],
      ['card_payment_expired (sandbox)', PAYMENT_EXPIRED_WEBHOOK],
    ])('should accept %s webhook', (_label, payload) => {
      const result = validateWebhookPayload(payload);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept uppercase PAYMENT resource_type', () => {
      const result = validateWebhookPayload(PAYMENT_EXPIRED_WEBHOOK);

      expect(result.valid).toBe(true);
      expect(result.errors).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'resource_type' }),
        ])
      );
    });

    it('should accept timedout status from sandbox provider', () => {
      const result = validateWebhookPayload(PAYMENT_EXPIRED_WEBHOOK);

      expect(result.valid).toBe(true);
      expect(result.errors).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'resource.state.status' }),
        ])
      );
    });

    it('should accept all official payment state statuses', () => {
      const basePayload = { ...PAYMENT_SUCCEEDED_WEBHOOK };

      const statuses = [
        'created',
        'started',
        'submitted',
        'success',
        'failed',
        'cancelled',
        'error',
        'capturable',
        'expired',
        'timedout',
      ];

      for (const status of statuses) {
        const payload = {
          ...basePayload,
          resource: {
            ...basePayload.resource,
            state: { status, finished: status !== 'created' },
          },
        };

        const result = validateWebhookPayload(payload);
        expect(result.valid).toBe(true);
      }
    });

    it('should accept legacy PAYMENT_EXPIRED event type', () => {
      const payload = {
        ...PAYMENT_EXPIRED_WEBHOOK,
        event_type: 'PAYMENT_EXPIRED',
        resource: {
          ...PAYMENT_EXPIRED_WEBHOOK.resource,
          state: {
            status: 'failed',
            finished: true,
            code: 'P0020',
            message: 'Payment expired',
          },
        },
      };

      const result = validateWebhookPayload(payload);
      expect(result.valid).toBe(true);
    });
  });

  describe('invalid payloads', () => {
    it('should reject null payload', () => {
      const result = validateWebhookPayload(null);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatchObject({
        field: 'payload',
        message: 'Payload is required and must be an object',
      });
    });

    it('should reject payload missing required root fields', () => {
      const result = validateWebhookPayload(INVALID_WEBHOOK_MISSING_FIELDS);

      expect(result.valid).toBe(false);
      expect(result.errors.map((e) => e.field)).toEqual(
        expect.arrayContaining(['created_date', 'resource_id', 'event_type', 'resource'])
      );
    });

    it('should reject malformed resource object', () => {
      const result = validateWebhookPayload(INVALID_WEBHOOK_MALFORMED);

      expect(result.valid).toBe(false);
      expect(result.errors.map((e) => e.field)).toEqual(
        expect.arrayContaining([
          'resource.amount',
          'resource.description',
          'resource.reference',
          'resource.payment_provider',
          'resource.created_date',
          'resource.state',
        ])
      );
    });

    it('should reject invalid resource_type', () => {
      const payload = {
        ...PAYMENT_SUCCEEDED_WEBHOOK,
        resource_type: 'refund',
      };

      const result = validateWebhookPayload(payload);

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'resource_type',
            message: 'resource_type must be "payment"',
            value: 'refund',
          }),
        ])
      );
    });

    it('should reject unknown event_type', () => {
      const payload = {
        ...PAYMENT_SUCCEEDED_WEBHOOK,
        event_type: 'card_payment_unknown',
      };

      const result = validateWebhookPayload(payload);

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'event_type',
            value: 'card_payment_unknown',
          }),
        ])
      );
    });

    it('should reject unknown payment status', () => {
      const payload = {
        ...PAYMENT_SUCCEEDED_WEBHOOK,
        resource: {
          ...PAYMENT_SUCCEEDED_WEBHOOK.resource,
          state: {
            status: 'unknown_status',
            finished: true,
          },
        },
      };

      const result = validateWebhookPayload(payload);

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'resource.state.status',
            value: 'unknown_status',
          }),
        ])
      );
    });

    it('should reject zero or negative amount', () => {
      const payload = {
        ...PAYMENT_SUCCEEDED_WEBHOOK,
        resource: {
          ...PAYMENT_SUCCEEDED_WEBHOOK.resource,
          amount: 0,
        },
      };

      const result = validateWebhookPayload(payload);

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'resource.amount',
            message: 'amount must be a positive number (in pence)',
          }),
        ])
      );
    });

    it('should reject invalid email format', () => {
      const payload = {
        ...PAYMENT_SUCCEEDED_WEBHOOK,
        resource: {
          ...PAYMENT_SUCCEEDED_WEBHOOK.resource,
          email: 'not-an-email',
        },
      };

      const result = validateWebhookPayload(payload);

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'resource.email',
          }),
        ])
      );
    });

    it('should reject invalid card expiry date format', () => {
      const payload = {
        ...PAYMENT_SUCCEEDED_WEBHOOK,
        resource: {
          ...PAYMENT_SUCCEEDED_WEBHOOK.resource,
          card_details: {
            ...PAYMENT_SUCCEEDED_WEBHOOK.resource.card_details,
            expiry_date: '2028-10',
          },
        },
      };

      const result = validateWebhookPayload(payload);

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'resource.card_details.expiry_date',
          }),
        ])
      );
    });
  });
});
