/**
 * AWS SQS Service
 * Sends webhook payloads to SQS queue for async processing by Lambda
 */

import { SQSClient, SendMessageCommand, SendMessageBatchCommand } from '@aws-sdk/client-sqs';
import getLogger from '../utils/loggerHelper';
import config from '../config/config';

const logger = getLogger(module);

/**
 * Initialize SQS Client
 */
let sqsClient: SQSClient | null = null;

function getSQSClient(): SQSClient {
  if (!sqsClient) {
    const clientConfig: any = {
      region: config.aws.region,
      credentials: config.aws.accessKeyId && config.aws.secretAccessKey
        ? {
            accessKeyId: config.aws.accessKeyId,
            secretAccessKey: config.aws.secretAccessKey,
          }
        : undefined, // Use default credentials chain if not provided
      apiVersion: '2012-11-05', // Force SQS API version for compatibility
    };

    // Add endpoint for LocalStack with proper configuration
    if (config.aws.endpoint) {
      clientConfig.endpoint = config.aws.endpoint;
      clientConfig.forcePathStyle = true; // Required for LocalStack
      clientConfig.disableHostPrefix = true; // Disable host prefix for LocalStack
      logger.info('[SQS] Using custom endpoint (LocalStack)', { endpoint: config.aws.endpoint });
    }

    sqsClient = new SQSClient(clientConfig);
  }
  return sqsClient;
}

/**
 * Send webhook payload to SQS queue
 */
export async function sendWebhookToSQS(webhookData: any): Promise<{ messageId: string; success: boolean }> {
  try {
    const client = getSQSClient();
    const queueUrl = config.aws.sqsQueueUrl;

    if (!queueUrl) {
      throw new Error('SQS Queue URL not configured');
    }

    // Prepare message in format expected by Lambda
    // Lambda expects: { webhook: {...}, metadata: {...} }
    const messageBody = {
      webhook: webhookData.payload, // The actual webhook event payload
      metadata: {
        webhookId: webhookData.webhookId,
        paymentId: webhookData.paymentId,
        eventType: webhookData.eventType,
        source: 'inbound-event-receiver',
        correlationId: webhookData.correlationId,
        timestamp: new Date().toISOString(),
      },
    };

    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(messageBody),
      MessageAttributes: {
        EventType: {
          DataType: 'String',
          StringValue: webhookData.eventType || 'webhook_event',
        },
        PaymentId: {
          DataType: 'String',
          StringValue: webhookData.paymentId || 'unknown',
        },
        WebhookId: {
          DataType: 'String',
          StringValue: webhookData.webhookId || 'unknown',
        },
        Source: {
          DataType: 'String',
          StringValue: 'inbound-event-receiver',
        },
      },
    });

    const response = await client.send(command);

    logger.info('[SQS] Message sent successfully', {
      messageId: response.MessageId,
      webhookId: webhookData.webhookId,
      paymentId: webhookData.paymentId,
      queueUrl: queueUrl,
    });

    return {
      messageId: response.MessageId || 'unknown',
      success: true,
    };
  } catch (error) {
    logger.error('[SQS] Failed to send message', {
      error: error instanceof Error ? error.message : String(error),
      webhookId: webhookData.webhookId,
      paymentId: webhookData.paymentId,
    });

    throw error;
  }
}

/**
 * Send multiple webhook payloads to SQS in batch
 */
export async function sendWebhookBatchToSQS(webhookDataArray: any[]): Promise<{ success: boolean; failed: number }> {
  try {
    const client = getSQSClient();
    const queueUrl = config.aws.sqsQueueUrl;

    if (!queueUrl) {
      throw new Error('SQS Queue URL not configured');
    }

    // SQS batch limit is 10 messages
    const batches = [];
    for (let i = 0; i < webhookDataArray.length; i += 10) {
      batches.push(webhookDataArray.slice(i, i + 10));
    }

    let failedCount = 0;

    for (const batch of batches) {
      const entries = batch.map((webhookData, index) => ({
        Id: `${webhookData.webhookId || index}`,
        MessageBody: JSON.stringify({
          webhookId: webhookData.webhookId,
          paymentId: webhookData.paymentId,
          eventType: webhookData.eventType,
          timestamp: new Date().toISOString(),
          payload: webhookData.payload,
          correlationId: webhookData.correlationId,
        }),
        MessageAttributes: {
          EventType: {
            DataType: 'String',
            StringValue: webhookData.eventType || 'webhook_event',
          },
          PaymentId: {
            DataType: 'String',
            StringValue: webhookData.paymentId || 'unknown',
          },
        },
      }));

      const command = new SendMessageBatchCommand({
        QueueUrl: queueUrl,
        Entries: entries,
      });

      const response = await client.send(command);

      if (response.Failed && response.Failed.length > 0) {
        failedCount += response.Failed.length;
        logger.warn('[SQS] Batch send had failures', {
          failed: response.Failed.length,
          successful: response.Successful?.length || 0,
        });
      }

      logger.info('[SQS] Batch sent', {
        total: entries.length,
        successful: response.Successful?.length || 0,
        failed: response.Failed?.length || 0,
      });
    }

    return {
      success: failedCount === 0,
      failed: failedCount,
    };
  } catch (error) {
    logger.error('[SQS] Failed to send batch', {
      error: error instanceof Error ? error.message : String(error),
      batchSize: webhookDataArray.length,
    });

    throw error;
  }
}

/**
 * Test SQS connection
 */
export async function testSQSConnection(): Promise<boolean> {
  try {
    const queueUrl = config.aws.sqsQueueUrl;
    
    if (!queueUrl) {
      logger.warn('[SQS] Queue URL not configured');
      return false;
    }

    // Try to send a test message
    const testMessage = {
      webhookId: 'test-connection',
      paymentId: 'test',
      eventType: 'connection_test',
      timestamp: new Date().toISOString(),
      payload: { test: true },
      correlationId: 'test-correlation-id',
    };

    await sendWebhookToSQS(testMessage);
    logger.info('[SQS] Connection test successful');
    return true;
  } catch (error) {
    logger.error('[SQS] Connection test failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

module.exports = {
  sendWebhookToSQS,
  sendWebhookBatchToSQS,
  testSQSConnection,
};
