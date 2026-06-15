// UKSBS Payment Webhook Service
// Handles UKSBS webhook storage and processing
// Uses the same payment_webhooks table and simplified architecture as GOV.UK Pay
// This service only stores webhooks to database with enqueued_at = NULL
// The pay-callback-relay Lambda will poll and send to SQS

import getLogger from '../utils/loggerHelper';
import * as paymentWebhookRepository from '../repositories/paymentWebhookRepository';
import config from '../config/config';
import { UKSBSWebhookPayload } from '../types/uksbsWebhook.types';

const logger = getLogger(module);
const { ERROR_CODES } = require('../constants');

interface UKSBSWebhookProcessingResult {
  success: boolean;
  isDuplicate: boolean;
  paymentId: string;
  error?: string;
  errorCode?: string;
}

/**
 * Process UKSBS webhook - simplified architecture
 * 1. Store webhook in database with status='pending' and enqueued_at=NULL
 * 2. Return immediately (no SQS interaction)
 * 3. pay-callback-relay will poll and send to SQS
 * 
 * @param webhookId - Unique webhook identifier (event.eventId)
 * @param paymentId - Payment reference ID (payment.paymentReference)
 * @param event - Complete UKSBS webhook payload
 * @param rawPayload - Raw webhook payload string (will be stored as JSONB)
 * @param correlationId - Correlation ID for tracing
 * @returns Processing result indicating success/duplicate/error
 */
export async function processUKSBSWebhook(
  webhookId: string,
  paymentId: string,
  event: UKSBSWebhookPayload,
  rawPayload: string,
  correlationId: string
): Promise<UKSBSWebhookProcessingResult> {
  const startTime = Date.now();

  logger.info('[UKSBSWebhookService] Processing UKSBS webhook', {
    webhookId,
    paymentId,
    eventType: event.event.eventType,
    status: event.detail.status,
    source: event.event.source,
    correlationId,
  });

  if (!config.features.callbackServiceEnabled) {
    logger.warn('[UKSBSWebhookService] Callback service is disabled', {
      webhookId,
      correlationId,
    });
    return {
      success: false,
      isDuplicate: false,
      paymentId,
      error: 'Callback service is disabled',
      errorCode: ERROR_CODES.CONFIGURATION_ERROR,
    };
  }

  try {
    // Parse rawPayload to JSONB format
    let payloadJson: any;
    try {
      payloadJson = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;
    } catch (parseError) {
      logger.error('[UKSBSWebhookService] Failed to parse raw payload', {
        webhookId,
        paymentId,
        error: parseError instanceof Error ? parseError.message : String(parseError),
        correlationId,
      });
      payloadJson = rawPayload; // Store as-is if parsing fails
    }

    // Store webhook in database with ON CONFLICT for idempotency
    // Using same payment_webhooks table structure
    // enqueued_at will be NULL until pay-callback-relay sends to SQS
    const createResult = await paymentWebhookRepository.createWebhook({
      webhook_id: webhookId,
      payment_id: paymentId,
      event_type: event.event.eventType,
      status: 'pending',
      raw_payload: payloadJson,  // Stored as JSONB
      created_by: 'uksbs-webhook-receiver',
      correlation_id: correlationId,
    });

    // Check if this was a duplicate (returned by ON CONFLICT)
    if (createResult && createResult.isDuplicate) {
      logger.info('[UKSBSWebhookService] Duplicate webhook detected', {
        webhookId,
        paymentId,
        previousStatus: createResult.status,
        correlationId,
      });

      return {
        success: true,
        isDuplicate: true,
        paymentId,
      };
    }

    const duration = Date.now() - startTime;
    logger.info('[UKSBSWebhookService] UKSBS webhook stored successfully', {
      webhookId,
      paymentId,
      eventType: event.event.eventType,
      paymentStatus: event.detail.status,
      amount: event.detail.amount,
      currency: event.detail.currency,
      duration,
      correlationId,
      note: 'Webhook will be polled by pay-callback-relay',
    });

    return {
      success: true,
      isDuplicate: false,
      paymentId,
    };
  } catch (error: any) {
    const errorMessage = error.message || String(error);
    const duration = Date.now() - startTime;

    logger.error('[UKSBSWebhookService] Error storing UKSBS webhook', {
      webhookId,
      paymentId,
      error: errorMessage,
      code: error.code,
      stack: error.stack,
      duration,
      correlationId,
    });

    return {
      success: false,
      isDuplicate: false,
      paymentId,
      error: errorMessage,
      errorCode: error.code || ERROR_CODES.DATABASE_ERROR,
    };
  }
}

/**
 * Map UKSBS payment status to internal status
 * This can be extended to map UKSBS statuses to application-specific statuses
 */
export function mapUKSBSStatusToInternal(uksbsStatus: string): string {
  const statusMap: Record<string, string> = {
    'PAID': 'success',
    'PENDING': 'pending',
    'FAILED': 'failed',
    'CANCELLED': 'cancelled',
    'REFUNDED': 'refunded',
    'PARTIALLY_REFUNDED': 'partially_refunded',
  };

  return statusMap[uksbsStatus] || 'unknown';
}
