import getLogger from '../utils/loggerHelper';
import * as paymentWebhookRepository from '../repositories/paymentWebhookRepository';
import config from '../config/config';
import { BACSWebhookPayload } from '../types/bacsWebhook.types';
import {
  WEBHOOK_CREATOR,
  ERROR_CATEGORY_DATABASE,
  ERROR_CATEGORY_CONFIGURATION,
} from '../constants/bacs.constants';

const logger = getLogger(module);
const { ERROR_CODES } = require('../constants');

const FILE = 'bacsPaymentWebhookService.ts';

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
  logger.info(`[BACS][STARTED][${FILE}][processBACSWebhook] webhookId=${webhookId} paymentId=${paymentId} correlationId=${correlationId}`);
  try {
    return await processBACSWebhookInternal(webhookId, paymentId, event, rawPayload, correlationId, startTime);
  } finally {
    logger.info(`[BACS][ENDED][${FILE}][processBACSWebhook] webhookId=${webhookId} paymentId=${paymentId} correlationId=${correlationId} durationMs=${Date.now() - startTime}`);
  }
}

async function processBACSWebhookInternal(
  webhookId: string,
  paymentId: string,
  event: BACSWebhookPayload,
  rawPayload: string,
  correlationId: string,
  startTime: number
): Promise<BACSWebhookProcessingResult> {
  logger.info(`[BACS][EVENT][${FILE}][processBACSWebhookInternal] processing BACS webhook - webhookId=${webhookId} paymentId=${paymentId} eventType=${event.event.eventType} status=${event.detail.status} source=${event.event.source} correlationId=${correlationId}`);

  if (!config.features.callbackServiceEnabled) {
    logger.error(`[BACS][FAILED][${FILE}][processBACSWebhookInternal] error=callback_service_disabled category=${ERROR_CATEGORY_CONFIGURATION} code=${ERROR_CODES.CONFIGURATION_ERROR} - webhookId=${webhookId} correlationId=${correlationId}`);
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
      logger.info(`[BACS][EVENT][${FILE}][processBACSWebhookInternal] duplicate detected - webhookId=${webhookId} paymentId=${paymentId} correlationId=${correlationId}`);
      return { success: true, isDuplicate: true, paymentId };
    }

    const duration = Date.now() - startTime;
    logger.info(`[BACS][EVENT][${FILE}][processBACSWebhookInternal] webhook stored - webhookId=${webhookId} paymentId=${paymentId} eventType=${event.event.eventType} status=${event.detail.status} durationMs=${duration} correlationId=${correlationId}`);

    return { success: true, isDuplicate: false, paymentId };
  } catch (error: any) {
    const errorMessage = error.message || String(error);
    const duration = Date.now() - startTime;

    logger.error(`[BACS][FAILED][${FILE}][processBACSWebhookInternal] error=${errorMessage} code=${error.code || ERROR_CODES.DATABASE_ERROR} category=${ERROR_CATEGORY_DATABASE} - webhookId=${webhookId} paymentId=${paymentId} correlationId=${correlationId} durationMs=${duration}`);

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
