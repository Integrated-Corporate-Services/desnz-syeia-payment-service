/**
 * Schema Validation - Extended Tests
 * 
 * Tests payload structure validation and field constraints.
 */

import request from 'supertest';
import createApp from '../../../../src/app';

const app = createApp();
import db from '../../../../src/database/db';
import { createBACSWebhookHeaders, loadFixture, cleanupTestWebhooks } from '../test-helpers';
import { WEBHOOK_ENDPOINT } from '../test-constants';

const SIGNING_SECRET = process.env.UKSBS_WEBHOOK_SIGNING_KEY || 'dev-uksbs-key-change-in-production';

describe('Schema Validation - Extended', () => {
  
  beforeAll(async () => await cleanupTestWebhooks(db));
  afterEach(async () => await cleanupTestWebhooks(db));
  afterAll(async () => {
    await cleanupTestWebhooks(db);
    await db.end();
  });

  test('Should reject non-UUID eventId with 422', async () => {
    const payload = loadFixture('./fixtures/requests/schema-failure-non-uuid-eventid.json');
    const bodyString = JSON.stringify(payload);
    const headers = createBACSWebhookHeaders(bodyString, SIGNING_SECRET);

    const response = await request(app)
      .post(WEBHOOK_ENDPOINT)
      .set(headers)
      .send(payload);

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('Schema validation failed');
  });

  test('Should reject invalid eventType with 422', async () => {
    const payload = loadFixture('./fixtures/requests/schema-failure-invalid-event-type.json');
    const bodyString = JSON.stringify(payload);
    const headers = createBACSWebhookHeaders(bodyString, SIGNING_SECRET);

    const response = await request(app)
      .post(WEBHOOK_ENDPOINT)
      .set(headers)
      .send(payload);

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('Schema validation failed');
  });

  test('Should reject invalid status value with 422', async () => {
    const payload = loadFixture('./fixtures/requests/schema-failure-invalid-status.json');
    const bodyString = JSON.stringify(payload);
    const headers = createBACSWebhookHeaders(bodyString, SIGNING_SECRET);

    const response = await request(app)
      .post(WEBHOOK_ENDPOINT)
      .set(headers)
      .send(payload);

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('Schema validation failed');
  });

  test('Should reject negative amount with 422', async () => {
    const payload = loadFixture('./fixtures/requests/schema-failure-negative-amount.json');
    const bodyString = JSON.stringify(payload);
    const headers = createBACSWebhookHeaders(bodyString, SIGNING_SECRET);

    const response = await request(app)
      .post(WEBHOOK_ENDPOINT)
      .set(headers)
      .send(payload);

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('Schema validation failed');
  });

  test('Should reject missing event object with 422', async () => {
    const payload = {
      payment: { paymentReference: 'TEST-PAY' },
      detail: { status: 'PAID', amount: 100, currency: 'GBP', paymentDate: '2026-06-17' }
    };
    const bodyString = JSON.stringify(payload);
    const headers = createBACSWebhookHeaders(bodyString, SIGNING_SECRET);

    const response = await request(app)
      .post(WEBHOOK_ENDPOINT)
      .set(headers)
      .send(payload);

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('Schema validation failed');
  });

  test('Should reject missing detail object with 422', async () => {
    const payload = {
      event: { eventId: 'aaaa-0001-4000-8000-000000000001', eventType: 'PAYMENT_STATUS_UPDATE', eventVersion: '1.0', occurredAt: '2026-06-17T10:00:00.000Z', source: 'TEST' },
      payment: { paymentReference: 'TEST-PAY' }
    };
    const bodyString = JSON.stringify(payload);
    const headers = createBACSWebhookHeaders(bodyString, SIGNING_SECRET);

    const response = await request(app)
      .post(WEBHOOK_ENDPOINT)
      .set(headers)
      .send(payload);

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('Schema validation failed');
  });

  test('Should reject invalid occurredAt format with 422', async () => {
    const payload = {
      event: { eventId: 'aaaa-0002-4000-8000-000000000002', eventType: 'PAYMENT_STATUS_UPDATE', eventVersion: '1.0', occurredAt: '7th May 2026', source: 'TEST' },
      payment: { paymentReference: 'TEST-PAY' },
      detail: { status: 'PAID', amount: 100, currency: 'GBP', paymentDate: '2026-06-17' }
    };
    const bodyString = JSON.stringify(payload);
    const headers = createBACSWebhookHeaders(bodyString, SIGNING_SECRET);

    const response = await request(app)
      .post(WEBHOOK_ENDPOINT)
      .set(headers)
      .send(payload);

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('Schema validation failed');
  });

  test('Should reject missing source field with 422', async () => {
    const payload = {
      event: { eventId: 'aaaa-0003-4000-8000-000000000003', eventType: 'PAYMENT_STATUS_UPDATE', eventVersion: '1.0', occurredAt: '2026-06-17T10:00:00.000Z' },
      payment: { paymentReference: 'TEST-PAY' },
      detail: { status: 'PAID', amount: 100, currency: 'GBP', paymentDate: '2026-06-17' }
    };
    const bodyString = JSON.stringify(payload);
    const headers = createBACSWebhookHeaders(bodyString, SIGNING_SECRET);

    const response = await request(app)
      .post(WEBHOOK_ENDPOINT)
      .set(headers)
      .send(payload);

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('Schema validation failed');
  });

  test('Should reject invalid paymentDate format with 422', async () => {
    const payload = {
      event: { eventId: 'aaaa-0004-4000-8000-000000000004', eventType: 'PAYMENT_STATUS_UPDATE', eventVersion: '1.0', occurredAt: '2026-06-17T10:00:00.000Z', source: 'TEST' },
      payment: { paymentReference: 'TEST-PAY' },
      detail: { status: 'PAID', amount: 100, currency: 'GBP', paymentDate: '17/06/2026' }
    };
    const bodyString = JSON.stringify(payload);
    const headers = createBACSWebhookHeaders(bodyString, SIGNING_SECRET);

    const response = await request(app)
      .post(WEBHOOK_ENDPOINT)
      .set(headers)
      .send(payload);

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('Schema validation failed');
  });

  test('Should reject non-UUID deliveryId with 422', async () => {
    const payload = {
      event: { eventId: 'aaaa-0005-4000-8000-000000000005', eventType: 'PAYMENT_STATUS_UPDATE', eventVersion: '1.0', occurredAt: '2026-06-17T10:00:00.000Z', source: 'TEST' },
      callback: { deliveryId: 'not-a-uuid', attemptNumber: 1 },
      payment: { paymentReference: 'TEST-PAY' },
      detail: { status: 'PAID', amount: 100, currency: 'GBP', paymentDate: '2026-06-17' }
    };
    const bodyString = JSON.stringify(payload);
    const headers = createBACSWebhookHeaders(bodyString, SIGNING_SECRET);

    const response = await request(app)
      .post(WEBHOOK_ENDPOINT)
      .set(headers)
      .send(payload);

    expect(response.status).toBe(422);
    expect(response.body.error).toBe('Schema validation failed');
  });
});
