jest.mock('../../src/repositories/paymentWebhookRepository', () => ({
  createWebhook: jest.fn(),
}));

import { processBACSWebhook } from '../../src/services/bacsPaymentWebhookService';
import * as paymentWebhookRepository from '../../src/repositories/paymentWebhookRepository';
import { WEBHOOK_STATUS_PENDING } from '../../src/constants/bacs.constants';
import { BACSWebhookPayload } from '../../src/types/bacsWebhook.types';

const createWebhook = paymentWebhookRepository.createWebhook as jest.Mock;

function buildEvent(status: string): BACSWebhookPayload {
  return {
    event: {
      eventId: '83e9c23c-8ee9-4390-889f-a608c1efc6c9',
      eventType: 'PAYMENT_STATUS_UPDATE',
      eventVersion: '1.0',
      occurredAt: '2026-09-11T10:30:00.000Z',
      source: 'PARTNER-SYSTEM',
    },
    callback: {
      deliveryId: 'b302065e-4e37-46a2-be6f-3b1c15e7da78',
      attemptNumber: 1,
    },
    payment: {
      paymentReference: 'INV01/NWL00045',
    },
    detail: {
      status,
      amount: 125000,
      currency: 'GBP',
      paymentDate: '2026-09-11',
      bacsReference: 'TRF20260613001',
    },
  };
}

describe('processBACSWebhook', () => {
  beforeEach(() => {
    createWebhook.mockReset();
    createWebhook.mockResolvedValue({ isDuplicate: false });
  });

  it('stores processing status pending and keeps PAID in the raw payload', async () => {
    const event = buildEvent('PAID');
    const raw = JSON.stringify(event);

    const result = await processBACSWebhook(
      event.event.eventId,
      event.payment.paymentReference,
      event,
      raw,
      'corr-1',
    );

    expect(result.success).toBe(true);
    expect(createWebhook).toHaveBeenCalledTimes(1);
    const stored = createWebhook.mock.calls[0][0];
    expect(stored.status).toBe(WEBHOOK_STATUS_PENDING);
    expect(stored.status).toBe('pending');
    expect(stored.raw_payload.detail.status).toBe('PAID');
    expect(stored.webhook_id).toBe(event.event.eventId);
  });

  it('stores processing status pending when the payment status is FAILED', async () => {
    const event = buildEvent('FAILED');
    const raw = JSON.stringify(event);

    await processBACSWebhook(
      event.event.eventId,
      event.payment.paymentReference,
      event,
      raw,
      'corr-2',
    );

    const stored = createWebhook.mock.calls[0][0];
    expect(stored.status).toBe('pending');
    expect(stored.raw_payload.detail.status).toBe('FAILED');
  });
});
