/**
 * BACS Webhook Integration Test Helpers
 * Utilities for testing BACS webhook endpoint
 */

import crypto from 'crypto';
import { Request, Response } from 'express';

/**
 * Generate HMAC-SHA256 signature for BACS webhook
 * Format: HMAC-SHA256(timestamp + "." + rawBody, secret)
 */
export function generateBACSSignature(
  timestamp: string,
  body: string,
  secret: string
): string {
  const message = `${timestamp}.${body}`;
  return crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('hex');
}

/**
 * Generate valid ISO 8601 UTC timestamp
 */
export function generateTimestamp(offsetMinutes: number = 0): string {
  const date = new Date();
  date.setMinutes(date.getMinutes() + offsetMinutes);
  return date.toISOString();
}

/**
 * Create test headers for BACS webhook request
 */
export function createBACSWebhookHeaders(
  body: string,
  secret: string,
  options: {
    timestamp?: string;
    signature?: string;
    version?: string;
    correlationId?: string;
  } = {}
): Record<string, string> {
  const timestamp = options.timestamp || generateTimestamp();
  const signature = options.signature || generateBACSSignature(timestamp, body, secret);

  return {
    'Content-Type': 'application/json',
    'X-Webhook-Signature': signature,
    'X-Request-Timestamp': timestamp,
    'X-Webhook-Signature-Version': options.version || 'v1',
    ...(options.correlationId && { 'X-Correlation-Id': options.correlationId }),
  };
}

/**
 * Load JSON fixture file
 */
export function loadFixture(fixturePath: string): any {
  return require(fixturePath);
}

/**
 * Validate minimal response format
 */
export function validateMinimalResponse(
  body: any,
  expectedFields: string[]
): boolean {
  const actualFields = Object.keys(body);
  
  // Check all expected fields exist
  for (const field of expectedFields) {
    if (!actualFields.includes(field)) {
      return false;
    }
  }
  
  // Check no extra fields (minimal format)
  for (const field of actualFields) {
    if (!expectedFields.includes(field)) {
      return false;
    }
  }
  
  return true;
}

/**
 * UUID validation regex
 */
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validate UUID format
 */
export function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

/**
 * Mock Express request object
 */
export function createMockRequest(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    body: {},
    headers: {},
    method: 'POST',
    url: '/webhooks/bacs/payments',
    ...overrides,
  };
}

/**
 * Mock Express response object
 */
export function createMockResponse(): Partial<Response> {
  const res: any = {
    statusCode: 200,
    body: {},
  };

  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  });

  res.json = jest.fn((data: any) => {
    res.body = data;
    return res;
  });

  res.send = jest.fn((data: any) => {
    res.body = data;
    return res;
  });

  return res;
}

/**
 * Wait for async operations to complete
 */
export function waitFor(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Database cleanup helper
 */
export async function cleanupTestWebhooks(db: any): Promise<void> {
  // Delete all test webhooks (test-% pattern or abc00% pattern for integration tests)
  await db.query("DELETE FROM payment_webhooks WHERE webhook_id LIKE 'test-%' OR webhook_id LIKE 'abc00%'");
}

/**
 * Verify database record exists
 */
export async function verifyWebhookInDatabase(
  db: any,
  webhookId: string
): Promise<any> {
  const result = await db.query(
    'SELECT * FROM payment_webhooks WHERE webhook_id = $1',
    [webhookId]
  );
  return result.rows[0];
}
