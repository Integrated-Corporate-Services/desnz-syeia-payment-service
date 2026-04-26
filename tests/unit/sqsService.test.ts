/**
 * SQS Service Unit Tests
 * Tests for AWS SQS integration
 */

// Mock logger first
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

// Mock AWS SDK send function
const mockSend = jest.fn();

// Setup mocks before imports
jest.mock('../../src/utils/loggerHelper', () => {
  return jest.fn(() => mockLogger);
});

jest.mock('@aws-sdk/client-sqs', () => {
  return {
    SQSClient: jest.fn().mockImplementation(() => ({
      send: mockSend,
    })),
    SendMessageCommand: jest.fn().mockImplementation((input) => ({ input })),
    SendMessageBatchCommand: jest.fn().mockImplementation((input) => ({ input })),
  };
});

// Mock config with proper structure
const mockConfig = {
  aws: {
    region: 'eu-west-2',
    endpoint: 'http://localhost:4566',
    accessKeyId: 'test-key',
    secretAccessKey: 'test-secret',
    sqsQueueUrl: 'http://localhost:4566/000000000000/payment-webhook-queue',
  },
};

jest.mock('../../src/config/config', () => ({
  __esModule: true,
  default: mockConfig,
}));

// Import after mocks
import { sendWebhookToSQS, sendWebhookBatchToSQS, testSQSConnection } from '../../src/services/sqsService';
import { SendMessageCommand, SendMessageBatchCommand } from '@aws-sdk/client-sqs';

describe('SQS Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sendWebhookToSQS', () => {
    it('should send webhook message to SQS successfully', async () => {
      // Arrange
      const webhookData = {
        webhookId: 'webhook-123',
        paymentId: 'payment-456',
        eventType: 'payment.created',
        correlationId: 'corr-789',
        payload: {
          payment_id: 'payment-456',
          amount: 10000,
          status: 'success',
        },
      };

      const mockResponse = {
        MessageId: 'msg-123',
        MD5OfMessageBody: 'abc123',
      };

      mockSend.mockResolvedValue(mockResponse);

      // Act
      const result = await sendWebhookToSQS(webhookData);

      // Assert
      expect(result).toEqual({
        messageId: 'msg-123',
        success: true,
      });

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should format message body correctly for Lambda', async () => {
      // Arrange
      const webhookData = {
        webhookId: 'webhook-test',
        paymentId: 'payment-test',
        eventType: 'payment.created',
        correlationId: 'corr-test',
        payload: {
          payment_id: 'payment-test',
          amount: 5000,
        },
      };

      mockSend.mockResolvedValue({ MessageId: 'msg-789' });

      // Act
      await sendWebhookToSQS(webhookData);

      // Assert
      expect(mockSend).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        '[SQS] Message sent successfully',
        expect.objectContaining({
          messageId: 'msg-789',
          webhookId: 'webhook-test',
          paymentId: 'payment-test',
        })
      );
    });

    it('should handle SQS send errors gracefully', async () => {
      // Arrange
      const webhookData = {
        webhookId: 'webhook-fail',
        paymentId: 'payment-fail',
        eventType: 'payment.created',
        payload: {},
      };

      const mockError = new Error('SQS service unavailable');
      mockSend.mockRejectedValue(mockError);

      // Act & Assert
      await expect(sendWebhookToSQS(webhookData)).rejects.toThrow('SQS service unavailable');
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[SQS] Failed to send message',
        expect.objectContaining({
          error: 'SQS service unavailable',
        })
      );
    });
  });

  describe('sendWebhookBatchToSQS', () => {
    it('should send batch of webhooks successfully', async () => {
      // Arrange
      const webhookDataArray = [
        {
          webhookId: 'webhook-1',
          paymentId: 'payment-1',
          eventType: 'payment.created',
          payload: { amount: 1000 },
        },
        {
          webhookId: 'webhook-2',
          paymentId: 'payment-2',
          eventType: 'payment.confirmed',
          payload: { amount: 2000 },
        },
        {
          webhookId: 'webhook-3',
          paymentId: 'payment-3',
          eventType: 'payment.failed',
          payload: { amount: 3000 },
        },
      ];

      const mockResponse = {
        Successful: [
          { Id: 'webhook-1', MessageId: 'msg-1' },
          { Id: 'webhook-2', MessageId: 'msg-2' },
          { Id: 'webhook-3', MessageId: 'msg-3' },
        ],
        Failed: [],
      };

      mockSend.mockResolvedValue(mockResponse);

      // Act
      const result = await sendWebhookBatchToSQS(webhookDataArray);

      // Assert
      expect(result).toEqual({
        success: true,
        failed: 0,
      });

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should split large batches into chunks of 10', async () => {
      // Arrange
      const webhookDataArray = Array.from({ length: 25 }, (_, i) => ({
        webhookId: `webhook-${i}`,
        paymentId: `payment-${i}`,
        eventType: 'payment.created',
        payload: { index: i },
      }));

      const mockResponse = {
        Successful: [],
        Failed: [],
      };

      mockSend.mockResolvedValue(mockResponse);

      // Act
      await sendWebhookBatchToSQS(webhookDataArray);

      // Assert
      expect(mockSend).toHaveBeenCalledTimes(3); // 10 + 10 + 5
    });

    it('should handle partial batch failures', async () => {
      // Arrange
      const webhookDataArray = [
        { webhookId: 'webhook-1', paymentId: 'payment-1', eventType: 'payment.created', payload: {} },
        { webhookId: 'webhook-2', paymentId: 'payment-2', eventType: 'payment.created', payload: {} },
        { webhookId: 'webhook-3', paymentId: 'payment-3', eventType: 'payment.created', payload: {} },
      ];

      const mockResponse = {
        Successful: [
          { Id: 'webhook-1', MessageId: 'msg-1' },
          { Id: 'webhook-3', MessageId: 'msg-3' },
        ],
        Failed: [
          { Id: 'webhook-2', Code: 'InternalError', Message: 'Internal error' },
        ],
      };

      mockSend.mockResolvedValue(mockResponse);

      // Act
      const result = await sendWebhookBatchToSQS(webhookDataArray);

      // Assert
      expect(result).toEqual({
        success: false,
        failed: 1,
      });
    });
  });

  describe('testSQSConnection', () => {
    it('should return true when connection test succeeds', async () => {
      // Arrange
      mockSend.mockResolvedValue({ MessageId: 'test-msg-id' });

      // Act
      const result = await testSQSConnection();

      // Assert
      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('[SQS] Connection test successful');
    });

    it('should return false and log error when connection test fails', async () => {
      // Arrange
      const mockError = new Error('Connection timeout');
      mockSend.mockRejectedValue(mockError);

      // Act
      const result = await testSQSConnection();

      // Assert
      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});
