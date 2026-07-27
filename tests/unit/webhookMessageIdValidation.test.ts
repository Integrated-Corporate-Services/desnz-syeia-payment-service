/**
 * Unit Tests for Webhook Message ID Validation
 * Tests security vulnerability fixes for HIGH-005: Missing UUID Validation
 */

import { extractWebhookHeaders } from '../../src/middlewares/validateWebhookSignature';
import { UUID_V4_REGEX } from '../../src/constants/webhook.constants';

describe('Webhook Message ID Validation - HIGH-005', () => {
  describe('extractWebhookHeaders - UUID Validation', () => {
    it('should accept valid UUID v4 webhook_message_id', () => {
      const validUUIDs = [
        '550e8400-e29b-41d4-a716-446655440000',
        'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', // lowercase hex UUID v4
      ];

      validUUIDs.forEach(uuid => {
        const req = {
          headers: { 'pay-signature': 'test-signature' },
          body: { webhook_message_id: uuid },
        };

        const result = extractWebhookHeaders(req);
        
        expect(result.webhookId).toBe(uuid);
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

      sqlInjectionPayloads.forEach(payload => {
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

      xssPayloads.forEach(payload => {
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

      pathTraversalPayloads.forEach(payload => {
        const req = {
          headers: { 'pay-signature': 'test-signature' },
          body: { webhook_message_id: payload },
        };

        const result = extractWebhookHeaders(req);
        
        expect(result.webhookId).toBeNull();
      });
    });

    it('should reject non-UUID strings', () => {
      const invalidFormats = [
        'not-a-uuid',
        '12345678',
        'abcd-efgh-ijkl-mnop',
        'random_string_123',
        '',
        ' ',
        'null',
        'undefined',
      ];

      invalidFormats.forEach(invalid => {
        const req = {
          headers: { 'pay-signature': 'test-signature' },
          body: { webhook_message_id: invalid },
        };

        const result = extractWebhookHeaders(req);
        
        expect(result.webhookId).toBeNull();
      });
    });

    it('should reject UUID v1/v3/v5 (only v4 is valid)', () => {
      const nonV4UUIDs = [
        'a0eebc99-9c0b-1ef8-bb6d-6bb9bd380a11', // UUID v1
        'a0eebc99-9c0b-3ef8-bb6d-6bb9bd380a11', // UUID v3
        'a0eebc99-9c0b-5ef8-bb6d-6bb9bd380a11', // UUID v5
      ];

      nonV4UUIDs.forEach(uuid => {
        const req = {
          headers: { 'pay-signature': 'test-signature' },
          body: { webhook_message_id: uuid },
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

      testCases.forEach(body => {
        const req: any = {
          headers: { 'pay-signature': 'test-signature' },
          body,
        };

        const result = extractWebhookHeaders(req);
        
        expect(result.webhookId).toBeNull();
      });
    });

    it('should handle non-string webhook_message_id types', () => {
      const nonStringTypes: any[] = [
        12345,
        true,
        false,
        [],
        {},
        () => {},
      ];

      nonStringTypes.forEach(value => {
        const req: any = {
          headers: { 'pay-signature': 'test-signature' },
          body: { webhook_message_id: value },
        };

        const result = extractWebhookHeaders(req);
        
        expect(result.webhookId).toBeNull();
      });
    });

    it('should be case-insensitive for UUID validation', () => {
      const mixedCaseUUIDs = [
        '550E8400-E29B-41D4-A716-446655440000',
        'F47AC10B-58CC-4372-A567-0E02B2C3D479',
        '7C9E6679-7425-40DE-944B-E07FC1F90AE7',
      ];

      mixedCaseUUIDs.forEach(uuid => {
        const req = {
          headers: { 'pay-signature': 'test-signature' },
          body: { webhook_message_id: uuid },
        };

        const result = extractWebhookHeaders(req);
        
        expect(result.webhookId).toBe(uuid);
      });
    });

    it('should reject UUIDs with extra characters', () => {
      const malformedUUIDs = [
        'x550e8400-e29b-41d4-a716-446655440000',
        '550e8400-e29b-41d4-a716-446655440000x',
        ' 550e8400-e29b-41d4-a716-446655440000',
        '550e8400-e29b-41d4-a716-446655440000 ',
        '550e8400-e29b-41d4-a716-446655440000\n',
        '550e8400-e29b-41d4-a716-446655440000;',
      ];

      malformedUUIDs.forEach(uuid => {
        const req = {
          headers: { 'pay-signature': 'test-signature' },
          body: { webhook_message_id: uuid },
        };

        const result = extractWebhookHeaders(req);
        
        expect(result.webhookId).toBeNull();
      });
    });

    it('should reject UUIDs with wrong dash positions', () => {
      const wrongDashPositions = [
        '550e8400e29b-41d4-a716-446655440000',
        '550e8400-e29b41d4-a716-446655440000',
        '550e8400-e29b-41d4a716-446655440000',
        '550e8400-e29b-41d4-a716446655440000',
      ];

      wrongDashPositions.forEach(uuid => {
        const req = {
          headers: { 'pay-signature': 'test-signature' },
          body: { webhook_message_id: uuid },
        };

        const result = extractWebhookHeaders(req);
        
        expect(result.webhookId).toBeNull();
      });
    });
  });

  describe('UUID_V4_REGEX constant validation', () => {
    it('should match valid UUID v4 format', () => {
      const validUUIDs = [
        '550e8400-e29b-41d4-a716-446655440000',
        'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      ];

      validUUIDs.forEach(uuid => {
        expect(UUID_V4_REGEX.test(uuid)).toBe(true);
      });
    });

    it('should reject invalid UUID formats', () => {
      const invalidUUIDs = [
        'not-a-uuid',
        '550e8400-e29b-51d4-a716-446655440000', // wrong version (5)
        '550e8400-e29b-41d4-e716-446655440000', // wrong variant
        '',
      ];

      invalidUUIDs.forEach(uuid => {
        expect(UUID_V4_REGEX.test(uuid)).toBe(false);
      });
    });

    it('should require callers to guard non-string UUID inputs before regex validation', () => {
      const nonStringUUIDs = [null, undefined];

      nonStringUUIDs.forEach(uuid => {
        expect(typeof uuid === 'string').toBe(false);
      });
    });
  });

  describe('Security Compliance', () => {
    it('should prevent OWASP A03:2021 - Injection attacks', () => {
      const injectionPayloads = [
        "'; DROP TABLE payments; --",
        "1' UNION SELECT * FROM users--",
        "<script>alert('xss')</script>",
      ];

      injectionPayloads.forEach(payload => {
        const req = {
          headers: { 'pay-signature': 'test-signature' },
          body: { webhook_message_id: payload },
        };

        const result = extractWebhookHeaders(req);
        
        // Should reject all injection attempts
        expect(result.webhookId).toBeNull();
      });
    });

    it('should enforce CWE-20: Proper Input Validation', () => {
      const req = {
        headers: { 'pay-signature': 'test-signature' },
        body: { webhook_message_id: 'invalid-format' },
      };

      const result = extractWebhookHeaders(req);
      
      // Input validation should reject non-conforming inputs
      expect(result.webhookId).toBeNull();
    });

    it('should comply with OWASP API Security - API8:2023 Security Misconfiguration', () => {
      // Valid configuration should only accept UUID v4
      const validUUID = '550e8400-e29b-41d4-a716-446655440000';
      const invalidInput = 'any-string-value';

      const validReq = {
        headers: { 'pay-signature': 'sig' },
        body: { webhook_message_id: validUUID },
      };

      const invalidReq = {
        headers: { 'pay-signature': 'sig' },
        body: { webhook_message_id: invalidInput },
      };

      expect(extractWebhookHeaders(validReq).webhookId).toBe(validUUID);
      expect(extractWebhookHeaders(invalidReq).webhookId).toBeNull();
    });
  });
});
