/**
 * Unit Tests for Webhook Message ID Validation
 * GOV.UK Pay sends webhook_message_id as 26 lowercase alphanumeric characters.
 */

import { extractWebhookHeaders } from '../../src/middlewares/validateWebhookSignature';
import { GOVUK_PAY_WEBHOOK_MESSAGE_ID_REGEX } from '../../src/constants/webhook.constants';

const VALID_GOVUK_PAY_IDS = [
  's3h4s4qiq1k25p5cs2d6574thk',
  '7mrp1d5lsa5pdfs2bvim2f9cdu',
  'qiqgg6pd8ps9runhjfg6adgf5m',
  'il080p09reme1pbq9ek0te92k3',
];

describe('Webhook Message ID Validation', () => {
  describe('extractWebhookHeaders - GOV.UK Pay format validation', () => {
    it('should accept valid GOV.UK Pay webhook_message_id values', () => {
      VALID_GOVUK_PAY_IDS.forEach((id) => {
        const req = {
          headers: { 'pay-signature': 'test-signature' },
          body: { webhook_message_id: id },
        };

        const result = extractWebhookHeaders(req);

        expect(result.webhookId).toBe(id);
        expect(result.signature).toBe('test-signature');
      });
    });

    it('should reject SQL injection attempts in webhook_message_id', () => {
      const sqlInjectionPayloads = [
        "'; DROP TABLE payment_webhooks; --",
        "1' OR '1'='1",
        "admin'--",
        "' UNION SELECT * FROM users--",
        "1; DELETE FROM payments WHERE 1=1; --",
      ];

      sqlInjectionPayloads.forEach((payload) => {
        const req = {
          headers: { 'pay-signature': 'test-signature' },
          body: { webhook_message_id: payload },
        };

        const result = extractWebhookHeaders(req);

        expect(result.webhookId).toBeNull();
        expect(result.signature).toBe('test-signature');
      });
    });

    it('should reject XSS attempts in webhook_message_id', () => {
      const xssPayloads = [
        '<script>alert(1)</script>',
        '<img src=x onerror=alert(1)>',
        'javascript:alert(1)',
        '<svg/onload=alert(1)>',
      ];

      xssPayloads.forEach((payload) => {
        const req = {
          headers: { 'pay-signature': 'test-signature' },
          body: { webhook_message_id: payload },
        };

        const result = extractWebhookHeaders(req);

        expect(result.webhookId).toBeNull();
      });
    });

    it('should reject path traversal attempts in webhook_message_id', () => {
      const pathTraversalPayloads = [
        '../../etc/passwd',
        '../../../secrets.env',
        '..\\..\\..\\windows\\system32',
      ];

      pathTraversalPayloads.forEach((payload) => {
        const req = {
          headers: { 'pay-signature': 'test-signature' },
          body: { webhook_message_id: payload },
        };

        const result = extractWebhookHeaders(req);

        expect(result.webhookId).toBeNull();
      });
    });

    it('should reject non-conforming strings', () => {
      const invalidFormats = [
        'not-a-valid-id',
        '12345678',
        '550e8400-e29b-41d4-a716-446655440000', // UUID v4 (wrong format for GOV.UK Pay)
        'random_string_123',
        '',
        ' ',
        'null',
        'undefined',
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ', // uppercase
        'abc123', // too short
        'abcdefghijklmnopqrstuvwxyz1234567890', // too long
      ];

      invalidFormats.forEach((invalid) => {
        const req = {
          headers: { 'pay-signature': 'test-signature' },
          body: { webhook_message_id: invalid },
        };

        const result = extractWebhookHeaders(req);

        expect(result.webhookId).toBeNull();
      });
    });

    it('should handle missing webhook_message_id gracefully', () => {
      const req = {
        headers: { 'pay-signature': 'test-signature' },
        body: {},
      };

      const result = extractWebhookHeaders(req);

      expect(result.webhookId).toBeNull();
      expect(result.signature).toBe('test-signature');
    });

    it('should handle null/undefined webhook_message_id', () => {
      const testCases = [
        { webhook_message_id: null as any },
        { webhook_message_id: undefined },
      ];

      testCases.forEach((body) => {
        const req: any = {
          headers: { 'pay-signature': 'test-signature' },
          body,
        };

        const result = extractWebhookHeaders(req);

        expect(result.webhookId).toBeNull();
      });
    });

    it('should handle non-string webhook_message_id types', () => {
      const nonStringTypes: any[] = [12345, true, false, [], {}, () => {}];

      nonStringTypes.forEach((value) => {
        const req: any = {
          headers: { 'pay-signature': 'test-signature' },
          body: { webhook_message_id: value },
        };

        const result = extractWebhookHeaders(req);

        expect(result.webhookId).toBeNull();
      });
    });

    it('should reject IDs with extra characters or whitespace', () => {
      const malformedIds = [
        'xs3h4s4qiq1k25p5cs2d6574thk',
        's3h4s4qiq1k25p5cs2d6574thkx',
        ' s3h4s4qiq1k25p5cs2d6574thk',
        's3h4s4qiq1k25p5cs2d6574thk ',
        's3h4s4qiq1k25p5cs2d6574thk\n',
        's3h4s4qiq1k25p5cs2d6574thk;',
      ];

      malformedIds.forEach((id) => {
        const req = {
          headers: { 'pay-signature': 'test-signature' },
          body: { webhook_message_id: id },
        };

        const result = extractWebhookHeaders(req);

        expect(result.webhookId).toBeNull();
      });
    });
  });

  describe('GOVUK_PAY_WEBHOOK_MESSAGE_ID_REGEX constant validation', () => {
    it('should match valid GOV.UK Pay webhook_message_id format', () => {
      VALID_GOVUK_PAY_IDS.forEach((id) => {
        expect(GOVUK_PAY_WEBHOOK_MESSAGE_ID_REGEX.test(id)).toBe(true);
      });
    });

    it('should reject invalid formats', () => {
      const invalidIds = [
        'not-a-valid-id',
        '550e8400-e29b-41d4-a716-446655440000',
        'UPPERCASEONLYABCDEFGHIJKLMN',
        '',
        'abc',
      ];

      invalidIds.forEach((id) => {
        expect(GOVUK_PAY_WEBHOOK_MESSAGE_ID_REGEX.test(id)).toBe(false);
      });
    });
  });

  describe('Security Compliance', () => {
    it('should prevent injection attacks in webhook_message_id', () => {
      const injectionPayloads = [
        "'; DROP TABLE payments; --",
        "1' UNION SELECT * FROM users--",
        "<script>alert('xss')</script>",
      ];

      injectionPayloads.forEach((payload) => {
        const req = {
          headers: { 'pay-signature': 'test-signature' },
          body: { webhook_message_id: payload },
        };

        const result = extractWebhookHeaders(req);

        expect(result.webhookId).toBeNull();
      });
    });

    it('should accept only GOV.UK Pay conforming webhook_message_id values', () => {
      const validId = 's3h4s4qiq1k25p5cs2d6574thk';
      const invalidInput = 'any-string-value';

      const validReq = {
        headers: { 'pay-signature': 'sig' },
        body: { webhook_message_id: validId },
      };

      const invalidReq = {
        headers: { 'pay-signature': 'sig' },
        body: { webhook_message_id: invalidInput },
      };

      expect(extractWebhookHeaders(validReq).webhookId).toBe(validId);
      expect(extractWebhookHeaders(invalidReq).webhookId).toBeNull();
    });
  });
});
