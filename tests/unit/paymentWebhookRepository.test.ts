// Unit Tests for Payment Webhook Repository

import * as paymentWebhookRepository from '../../src/repositories/paymentWebhookRepository';

jest.mock('../../src/database/db');
jest.mock('../../src/utils/loggerHelper');

const db = require('../../src/database/db');

describe('PaymentWebhookRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createWebhook', () => {
    it('should create a webhook record successfully', async () => {
      // Arrange
      const webhookData = {
        webhook_id: 'evt_test_12345',
        payment_id: 'APP-001',
        event_type: 'PAYMENT_COMPLETED',
        status: 'processing',
        raw_payload: JSON.stringify({ test: 'data' }),
        retry_count: 0,
        max_retries: 3,
        correlation_id: 'corr_12345',
      };
      db.query = jest.fn().mockResolvedValue({ 
        rows: [{ webhook_id: 'evt_test_12345', status: 'processing', is_duplicate: false }] 
      });

      // Act
      const result = await paymentWebhookRepository.createWebhook(webhookData);

      // Assert
      expect(result.isDuplicate).toBe(false);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO payment_webhooks'),
        [
          webhookData.webhook_id,
          webhookData.payment_id,
          webhookData.event_type,
          webhookData.status,
          webhookData.raw_payload,
          webhookData.retry_count,
          webhookData.max_retries,
          webhookData.correlation_id,
        ]
      );
    });

    it('should detect duplicate webhooks', async () => {
      // Arrange
      const webhookData = {
        webhook_id: 'evt_test_duplicate',
        payment_id: 'APP-001',
        event_type: 'PAYMENT_COMPLETED',
        status: 'processing',
        raw_payload: JSON.stringify({ test: 'data' }),
        retry_count: 0,
        max_retries: 3,
        correlation_id: 'corr_12345',
      };
      db.query = jest.fn().mockResolvedValue({ 
        rows: [{ webhook_id: 'evt_test_duplicate', status: 'success', is_duplicate: true }] 
      });

      // Act
      const result = await paymentWebhookRepository.createWebhook(webhookData);

      // Assert
      expect(result.isDuplicate).toBe(true);
      expect(result.status).toBe('success');
    });

    it('should throw error when database query fails', async () => {
      // Arrange
      const webhookData = {
        webhook_id: 'evt_test_12345',
        payment_id: 'APP-001',
        event_type: 'PAYMENT_COMPLETED',
        status: 'processing',
        raw_payload: JSON.stringify({ test: 'data' }),
        retry_count: 0,
        max_retries: 3,
        correlation_id: 'corr_12345',
      };
      const dbError = new Error('Database connection failed');
      db.query = jest.fn().mockRejectedValue(dbError);

      // Act & Assert
      await expect(paymentWebhookRepository.createWebhook(webhookData)).rejects.toThrow(
        'Database connection failed'
      );
    });
  });

  describe('findByWebhookId', () => {
    it('should return webhook when found', async () => {
      // Arrange
      const webhookId = 'evt_test_12345';
      const mockWebhook = {
        webhook_id: webhookId,
        payment_id: 'APP-001',
        status: 'success',
      };
      db.query = jest.fn().mockResolvedValue({ rows: [mockWebhook] });

      // Act
      const result = await paymentWebhookRepository.findByWebhookId(webhookId);

      // Assert
      expect(result).toEqual(mockWebhook);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM payment_webhooks WHERE webhook_id'),
        [webhookId]
      );
    });

    it('should return null when webhook not found', async () => {
      // Arrange
      const webhookId = 'evt_not_found';
      db.query = jest.fn().mockResolvedValue({ rows: [] });

      // Act
      const result = await paymentWebhookRepository.findByWebhookId(webhookId);

      // Assert
      expect(result).toBeNull();
    });

    it('should throw error when database query fails', async () => {
      // Arrange
      const webhookId = 'evt_test_12345';
      const dbError = new Error('Database error');
      db.query = jest.fn().mockRejectedValue(dbError);

      // Act & Assert
      await expect(paymentWebhookRepository.findByWebhookId(webhookId)).rejects.toThrow(
        'Database error'
      );
    });
  });

  describe('updateWebhookStatus', () => {
    it('should update webhook status successfully', async () => {
      // Arrange
      const webhookId = 'evt_test_12345';
      const status = 'success';
      const metadata = { processedAt: new Date(), backendResponse: { ok: true } };
      db.query = jest.fn().mockResolvedValue({ rows: [] });

      // Act
      await paymentWebhookRepository.updateWebhookStatus(webhookId, status, metadata);

      // Assert
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE payment_webhooks'),
        [status, JSON.stringify(metadata), webhookId]
      );
    });

    it('should handle null metadata', async () => {
      // Arrange
      const webhookId = 'evt_test_12345';
      const status = 'success';
      db.query = jest.fn().mockResolvedValue({ rows: [] });

      // Act
      await paymentWebhookRepository.updateWebhookStatus(webhookId, status, null);

      // Assert
      expect(db.query).toHaveBeenCalledWith(expect.any(String), [status, null, webhookId]);
    });
  });

  describe('recordRetryableError', () => {
    it('should record retryable error and schedule next retry', async () => {
      // Arrange
      const webhookId = 'evt_test_12345';
      const errorMessage = 'Connection timeout';
      const retryIntervals = [5 * 60 * 1000, 10 * 60 * 1000, 15 * 60 * 1000];
      db.query = jest.fn().mockResolvedValue({ rows: [] });

      // Act
      await paymentWebhookRepository.recordRetryableError(webhookId, errorMessage, retryIntervals);

      // Assert
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE payment_webhooks'),
        [webhookId, errorMessage, expect.any(Date)]
      );
    });

    it('should use default retry interval if none provided', async () => {
      // Arrange
      const webhookId = 'evt_test_12345';
      const errorMessage = 'Connection timeout';
      db.query = jest.fn().mockResolvedValue({ rows: [] });

      // Act
      await paymentWebhookRepository.recordRetryableError(webhookId, errorMessage, []);

      // Assert
      expect(db.query).toHaveBeenCalled();
    });
  });

  describe('moveToDeadLetterQueue', () => {
    it('should move webhook to dead-letter queue', async () => {
      // Arrange
      const webhookId = 'evt_test_12345';
      const errorMessage = 'Invalid payment ID';
      db.query = jest.fn().mockResolvedValue({ rows: [] });

      // Act
      await paymentWebhookRepository.moveToDeadLetterQueue(webhookId, errorMessage);

      // Assert
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE payment_webhooks'),
        [webhookId, errorMessage]
      );
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'dead_letter'"),
        expect.any(Array)
      );
    });

    it('should throw error when database update fails', async () => {
      // Arrange
      const webhookId = 'evt_test_12345';
      const errorMessage = 'Invalid payment ID';
      const dbError = new Error('Database error');
      db.query = jest.fn().mockRejectedValue(dbError);

      // Act & Assert
      await expect(
        paymentWebhookRepository.moveToDeadLetterQueue(webhookId, errorMessage)
      ).rejects.toThrow('Database error');
    });
  });
});
