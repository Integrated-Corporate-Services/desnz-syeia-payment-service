/**
 * Payment Status Handling Integration Test
 * Tests payment status sync from GOV.UK Pay to PostgreSQL
 */

const request = require('supertest');
const crypto = require('crypto');

process.env.NODE_ENV = 'test';
process.env.GOVPAY_WEBHOOK_SIGNING_KEY = 'test-signing-key';
process.env.GOVPAY_API_KEY = 'test-api-key';
process.env.DB_PASSWORD = 'test-password';
process.env.CALLBACK_SERVICE_ENABLED = 'true';
process.env.SQS_ENABLED = 'false';

jest.mock('../src/database/db');
jest.mock('../src/services/govPayService');
jest.mock('../src/repositories/paymentRepository');
jest.mock('../src/repositories/paymentWebhookRepository');

const govPayService = require('../src/services/govPayService');
const paymentRepository = require('../src/repositories/paymentRepository');
const paymentWebhookRepository = require('../src/repositories/paymentWebhookRepository');

describe('Payment Status Handling', () => {
  let app: any;
  
  beforeAll(() => {
    app = require('../src/app').default;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('TC1: Successful payment - fetch and update status', async () => {
    const webhookId = 'webhook-123';
    const paymentId = 'pay-success-123';
    const applicationId = 'app-123';

    // Mock webhook payload
    const webhookPayload = {
      webhook_id: webhookId,
      payment_id: paymentId,
      event_type: 'card_payment_succeeded',
    const webhookPayload = {
      webhook_id: webhookId,
      payment_id: paymentId,
      event_type: 'card_payment_succeeded',
      created_date: new Date().toISOString(),
    };

    paymentWebhookRepository.findByWebhookId.mockResolvedValue(null);
    paymentWebhookRepository.createWebhook.mockResolvedValue(true);
    paymentWebhookRepository.updateWebhookStatus.mockResolvedValue(true);

        finished: true,
      },
      reference: applicationId,
      description: 'Test Payment',
    });

    // Mock: Local payment record found
    paymentRepository.findByPaymentId.mockResolvedValue({
      id: 1,
    paymentRepository.findByPaymentId.mockResolvedValue({
      id: 1,
      application_id: applicationId,
      payment_id: paymentId,
      amount: 40250,
      status: 'created',
      finished: false,
    });

    paymentRepository.markOutcome.mockResolvedValue(true);
bhookPayload))
      .digest('hex');

    // Send webhook request
    const response = await request(app)
      .post('/webhook/payment')
      .set('Pay-Signature', signature)
      .set('Content-Type', 'application/json')
      .send(webhookPayload);

    // Assertions
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('received');
    
    // Verify GOV.UK Pay was called to fetch status
    expect(govPayService.getPaymentById).toHaveBeenCalledWith(paymentId);
    
    // Verify payment status was updated in database
    expect(paymentRepository.findByPaymentId).toHaveBeenCalledWith(paymentId);
    expect(paymentRepository.markOutcome).toHaveBeenCalledWith(1, {
      status: 'success',
      finished: true,
    });
    
    // Verify application was submitted
    expect(submitApplicationService.submitApplication).toHaveBeenCalledWith(applicationId);
  });

  /**
   * TeApplication submission is handled independently - NOT called here
   */
  test('TC2: Failed payment webhook - should update status but NOT submit application', async () => {
    const webhookId = 'webhook-456';
    const paymentId = 'pay-failed-456';
    const applicationId = 'app-456';
only
   */
  test('TC2: Failed payment webhook - should update status only
      payment_id: paymentId,
      event_type: 'card_payment_failed',
      created_date: new Date().toISOString(),
    };

    // Mock setup
    paymentWebhookRepository.findByWebhookId.mockResolvedValue(null);
    paymentWebhookRepository.createWebhook.mockResolvedValue(true);
paymentWebhookRepository.findByWebhookId.mockResolvedValue(null);
    paymentWebhookRepository.createWebhook.mockResolvedValue(true);

      state: {
        status: 'failed',
        finished: true,
      },
    });

    paymentRepository.findByPaymentId.mockResolvedValue({
      id: 2,
      application_id: applicationId,
      payment_id: paymentId,
      status: 'created',
      finished: false,
    });

    paymentRepository.markOutcome.mockResolvedValue(true);

    const signature = crypto
      .createHmac('sha256', 'test-signing-key')
      .update(JSON.stringify(webhookPayload))
      .digest('hex');

    const response = await request(app)
      .post('/webhook/payment')
      .set('Pay-Signature', signature)
      .send(webhookPayload);

    expect(response.status).toBe(200);
    
    // Verify status was updated to 'failed'
    expect(paymentRepository.markOutcome).toHaveBeenCalledWith(2, {
      status: 'failed',
      finished: true,
    });
    
  
  /**
   * Test Case 3: Pending Payment
   * Verifies that pending payment updates status but does NOT submit application
   */
  test('TC3: Pending payment webhook - should update status but NOT submit application', async () => {
    const webhookId = 'webhook-789';
    const paymentId = 'pay-pending-789';only
   */
  test('TC3: Pending payment webhook - should update status only
    const webhookPayload = {
      webhook_id: webhookId,
      payment_id: paymentId,
      event_type: 'card_payment_started',
      created_date: new Date().toISOString(),
    };

    paymentWebhookRepository.findByWebhookId.mockResolvedValue(null);
    paymentWebhookRepository.createWebhook.mockResolvedValue(true);

    govPayService.getPaymentById.mockResolvedValue({
      payment_id: paymentId,
      state: {
        status: 'started',
        finished: false,
      },
    });

    paymentRepository.findByPaymentId.mockResolvedValue({
      id: 3,
      application_id: applicationId,
      payment_id: paymentId,
      status: 'created',
      finished: false,
    });

    paymentRepository.markOutcome.mockResolvedValue(true);

    const signature = crypto
      .createHmac('sha256', 'test-signing-key')
      .update(JSON.stringify(webhookPayload))
      .digest('hex');

    const response = await request(app)
      .post('/webhook/payment')
      .set('Pay-Signature', signature)
      .send(webhookPayload);

    expect(response.status).toBe(200);
    
    // Verify status was updated but not marked as finished
    expect(paymentRepository.markOutcome).toHaveBeenCalledWith(3, {
      status: 'started',
      finished: false,
    });
    
    // Verify application was NOT submitted (payment not final)
    expect(submitApplicationService.submitApplication).not.toHaveBeenCalled();
   * Test Case 4: Payment Not Found in Local Database
   * Verifies graceful handling when payment_id doesn't exist locally
   */
  test('TC4: Payment not found in local database - should handle gracefully', async () => {
    const webhookId = 'webhook-999';
    const paymentId = 'pay-notfound-999';

    const webhookPayload = {
      webhook_id: webhookId,
      payment_id: paymentId,
      event_type: 'card_payment_succeeded',
    };

    paymentWebhookRepository.findByWebhookId.mockResolvedValue(null);
    paymentWebhookRepository.createWebhook.mockResolvedValue(true);

    govPayService.getPaymentById.mockResolvedValue({
      payment_id: paymentId,
      state: { status: 'success', finished: true },
    });

    paymentRepository.findByPaymentId.mockResolvedValue(null);

    const signature = crypto
      .createHmac('sha256', 'test-signing-key')
      .update(JSON.stringify(webhookPayload))
      .digest('hex');

    const response = await request(app)
      .post('/webhook/payment')
      .set('Pay-Signature', signature)
      .send(webhookPayload);

    // Should still return 200 (webhook acknowledged)
    expect(response.status).toBe(200);
    
    // Verify GOV.UK Pay was still called
    expect(govPayService.getPaymentById).toHaveBeenCalledWith(paymentId);
    
    // Verify no database update attempted (no local record)
    expect(paymentRepository.markOutcome).not.toHaveBeenCalled();
    expect(submitApplicationService.submitApplication).not.toHaveBeenCalled();
  });
});
