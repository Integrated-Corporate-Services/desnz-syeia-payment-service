/**
 * Integration Tests for Webhook Processing
 * Tests the new 3-tier architecture:
 * 1. Webhook reception and storage
 * 2. Verification that enqueued_at is NULL initially
 * 3. Verification of idempotency (duplicate handling)
 */

import request from 'supertest';
import app from '../../src/app';
import db from '../../src/database/db';
import crypto from 'crypto';

// Test configuration
const WEBHOOK_SIGNING_KEY = process.env.GOVPAY_WEBHOOK_SIGNING_KEY || 'test-signing-key';

/**
 * Generate valid webhook signature (HMAC-SHA256)
 */
function generateSignature(payload: string): string {
  return crypto
    .createHmac('sha256', WEBHOOK_SIGNING_KEY)
    .update(payload)
    .digest('hex');
}

/**
 * Create test webhook payload
 */
function createTestWebhookPayload(webhookId: string, paymentId: string) {
  return {
    webhook_message_id: webhookId,
    event_type: 'card_payment_succeeded',
    resource_type: 'payment',
    resource: {
      payment_id: paymentId,
      amount: 10000,
      state: {
        status: 'success',
        finished: true,
      },
      reference: `REF-${paymentId}`,
      description: 'Test payment',
      created_date: new Date().toISOString(),
    },
    created_date: new Date().toISOString(),
  };
}

