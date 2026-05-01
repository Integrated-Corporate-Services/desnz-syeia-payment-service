/**
 * JavaScript/Node.js Utility to Generate GOV.UK Pay Webhook Signature
 * 
 * This is a plain JavaScript version (no TypeScript) that can be used directly
 * in Node.js scripts, curl commands, or Postman pre-request scripts.
 * 
 * Usage in Node.js:
 *   const { generatePaySignature, createSamplePayload } = require('./generatePaySignature');
 *   const payload = createSamplePayload();
 *   const signature = generatePaySignature(payload, 'your-signing-key');
 * 
 * Usage in command line:
 *   node generatePaySignature.js
 */

const crypto = require('crypto');

/**
 * Generate HMAC-SHA256 signature for GOV.UK Pay webhook
 */
function generatePaySignature(payload, signingKey) {
  const payloadString = typeof payload === 'string' 
    ? payload 
    : JSON.stringify(payload);

  const hmac = crypto.createHmac('sha256', signingKey);
  hmac.update(payloadString, 'utf-8');
  return hmac.digest('hex');
}

/**
 * Verify signature
 */
function verifyPaySignature(signature, payload, signingKey) {
  const expectedSignature = generatePaySignature(payload, signingKey);
  return signature === expectedSignature;
}

/**
 * Create sample webhook payload
 */
function createSamplePayload(overrides = {}) {
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
 * Create curl command for testing
 */
function generateCurlCommand(webhookUrl, payload, signingKey) {
  const payloadString = JSON.stringify(payload);
  const signature = generatePaySignature(payloadString, signingKey);
  
  return `curl -X POST ${webhookUrl} \\
  -H "Content-Type: application/json" \\
  -H "Pay-Signature: ${signature}" \\
  -H "X-Correlation-Id: test-${Date.now()}" \\
  -d '${payloadString.replace(/'/g, "'\\''")}'`;
}

// CLI Mode - Run this script directly
if (require.main === module) {
  console.log('=== GOV.UK Pay Signature Generator ===\n');
  
  // Example configuration
  const signingKey = process.env.GOVPAY_WEBHOOK_SIGNING_KEY || 'test-signing-key-change-in-production';
  const webhookUrl = process.env.WEBHOOK_URL || 'http://localhost:3001/callback/payment';
  
  // Create sample payload
  const payload = createSamplePayload({
    webhook_message_id: `cli-test-${Date.now()}`,
    event_type: 'card_payment_captured',
  });
  
  // Generate signature
  const signature = generatePaySignature(payload, signingKey);
  
  console.log('1. Webhook Payload:');
  console.log(JSON.stringify(payload, null, 2));
  console.log('\n2. Signing Key (first 20 chars):', signingKey.substring(0, 20) + '...');
  console.log('\n3. Generated Pay-Signature:');
  console.log(signature);
  console.log('\n4. Curl Command:');
  console.log(generateCurlCommand(webhookUrl, payload, signingKey));
  console.log('\n5. PowerShell Command:');
  
  const payloadJson = JSON.stringify(payload).replace(/"/g, '""');
  console.log(`$payload = '${JSON.stringify(payload)}'
$hmac = [System.Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes("${signingKey}"))
$signature = -join ($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($payload)) | ForEach-Object { $_.ToString("x2") })
Invoke-RestMethod -Uri ${webhookUrl} -Method POST -Headers @{"Pay-Signature"=$signature;"Content-Type"="application/json"} -Body $payload`);
  
  console.log('\n=====================================\n');
}

// Export for use as module
module.exports = {
  generatePaySignature,
  verifyPaySignature,
  createSamplePayload,
  generateCurlCommand,
};
