/**
 * Signature Validation - Extended Tests
 * 
 * Tests signature edge cases and security features.
 */

import request from 'supertest';
import createApp from '../../../../src/app';

const app = createApp();
import db from '../../../../src/database/db';
import { generateBACSSignature, generateTimestamp, createBACSWebhookHeaders, cleanupTestWebhooks } from '../test-helpers';
import { WEBHOOK_ENDPOINT } from '../test-constants';

const SIGNING_SECRET = process.env.UKSBS_WEBHOOK_SIGNING_KEY || 'dev-uksbs-key-change-in-production';

describe('Signature Validation - Extended', () => {
  
  beforeAll(async () => await cleanupTestWebhooks(db));
  afterEach(async () => await cleanupTestWebhooks(db));
  afterAll(async () => {
    await cleanupTestWebhooks(db);
    await db.end();
  });

  test('Should accept signature with leading/trailing whitespace (normalized)', async () => {
    const payload = {
      event: { eventId: 'abc00201-0201-4000-8000-000000000001', eventType: 'PAYMENT_STATUS_UPDATE', eventVersion: '1.0', occurredAt: '2026-06-17T10:00:00.000Z', source: 'TEST' },
      payment: { paymentReference: 'PAY-SIG-001' },
      detail: { status: 'PAID', amount: 100, currency: 'GBP', paymentDate: '2026-06-17' }
    };
    const bodyString = JSON.stringify(payload);
    const timestamp = generateTimestamp();
    const signature = generateBACSSignature(timestamp, bodyString, SIGNING_SECRET);
    
    // Add whitespace
    const signatureWithWhitespace = `  ${signature}  `;

    const response = await request(app)
      .post(WEBHOOK_ENDPOINT)
      .set('Content-Type', 'application/json')
      .set('X-Webhook-Signature', signatureWithWhitespace)
      .set('X-Request-Timestamp', timestamp)
      .set('X-Webhook-Signature-Version', 'v1')
      .send(payload);

    expect(response.status).toBe(202);
  });

  test('Should accept uppercase hex signature (case-insensitive)', async () => {
    const payload = {
      event: { eventId: 'abc00202-0202-4000-8000-000000000002', eventType: 'PAYMENT_STATUS_UPDATE', eventVersion: '1.0', occurredAt: '2026-06-17T10:00:00.000Z', source: 'TEST' },
      payment: { paymentReference: 'PAY-SIG-002' },
      detail: { status: 'PAID', amount: 100, currency: 'GBP', paymentDate: '2026-06-17' }
    };
    const bodyString = JSON.stringify(payload);
    const timestamp = generateTimestamp();
    const signature = generateBACSSignature(timestamp, bodyString, SIGNING_SECRET);
    
    // Convert to uppercase
    const uppercaseSig = signature.toUpperCase();

    const response = await request(app)
      .post(WEBHOOK_ENDPOINT)
      .set('Content-Type', 'application/json')
      .set('X-Webhook-Signature', uppercaseSig)
      .set('X-Request-Timestamp', timestamp)
      .set('X-Webhook-Signature-Version', 'v1')
      .send(payload);

    expect(response.status).toBe(202);
  });

  test('Should reject signature computed over different body (mutation detection)', async () => {
    const bodyA = JSON.stringify({
      event: { eventId: 'abc00203-0203-4000-8000-000000000003', eventType: 'PAYMENT_STATUS_UPDATE', eventVersion: '1.0', occurredAt: '2026-06-17T10:00:00.000Z', source: 'TEST' },
      payment: { paymentReference: 'PAY-SIG-003A' },
      detail: { status: 'PAID', amount: 100, currency: 'GBP', paymentDate: '2026-06-17' }
    });
    
    const bodyB = JSON.stringify({
      event: { eventId: 'abc00204-0204-4000-8000-000000000004', eventType: 'PAYMENT_STATUS_UPDATE', eventVersion: '1.0', occurredAt: '2026-06-17T10:00:00.000Z', source: 'TEST' },
      payment: { paymentReference: 'PAY-SIG-003B' },
      detail: { status: 'PAID', amount: 100, currency: 'GBP', paymentDate: '2026-06-17' }
    });
    
    const timestamp = generateTimestamp();
    // Sign body A
    const signatureForA = generateBACSSignature(timestamp, bodyA, SIGNING_SECRET);
    
    // Send body B with A's signature
    const response = await request(app)
      .post(WEBHOOK_ENDPOINT)
      .set('Content-Type', 'application/json')
      .set('X-Webhook-Signature', signatureForA)
      .set('X-Request-Timestamp', timestamp)
      .set('X-Webhook-Signature-Version', 'v1')
      .send(JSON.parse(bodyB));

    expect(response.status).toBe(401);
    expect(response.body.error).toContain('signature');
  });

  test('Should reject truncated hex signature (valid hex, wrong length)', async () => {
    const payload = {
      event: { eventId: 'sig-test-004', eventType: 'PAYMENT_STATUS_UPDATE', eventVersion: '1.0', occurredAt: '2026-06-17T10:00:00.000Z', source: 'TEST' },
      payment: { paymentReference: 'PAY-SIG-004' },
      detail: { status: 'PAID', amount: 100, currency: 'GBP', paymentDate: '2026-06-17' }
    };
    const bodyString = JSON.stringify(payload);
    const timestamp = generateTimestamp();
    const signature = generateBACSSignature(timestamp, bodyString, SIGNING_SECRET);
    
    // Truncate signature
    const truncatedSig = signature.substring(0, 32); // Only half

    const response = await request(app)
      .post(WEBHOOK_ENDPOINT)
      .set('Content-Type', 'application/json')
      .set('X-Webhook-Signature', truncatedSig)
      .set('X-Request-Timestamp', timestamp)
      .set('X-Webhook-Signature-Version', 'v1')
      .send(payload);

    expect(response.status).toBe(401);
  });
});
