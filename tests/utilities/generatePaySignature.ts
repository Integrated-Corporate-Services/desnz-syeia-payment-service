/**
 * Utility to Generate GOV.UK Pay Webhook Signature
 * 
 * This utility generates the HMAC-SHA256 signature for GOV.UK Pay webhooks
 * as specified in: https://docs.payments.service.gov.uk/webhooks/#verifying-webhook-messages-from-govuk-pay
 * 
 * Usage:
 *   import { generatePaySignature, createSignedWebhookRequest } from './generatePaySignature';
 *   
 *   const payload = { webhook_message_id: 'test', ... };
 *   const signature = generatePaySignature(payload, signingKey);
 */

import crypto from 'crypto';

/**
 * Generate HMAC-SHA256 signature for GOV.UK Pay webhook
 * 
 * The signature is a lower-case hexadecimal HMAC of the webhook message body,
 * generated using the SHA-256 hash function with the webhook signing secret as the key.
 * 
 * @param payload - Webhook payload object or JSON string
 * @param signingKey - GOV.UK Pay webhook signing secret
 * @returns Lower-case hexadecimal signature string
 * 
 * @example
 * ```typescript
 * const payload = {
 *   webhook_message_id: 'test-123',
 *   event_type: 'card_payment_captured',
 *   resource_id: 'pay-456',
 *   // ... other fields
 * };
 * 
 * const signature = generatePaySignature(payload, 'my-signing-key');
 * // Returns: 'a1b2c3d4...' (64-character hex string)
 * ```
 */
export function generatePaySignature(
  payload: Record<string, any> | string,
  signingKey: string
): string {
  // Convert payload to string if it's an object
  const payloadString = typeof payload === 'string' 
    ? payload 
    : JSON.stringify(payload);

  // Create HMAC using SHA-256 with the signing key
  const hmac = crypto.createHmac('sha256', signingKey);
  
  // Update HMAC with payload (UTF-8 encoded, no BOM)
  hmac.update(payloadString, 'utf-8');
  
  // Generate signature as lower-case hexadecimal string
  const signature = hmac.digest('hex');
  
  return signature;
}

/**
 * Verify if a signature is valid for a given payload
 * 
 * @param signature - The signature to verify
 * @param payload - Webhook payload object or JSON string
 * @param signingKey - GOV.UK Pay webhook signing secret
 * @returns true if signature is valid, false otherwise
 * 
 * @example
 * ```typescript
 * const isValid = verifyPaySignature(
 *   receivedSignature,
 *   webhookPayload,
 *   'my-signing-key'
 * );
 * ```
 */
export function verifyPaySignature(
  signature: string,
  payload: Record<string, any> | string,
  signingKey: string
): boolean {
  const expectedSignature = generatePaySignature(payload, signingKey);
  return signature === expectedSignature;
}

/**
 * Create a complete webhook request object with signature
 * Useful for testing API endpoints
 * 
 * @param payload - Webhook payload object
 * @param signingKey - GOV.UK Pay webhook signing secret
 * @param options - Additional request options (correlation ID, etc.)
 * @returns Object containing headers and body for HTTP request
 * 
 * @example
 * ```typescript
 * const request = createSignedWebhookRequest(
 *   { webhook_message_id: 'test-123', ... },
 *   'my-signing-key',
 *   { correlationId: 'corr-123' }
 * );
 * 
 * // Use with supertest:
 * await supertest(app)
 *   .post('/webhook')
 *   .set(request.headers)
 *   .send(request.body);
 * ```
 */
export function createSignedWebhookRequest(
  payload: Record<string, any>,
  signingKey: string,
  options: {
    correlationId?: string;
    additionalHeaders?: Record<string, string>;
  } = {}
): {
  headers: Record<string, string>;
  body: Record<string, any>;
  bodyString: string;
  signature: string;
} {
  const bodyString = JSON.stringify(payload);
  const signature = generatePaySignature(bodyString, signingKey);
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Pay-Signature': signature,
    ...(options.correlationId && { 'X-Correlation-Id': options.correlationId }),
    ...(options.additionalHeaders || {}),
  };

  return {
    headers,
    body: payload,
    bodyString,
    signature,
  };
}

/**
 * Create a sample GOV.UK Pay webhook payload for testing
 * 
 * @param overrides - Fields to override in the default payload
 * @returns Complete webhook payload matching GOV.UK Pay format
 * 
 * @example
 * ```typescript
 * const payload = createSampleWebhookPayload({
 *   webhook_message_id: 'custom-id',
 *   event_type: 'card_payment_succeeded'
 * });
 * ```
 */
export function createSampleWebhookPayload(
  overrides: Partial<{
    webhook_message_id: string;
    api_version: number;
    created_date: string;
    resource_id: string;
    resource_type: string;
    event_type: string;
    resource: Record<string, any>;
  }> = {}
): Record<string, any> {
  const timestamp = new Date().toISOString();
  const paymentId = overrides.resource_id || `pay-${Date.now()}`;
  
  return {
    webhook_message_id: overrides.webhook_message_id || `wh-${Date.now()}`,
    api_version: overrides.api_version || 1,
    created_date: overrides.created_date || timestamp,
    resource_id: paymentId,
    resource_type: overrides.resource_type || 'payment',
    event_type: overrides.event_type || 'card_payment_captured',
    resource: overrides.resource || {
      amount: 10000,
      description: 'Test payment',
      reference: `REF-${paymentId}`,
      language: 'en',
      email: 'test@example.com',
      state: {
        status: 'success',
        finished: true,
      },
      payment_id: paymentId,
      payment_provider: 'stripe',
      created_date: timestamp,
      refund_summary: {
        status: 'available',
        amount_available: 10000,
        amount_submitted: 0,
      },
      settlement_summary: {},
      delayed_capture: false,
      moto: false,
      return_url: 'https://your.service.gov.uk/completed',
    },
  };
}

/**
 * Helper to log signature details for debugging
 */
export function logSignatureDetails(
  payload: Record<string, any> | string,
  signingKey: string,
  receivedSignature?: string
): void {
  const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const expectedSignature = generatePaySignature(payloadString, signingKey);
  
  console.log('\n=== Pay-Signature Debug Info ===');
  console.log('Payload (first 100 chars):', payloadString.substring(0, 100) + '...');
  console.log('Payload length:', payloadString.length);
  console.log('Signing key (first 10 chars):', signingKey.substring(0, 10) + '...');
  console.log('Expected signature:', expectedSignature);
  
  if (receivedSignature) {
    console.log('Received signature:', receivedSignature);
    console.log('Signatures match:', expectedSignature === receivedSignature);
  }
  
  console.log('================================\n');
}
