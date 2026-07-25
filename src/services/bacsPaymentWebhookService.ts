import getLogger from '../utils/loggerHelper';
import * as paymentWebhookRepository from '../repositories/paymentWebhookRepository';
import config from '../config/config';
import { BACSWebhookPayload } from '../types/bacsWebhook.types';
import { sanitizeError } from '../utils/errorSanitizer';
import {
  WEBHOOK_CREATOR,
  ERROR_CATEGORY_DATABASE,
  ERROR_CATEGORY_CONFIGURATION,
} from '../constants/bacs.constants';

const logger = getLogger(module);
const { ERROR_CODES } = require('../constants');

interface BACSWebhookProcessingResult {
  success: boolean;
  isDuplicate: boolean;
  paymentId: string;
  error?: string;
  errorCode?: string;
}

export async function processBACSWebhook(
  webhookId: string,
  paymentId: string,
  event: BACSWebhookPayload,
  rawPayload: string,
  correlationId: string
): Promise<BACSWebhookProcessingResult> {
  const startTime = Date.now();

  logger.info('[BACSWebhookService] Processing BACS webhook', {
    webhookId,
    paymentId,
    eventType: event.event.eventType,
    status: event.detail.status,
    source: event.event.source,
    correlationId,
  });

  if (!config.features.callbackServiceEnabled) {
    logger.warn('[BACSWebhookService] Callback service is disabled', {
      webhookId,
      correlationId,
      error_category: ERROR_CATEGORY_CONFIGURATION,
      error_code: ERROR_CODES.CONFIGURATION_ERROR,
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
    const payloadJson = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;

    const createResult = await paymentWebhookRepository.createWebhook({
      webhook_id: webhookId,
      payment_id: paymentId,
      event_type: event.event.eventType,
      status: event.detail.status,
      raw_payload: payloadJson,
      created_by: WEBHOOK_CREATOR,
      correlation_id: correlationId,
    });

    if (createResult && createResult.isDuplicate) {
      logger.info('[BACSWebhookService] Duplicate detected', {
        webhookId,
        paymentId,
        correlationId,
        is_duplicate: true,
      });
      return { success: true, isDuplicate: true, paymentId };
    }

    const duration = Date.now() - startTime;
    logger.info('[BACSWebhookService] Webhook stored', {
      webhookId,
      paymentId,
      eventType: event.event.eventType,
      status: event.detail.status,
      duration,
      correlationId,
      is_duplicate: false,
    });

    return { success: true, isDuplicate: false, paymentId };
  } catch (error: any) {
    const errorMessage = error.message || String(error);
    const duration = Date.now() - startTime;

    // ✅ FIX HIGH-003: Sanitize error messages to prevent information disclosure
    logger.error('[BACSWebhookService] Error storing webhook', {
      webhookId,
      paymentId,
      error: sanitizeError(errorMessage),
      code: error.code,
      duration,
      correlationId,
      error_category: ERROR_CATEGORY_DATABASE,
      error_code: error.code || ERROR_CODES.DATABASE_ERROR,
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
 * Map BACS payment status to internal status
 * This can be extended to map BACS statuses to application-specific statuses
 */
export function mapBACSStatusToInternal(BACSStatus: string): string {
  const statusMap: Record<string, string> = {
    'PAID': 'success',
    'PENDING': 'pending',
    'FAILED': 'failed',
    'CANCELLED': 'cancelled',
    'REFUNDED': 'refunded',
    'PARTIALLY_REFUNDED': 'partially_refunded',
  };

  return statusMap[BACSStatus] || 'unknown';
}