describe('Webhook Integration Tests - New Architecture', () => {
  beforeAll(async () => {
    // Clean up test data before running tests
    await db.query("DELETE FROM payment_webhooks WHERE webhook_id LIKE 'test-%'");
  });

  afterAll(async () => {
    // Clean up test data after tests
    await db.query("DELETE FROM payment_webhooks WHERE webhook_id LIKE 'test-%'");
    await db.end();
  });

  describe('POST /webhook - Webhook Reception', () => {
    it('should accept valid webhook and store with enqueued_at = NULL', async () => {
      const webhookId = `test-webhook-${Date.now()}`;
      const paymentId = `test-payment-${Date.now()}`;
      const payload = createTestWebhookPayload(webhookId, paymentId);
      const payloadString = JSON.stringify(payload);
      const signature = generateSignature(payloadString);

      const response = await request(app)
        .post('/webhook')
        .set('Pay-Signature', signature)
        .set('Content-Type', 'application/json')
        .set('X-Correlation-Id', 'test-correlation-id')
        .send(payload);

      expect(response.status).toBe(202);
      expect(response.body).toMatchObject({
        webhookId: expect.any(String),
        paymentId,
        message: expect.any(String),
      });

      // Verify webhook is stored in database
      const dbResult = await db.query(
        'SELECT * FROM payment_webhooks WHERE webhook_id = $1',
        [webhookId]
      );

      expect(dbResult.rows).toHaveLength(1);
      const storedWebhook = dbResult.rows[0];
      
      expect(storedWebhook.webhook_id).toBe(webhookId);
      expect(storedWebhook.payment_id).toBe(paymentId);
      expect(storedWebhook.event_type).toBe('card_payment_succeeded');
      expect(storedWebhook.status).toBe('pending');
      expect(storedWebhook.enqueued_at).toBeNull(); // Key assertion - NULL until relay
      expect(storedWebhook.created_by).toBe('inbound-event-receiver');
      expect(storedWebhook.raw_payload).toMatchObject(payload);
    });

    it('should handle duplicate webhooks idempotently', async () => {
      const webhookId = `test-duplicate-${Date.now()}`;
      const paymentId = `test-payment-dup-${Date.now()}`;
      const payload = createTestWebhookPayload(webhookId, paymentId);
      const payloadString = JSON.stringify(payload);
      const signature = generateSignature(payloadString);

      // First webhook
      const response1 = await request(app)
        .post('/webhook')
        .set('Pay-Signature', signature)
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response1.status).toBe(202);
      expect(response1.body.isDuplicate).toBeFalsy();

      // Duplicate webhook
      const response2 = await request(app)
        .post('/webhook')
        .set('Pay-Signature', signature)
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response2.status).toBe(202);
      expect(response2.body.isDuplicate).toBe(true);

      // Verify only one record in database
      const dbResult = await db.query(
        'SELECT COUNT(*) as count FROM payment_webhooks WHERE webhook_id = $1',
        [webhookId]
      );

      expect(parseInt(dbResult.rows[0].count)).toBe(1);
    });

    it('should reject webhook with invalid signature', async () => {
      const webhookId = `test-invalid-sig-${Date.now()}`;
      const paymentId = `test-payment-${Date.now()}`;
      const payload = createTestWebhookPayload(webhookId, paymentId);

      const response = await request(app)
        .post('/webhook')
        .set('Pay-Signature', 'invalid-signature')
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(response.status).toBe(401);
    });

    it('should store multiple webhooks with NULL enqueued_at for relay polling', async () => {
      const webhooks = [];
      
      // Create 5 test webhooks
      for (let i = 0; i < 5; i++) {
        const webhookId = `test-batch-${Date.now()}-${i}`;
        const paymentId = `test-payment-batch-${Date.now()}-${i}`;
        const payload = createTestWebhookPayload(webhookId, paymentId);
        const payloadString = JSON.stringify(payload);
        const signature = generateSignature(payloadString);

        await request(app)
          .post('/webhook')
          .set('Pay-Signature', signature)
          .set('Content-Type', 'application/json')
          .send(payload);

        webhooks.push(webhookId);
      }

      // Verify all webhooks have enqueued_at = NULL (ready for relay)
      const dbResult = await db.query(
        `SELECT webhook_id, enqueued_at, status 
         FROM payment_webhooks 
         WHERE webhook_id = ANY($1::text[])`,
        [webhooks]
      );

      expect(dbResult.rows).toHaveLength(5);
      dbResult.rows.forEach((row: any) => {
        expect(row.enqueued_at).toBeNull();
        expect(row.status).toBe('pending');
      });
    });
  });

  describe('Database Schema Validation', () => {
    it('should have correct table structure', async () => {
      const result = await db.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'payment_webhooks'
        ORDER BY ordinal_position
      `);

      const columns = result.rows.map((row: any) => ({
        name: row.column_name,
        type: row.data_type,
        nullable: row.is_nullable,
      }));

      // Verify key columns exist
      expect(columns).toContainEqual(
        expect.objectContaining({ name: 'id', type: 'integer' })
      );
      expect(columns).toContainEqual(
        expect.objectContaining({ name: 'webhook_id', type: 'text' })
      );
      expect(columns).toContainEqual(
        expect.objectContaining({ name: 'payment_id', type: 'text' })
      );
      expect(columns).toContainEqual(
        expect.objectContaining({ name: 'enqueued_at', nullable: 'YES' })
      );
      expect(columns).toContainEqual(
        expect.objectContaining({ name: 'raw_payload', type: 'jsonb' })
      );
    });

    it('should have required indexes', async () => {
      const result = await db.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'payment_webhooks'
      `);

      const indexNames = result.rows.map((row: any) => row.indexname);

      // Verify critical indexes exist
      expect(indexNames).toContain('payment_webhooks_webhook_id_key'); // UNIQUE
      expect(indexNames).toContain('idx_payment_webhooks_enqueued_at'); // For relay polling
    });
  });

  describe('Query Performance - Relay Polling Simulation', () => {
    it('should efficiently query webhooks pending relay', async () => {
      // This simulates the query used by pay-callback-relay
      const startTime = Date.now();
      
      const result = await db.query(`
        SELECT * FROM payment_webhooks 
        WHERE enqueued_at IS NULL 
        AND status = 'processing'
        ORDER BY created_at ASC
        LIMIT 10
      `);

      const duration = Date.now() - startTime;

      // Query should be fast (< 100ms even with many records)
      expect(duration).toBeLessThan(100);
      
      // Should return results if any exist
      expect(Array.isArray(result.rows)).toBe(true);
    });
  });
});
