/**
 * Edge Cases - Extended Tests
 * 
 * Tests boundary conditions and deduplication scenarios.
 */

import request from 'supertest';
import createApp from '../../../../src/app';

const app = createApp();
import db from '../../../../src/database/db';
import { createBACSWebhookHeaders, cleanupTestWebhooks } from '../test-helpers';
import { WEBHOOK_ENDPOINT } from '../test-constants';

const SIGNING_SECRET = process.env.UKSBS_WEBHOOK_SIGNING_KEY || 'dev-uksbs-key-change-in-production';

describe('Edge Cases - Extended', () => {
  
  beforeAll(async () => await cleanupTestWebhooks(db));
  afterEach(async () => await cleanupTestWebhooks(db));
  afterAll(async () => {
    await cleanupTestWebhooks(db);
    await db.end();
  });

  test('Should deduplicate on eventId, not deliveryId (same event, different delivery)', async () => {
    const basePayload = {
      event: { eventId: 'abc00101-0101-4000-8000-000000000001', eventType: 'PAYMENT_STATUS_UPDATE', eventVersion: '1.0', occurredAt: '2026-06-17T10:00:00.000Z', source: 'TEST' },
      payment: { paymentReference: 'PAY-EDGE-001' },
      detail: { status: 'PAID', amount: 100, currency: 'GBP', paymentDate: '2026-06-17' }
    };

    // First request with deliveryId A
    const payload1 = { ...basePayload, callback: { deliveryId: 'def00101-0101-4000-8000-000000000001', attemptNumber: 1 } };
    const body1 = JSON.stringify(payload1);
    const headers1 = createBACSWebhookHeaders(body1, SIGNING_SECRET);

    const response1 = await request(app)
      .post(WEBHOOK_ENDPOINT)
      .set(headers1)
      .send(payload1);

    expect(response1.status).toBe(202);

    // Small delay to ensure first request commits to database
    await new Promise(resolve => setTimeout(resolve, 100));

    // Second request with deliveryId B (same eventId)
    const payload2 = { ...basePayload, callback: { deliveryId: 'def00102-0102-4000-8000-000000000002', attemptNumber: 2 } };
    const body2 = JSON.stringify(payload2);
    const headers2 = createBACSWebhookHeaders(body2, SIGNING_SECRET);

    const response2 = await request(app)
      .post(WEBHOOK_ENDPOINT)
      .set(headers2)
      .send(payload2);

    // Should be duplicate because eventId is the same
    expect(response2.status).toBe(200);
    expect(response2.body.duplicate).toBe(true);
  });
});
