/**
 * Timestamp Validation - Extended Tests
 * 
 * Tests replay attack protection and timestamp edge cases.
 */

import request from 'supertest';
import createApp from '../../../../src/app';

const app = createApp();
import db from '../../../../src/database/db';
import { generateTimestamp, createBACSWebhookHeaders, cleanupTestWebhooks } from '../test-helpers';
import { WEBHOOK_ENDPOINT } from '../test-constants';

const SIGNING_SECRET = process.env.UKSBS_WEBHOOK_SIGNING_KEY || 'dev-uksbs-key-change-in-production';

describe('Timestamp Validation - Extended', () => {
  
  beforeAll(async () => await cleanupTestWebhooks(db));
  afterEach(async () => await cleanupTestWebhooks(db));
  afterAll(async () => {
    await cleanupTestWebhooks(db);
    await db.end();
  });

  test('Should accept webhook 4 minutes old (within ±5 minute window)', async () => {
    const payload = {
      event: { eventId: 'abc00301-0301-4000-8000-000000000001', eventType: 'PAYMENT_STATUS_UPDATE', eventVersion: '1.0', occurredAt: '2026-06-17T10:00:00.000Z', source: 'TEST' },
      payment: { paymentReference: 'PAY-TS-001' },
      detail: { status: 'PAID', amount: 100, currency: 'GBP', paymentDate: '2026-06-17' }
    };
    const bodyString = JSON.stringify(payload);
    const timestamp = generateTimestamp(-4); // 4 minutes ago
    const headers = createBACSWebhookHeaders(bodyString, SIGNING_SECRET, { timestamp });

    const response = await request(app)
      .post(WEBHOOK_ENDPOINT)
      .set(headers)
      .send(payload);

    expect(response.status).toBe(202);
    expect(response.body.received).toBe(true);
  });
});
