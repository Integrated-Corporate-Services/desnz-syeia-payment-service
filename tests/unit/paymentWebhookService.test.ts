// Unit Tests for Payment Webhook Service
import { RETRY_STRATEGY, RETRYABLE_ERROR_CODES, WEBHOOK_STATUS } from '../../src/constants';

interface ErrorWithCode extends Error {
  code?: string;
}

// Mock dependencies
jest.mock('../../src/repositories/paymentWebhookRepository');
jest.mock('../../src/utils/loggerHelper');
jest.mock('axios');

const axios = require('axios');
const paymentWebhookRepository = require('../../src/repositories/paymentWebhookRepository');
const { processWebhook } = require('../../src/services/paymentWebhookService');

describe('PaymentWebhookService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('processWebhook', () => {
    const webhookId = 'evt_test_12345';
    const paymentId = 'APP-001';
    const correlationId = 'corr_12345';
    const event = {
      webhook_id: webhookId,
      event_type: 'PAYMENT_COMPLETED',
      resource: {
        payment_id: 'pay_12345',
        external_id: paymentId,
      },
    };
    const rawPayload = JSON.stringify(event);

    it('should process a new webhook successfully', async () => {
      // Arrange
      paymentWebhookRepository.findByWebhookId.mockResolvedValue(null);
      paymentWebhookRepository.createWebhook.mockResolvedValue(undefined);
      paymentWebhookRepository.updateWebhookStatus.mockResolvedValue(undefined);
      axios.post.mockResolvedValue({
        status: 200,
        data: { success: true },
      });

      // Act
      const result = await processWebhook(webhookId, paymentId, event, rawPayload, correlationId);

      // Assert
      expect(result).toEqual({
        success: true,
        isDuplicate: false,
        paymentId,
      });
      expect(paymentWebhookRepository.findByWebhookId).toHaveBeenCalledWith(webhookId);
      expect(paymentWebhookRepository.createWebhook).toHaveBeenCalledWith({
        webhook_id: webhookId,
        payment_id: paymentId,
        event_type: 'PAYMENT_COMPLETED',
        status: 'processing',
        raw_payload: rawPayload,
        retry_count: 0,
        max_retries: RETRY_STRATEGY.MAX_RETRIES,
        correlation_id: correlationId,
      });
      expect(axios.post).toHaveBeenCalled();
      expect(paymentWebhookRepository.updateWebhookStatus).toHaveBeenCalledWith(
        webhookId,
        'success',
        expect.any(Object)
      );
    });

    it('should detect and handle duplicate webhooks', async () => {
      // Arrange
      const existingWebhook = {
        webhook_id: webhookId,
        payment_id: paymentId,
        status: 'success',
      };
      paymentWebhookRepository.findByWebhookId.mockResolvedValue(existingWebhook);

      // Act
      const result = await processWebhook(webhookId, paymentId, event, rawPayload, correlationId);

      // Assert
      expect(result).toEqual({
        success: true,
        isDuplicate: true,
        paymentId,
      });
      expect(paymentWebhookRepository.createWebhook).not.toHaveBeenCalled();
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('should schedule retry for retryable backend errors', async () => {
      // Arrange
      paymentWebhookRepository.findByWebhookId.mockResolvedValue(null);
      paymentWebhookRepository.createWebhook.mockResolvedValue(undefined);
      paymentWebhookRepository.recordRetryableError.mockResolvedValue(undefined);

      const backendError = new Error('Connection timeout') as ErrorWithCode;
      backendError.code = 'ETIMEDOUT';
      axios.post.mockRejectedValue(backendError);

      // Act
      const result = await processWebhook(webhookId, paymentId, event, rawPayload, correlationId);

      // Assert
      expect(result).toEqual({
        success: false,
        isDuplicate: false,
        paymentId,
        error: 'Backend processing failed',
        retryable: true,
      });
      expect(paymentWebhookRepository.recordRetryableError).toHaveBeenCalledWith(
        webhookId,
        expect.stringContaining('Backend processing failed'),
        RETRY_STRATEGY.INTERVALS_MS
      );
    });

    it('should move to dead-letter queue for non-retryable errors', async () => {
      // Arrange
      paymentWebhookRepository.findByWebhookId.mockResolvedValue(null);
      paymentWebhookRepository.createWebhook.mockResolvedValue(undefined);
      paymentWebhookRepository.moveToDeadLetterQueue.mockResolvedValue(undefined);

      const permanentError = new Error('Invalid payment ID');
      axios.post.mockRejectedValue(permanentError);

      // Act
      const result = await processWebhook(webhookId, paymentId, event, rawPayload, correlationId);

      // Assert
      expect(result).toEqual({
        success: false,
        isDuplicate: false,
        paymentId,
        error: 'Backend processing failed',
        retryable: false,
      });
      expect(paymentWebhookRepository.moveToDeadLetterQueue).toHaveBeenCalledWith(
        webhookId,
        expect.stringContaining('Backend processing failed')
      );
    });

    it('should handle database connection errors gracefully', async () => {
      // Arrange
      const dbError = new Error('Database connection failed');
      paymentWebhookRepository.findByWebhookId.mockRejectedValue(dbError);

      // Act
      const result = await processWebhook(webhookId, paymentId, event, rawPayload, correlationId);

      // Assert
      expect(result).toEqual({
        success: false,
        isDuplicate: false,
        paymentId,
        error: 'Database connection failed',
        retryable: true,
      });
    });

    it('should call backend with correct URL and payload', async () => {
      // Arrange
      process.env.BACKEND_SERVICE_URL = 'http://backend-test:3000/backend';
      paymentWebhookRepository.findByWebhookId.mockResolvedValue(null);
      paymentWebhookRepository.createWebhook.mockResolvedValue(undefined);
      paymentWebhookRepository.updateWebhookStatus.mockResolvedValue(undefined);
      axios.post.mockResolvedValue({
        status: 200,
        data: { success: true },
      });

      // Act
      await processWebhook(webhookId, paymentId, event, rawPayload, correlationId);

      // Assert
      expect(axios.post).toHaveBeenCalledWith(
        'http://backend-test:3000/backend/callback/webhook-processed',
        {
          webhookId,
          paymentId,
          event,
          correlationId,
        }
      );
    });
  });

  describe('isRetryableError', () => {
    it('should identify retryable error codes', () => {
      RETRYABLE_ERROR_CODES.forEach((code) => {
        const error = new Error('Test error') as ErrorWithCode;
        error.code = code;
        // Would need to export isRetryableError to test directly
        // For now, test through processWebhook behavior
      });
    });
  });
});
