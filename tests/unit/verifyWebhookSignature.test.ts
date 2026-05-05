// Unit Tests for verifyWebhookSignature Function
// Tests HMAC-SHA256 signature verification for GOV.UK Pay webhooks

import crypto from 'crypto';

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

import { verifyWebhookSignature } from '../../src/middlewares/validateWebhookSignature';
import { WEBHOOK_SIGNING_ALGORITHM } from '../../src/constants';

describe('verifyWebhookSignature', () => {
  const signingKey = 'test-signing-key';

  it('should verify valid HMAC-SHA256 signature', () => {
    const body = JSON.stringify({ test: 'data', amount: 5000 });
    const validSignature = crypto
      .createHmac(WEBHOOK_SIGNING_ALGORITHM, signingKey)
      .update(body, 'utf-8')
      .digest('hex');

    const result = verifyWebhookSignature(validSignature, body, signingKey);

    expect(result).toBe(true);
  });

  it('should reject invalid signature', () => {
    const body = JSON.stringify({ test: 'data' });
    const invalidSignature = 'totally-wrong-signature';

    const result = verifyWebhookSignature(invalidSignature, body, signingKey);

    expect(result).toBe(false);
  });

  it('should reject signature for modified body', () => {
    const originalBody = JSON.stringify({ test: 'data', amount: 5000 });
    const modifiedBody = JSON.stringify({ test: 'data', amount: 9999 });
    const signature = crypto
      .createHmac(WEBHOOK_SIGNING_ALGORITHM, signingKey)
      .update(originalBody, 'utf-8')
      .digest('hex');

    const result = verifyWebhookSignature(signature, modifiedBody, signingKey);

    expect(result).toBe(false);
  });

  it('should handle signature verification errors gracefully', () => {
    const body = JSON.stringify({ test: 'data' });
    const signature = null as any;

    const result = verifyWebhookSignature(signature, body, signingKey);

    expect(result).toBe(false);
  });

  it('should reject empty signature', () => {
    const body = JSON.stringify({ test: 'data' });

    const result = verifyWebhookSignature('', body, signingKey);

    expect(result).toBe(false);
  });

  it('should verify signature with special characters in body', () => {
    const body = JSON.stringify({ 
      test: 'data with "quotes" and \n newlines',
      unicode: '€£¥',
    });
    const validSignature = crypto
      .createHmac(WEBHOOK_SIGNING_ALGORITHM, signingKey)
      .update(body, 'utf-8')
      .digest('hex');

    const result = verifyWebhookSignature(validSignature, body, signingKey);

    expect(result).toBe(true);
  });
});
