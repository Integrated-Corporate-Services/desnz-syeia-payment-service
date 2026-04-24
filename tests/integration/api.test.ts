// Integration Tests for Callback Service API
import request from 'supertest';
import crypto from 'crypto';
import { createApp } from '../../src/app';

jest.mock('../../src/database/db');
jest.mock('../../src/repositories/paymentWebhookRepository');
jest.mock('axios');

const axios = require('axios');
const paymentWebhookRepository = require('../../src/repositories/paymentWebhookRepository');

describe('Callback Service Integration Tests', () => {
  let app: any;
  const signingKey = 'test-signing-key';

  beforeAll(() => {
    process.env.GOVPAY_WEBHOOK_SIGNING_KEY = signingKey;
    app = createApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should return healthy status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'healthy',
        service: 'callback-service',
      });
    });
  });

  describe('GET /callback/health', () => {
    it('should return healthy status', async () => {
      const response = await request(app).get('/callback/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'healthy',
        service: 'callback-service',
      });
    });
  });

  describe('POST /callback/payment', () => {
    const webhookBody = {
      webhook_id: 'evt_test_12345',
      event_type: 'PAYMENT_COMPLETED',
      created_date: '2024-01-15T10:30:00Z',
      resource: {
        payment_id: 'pay_12345',
        external_id: 'APP-001',
        state: { status: 'success' },
      },
    };

    function generateSignature(body: any): string {
      const bodyString = JSON.stringify(body);
      return crypto
        .createHmac('sha256', signingKey)
        .update(bodyString, 'utf-8')
        .digest('hex');
    }

    it('should accept valid webhook', async () => {
      // Arrange
      const signature = generateSignature(webhookBody);
      paymentWebhookRepository.findByWebhookId.mockResolvedValue(null);
      paymentWebhookRepository.createWebhook.mockResolvedValue(undefined);
      paymentWebhookRepository.updateWebhookStatus.mockResolvedValue(undefined);
      axios.post.mockResolvedValue({
        status: 200,
        data: { success: true },
      });

      // Act
      const response = await request(app)
        .post('/callback/payment')
        .set('X-Webhook-Signature', signature)
        .set('X-Webhook-ID', webhookBody.webhook_id)
        .send(webhookBody);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'received',
        webhookId: webhookBody.webhook_id,
        paymentId: 'APP-001',
      });
    });

    it('should reject webhook with invalid signature', async () => {
      // Arrange
      const invalidSignature = 'invalid-signature-123';

      // Act
      const response = await request(app)
        .post('/callback/payment')
        .set('X-Webhook-Signature', invalidSignature)
        .set('X-Webhook-ID', webhookBody.webhook_id)
        .send(webhookBody);

      // Assert
      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error: expect.stringContaining('signature'),
      });
    });

    it('should reject webhook without signature', async () => {
      // Act
      const response = await request(app)
        .post('/callback/payment')
        .set('X-Webhook-ID', webhookBody.webhook_id)
        .send(webhookBody);

      // Assert
      expect(response.status).toBe(401);
    });

    it('should handle duplicate webhooks', async () => {
      // Arrange
      const signature = generateSignature(webhookBody);
      paymentWebhookRepository.findByWebhookId.mockResolvedValue({
        webhook_id: webhookBody.webhook_id,
        status: 'success',
      });

      // Act
      const response = await request(app)
        .post('/callback/payment')
        .set('X-Webhook-Signature', signature)
        .set('X-Webhook-ID', webhookBody.webhook_id)
        .send(webhookBody);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'received',
        isDuplicate: true,
      });
    });

    it('should return 202 for retryable errors', async () => {
      // Arrange
      const signature = generateSignature(webhookBody);
      paymentWebhookRepository.findByWebhookId.mockResolvedValue(null);
      paymentWebhookRepository.createWebhook.mockResolvedValue(undefined);
      paymentWebhookRepository.recordRetryableError.mockResolvedValue(undefined);

      interface ErrorWithCode extends Error {
        code?: string;
      }
      const backendError = new Error('Connection timeout') as ErrorWithCode;
      backendError.code = 'ETIMEDOUT';
      axios.post.mockRejectedValue(backendError);

      // Act
      const response = await request(app)
        .post('/callback/payment')
        .set('X-Webhook-Signature', signature)
        .set('X-Webhook-ID', webhookBody.webhook_id)
        .send(webhookBody);

      // Assert
      expect(response.status).toBe(202);
      expect(response.body).toMatchObject({
        status: 'retryable_error',
      });
    });
  });

  describe('404 Not Found', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app).get('/unknown-route');

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        error: 'Not found',
      });
    });
  });
});
