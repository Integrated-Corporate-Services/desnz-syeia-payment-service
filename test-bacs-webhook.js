// Test UKSBS Webhook Endpoint with Node.js
const crypto = require('crypto');
const https = require('http');

const secret = 'dev-uksbs-key-change-in-production';
const timestamp = new Date().toISOString();

const payload = {
  event: {
    eventId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    eventType: 'PAYMENT_STATUS_UPDATE',
    eventVersion: '1.0',
    occurredAt: timestamp,
    source: 'PARTNER-SYSTEM'
  },
  callback: {
    deliveryId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
    attemptNumber: 1
  },
  payment: {
    paymentReference: 'PAY-2026-00123456'
  },
  detail: {
    status: 'PAID',
    amount: 125000,
    currency: 'GBP',
    paymentDate: '2026-06-17',
    transferReference: 'TRF20260617001'
  }
};

// Convert to JSON (exact format that will be sent)
const body = JSON.stringify(payload);

// Create signed message: timestamp + "." + body
const signedMessage = timestamp + '.' + body;

// Compute HMAC-SHA256 signature
const signature = crypto
  .createHmac('sha256', secret)
  .update(signedMessage, 'utf8')
  .digest('hex');

console.log('===================================================');
console.log('UKSBS Webhook Test (Node.js)');
console.log('===================================================');
console.log('Timestamp:', timestamp);
console.log('Signature:', signature);
console.log('Body length:', body.length, 'bytes');
console.log('Signed message length:', signedMessage.length, 'bytes');
console.log('\nSending request to: http://localhost:3001/webhooks/payments/payment');
console.log('---------------------------------------------------');

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/webhooks/payments/payment',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'X-Webhook-Signature': signature,
    'X-Request-Timestamp': timestamp,
    'X-Webhook-Signature-Version': 'v1',
    'X-Correlation-Id': 'nodejs-test-001'
  }
};

const req = https.request(options, (res) => {
  console.log('\nâ SUCCESS!');
  console.log('Status Code:', res.statusCode);
  console.log('\nResponse Headers:');
  console.log(JSON.stringify(res.headers, null, 2));
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('\nResponse Body:');
    try {
      console.log(JSON.stringify(JSON.parse(data), null, 2));
    } catch (e) {
      console.log(data);
    }
    console.log('\n===================================================');
  });
});

req.on('error', (error) => {
  console.error('\nâ ERROR!');
  console.error('Error:', error.message);
  console.log('\n===================================================');
});

req.write(body);
req.end();
