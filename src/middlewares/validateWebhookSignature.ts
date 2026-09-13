import { Request, Response, NextFunction } from 'express';
import { ERROR_MESSAGES, ERROR_CATEGORIES } from '../constants';
import { GOVUK_PAY_WEBHOOK_MESSAGE_ID_REGEX } from '../constants/webhook.constants';
import { verifyHmacSignature } from '../utils/cryptoUtils';
import getLogger from '../utils/loggerHelper';

const logger = getLogger(module);

const FILE = 'validateWebhookSignature.ts';

interface WebhookSignatureOptions {
  secret: string;
}

interface WebhookEvent {
  webhook_message_id: string;
  api_version: number;
  event_type: string;
  created_date: string;
  resource_id: string;
  resource_type: string;
  resource: Record<string, unknown>;
}

/**
 * Request interface for webhook extraction
 */
interface WebhookRequest {
  headers: Record<string, string | string[] | undefined>;
  body?: {
    webhook_message_id?: string;
  };
}

/**
 * Extract webhook signature and ID from request headers
 * GOV.UK Pay uses 'Pay-Signature' header (case-insensitive in Node.js)
 */
export function extractWebhookHeaders(req: WebhookRequest): {
  signature: string | null;
  webhookId: string | null;
} {
  // Official GOV.UK Pay header name is 'Pay-Signature'
  const signatureHeader = req.headers['pay-signature'];
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader || null;

  // webhook_message_id comes from body, not headers
  const webhookId = req.body?.webhook_message_id || null;

  // Security: Validate webhook_message_id matches GOV.UK Pay format (26 lowercase alphanumeric chars)
  if (webhookId !== null) {
    if (typeof webhookId !== 'string') {
      logger.error(`[GOVPAY][SIGNATURE][FAILED][${FILE}][extractWebhookHeaders] error=invalid_webhook_message_id_type webhookIdType=${typeof webhookId} category=${ERROR_CATEGORIES.VALIDATION}`);
      return { signature, webhookId: null };
    }

    if (!GOVUK_PAY_WEBHOOK_MESSAGE_ID_REGEX.test(webhookId)) {
      logger.error(`[GOVPAY][SIGNATURE][FAILED][${FILE}][extractWebhookHeaders] error=invalid_webhook_message_id_format category=${ERROR_CATEGORIES.VALIDATION} webhookId=${webhookId}`);
      return { signature, webhookId: null };
    }
  }

  return { signature, webhookId };
}

export function verifyWebhookSignature(
  signature: string,
  body: string,
  signingKey: string
): boolean {
  try {
    return verifyHmacSignature(signature, body, signingKey);
  } catch (error) {
    logger.error(`[GOVPAY][SIGNATURE][FAILED][${FILE}][verifyWebhookSignature] error=${error instanceof Error ? error.message : String(error)} category=${ERROR_CATEGORIES.CRYPTOGRAPHY}`);
    return false;
  }
}

/**
 * Parse and validate webhook event structure
 * Matches official GOV.UK Pay webhook message format
 */
export function parseWebhookEvent(rawBody: Record<string, unknown>): WebhookEvent | null {
  try {
    if (!rawBody || typeof rawBody !== 'object') {
      logger.error(`[GOVPAY][SIGNATURE][FAILED][${FILE}][parseWebhookEvent] error=invalid_webhook_body_structure`);
      return null;
    }

    const { webhook_message_id, api_version, event_type, created_date, resource_id, resource_type, resource } = rawBody;

    // Extract payment_id from resource if resource_id is not at top level
    const resourceObj = resource as Record<string, unknown>;
    const extractedResourceId = resource_id || resourceObj?.payment_id;

    // Validate essential fields only (more flexible for different webhook formats)
    if (!webhook_message_id || !event_type || !resource) {
      logger.error(`[GOVPAY][SIGNATURE][FAILED][${FILE}][parseWebhookEvent] error=webhook_missing_required_fields hasWebhookMessageId=${!!webhook_message_id} hasApiVersion=${!!api_version} hasEventType=${!!event_type} hasResourceId=${!!extractedResourceId} hasResourceType=${!!resource_type} hasResource=${!!resource}`);
      return null;
    }

    // Type assertions with validation
    if (typeof webhook_message_id !== 'string' || typeof event_type !== 'string') {
      logger.error(`[GOVPAY][SIGNATURE][FAILED][${FILE}][parseWebhookEvent] error=invalid_field_types`);
      return null;
    }

    return {
      webhook_message_id,
      api_version: typeof api_version === 'number' ? api_version : 1,
      event_type,
      created_date: String(created_date || new Date().toISOString()),
      resource_id: String(extractedResourceId || 'unknown'),
      resource_type: String(resource_type || 'payment'),
      resource: resource as Record<string, unknown>,
    };
  } catch (error) {
    logger.error(`[GOVPAY][SIGNATURE][FAILED][${FILE}][parseWebhookEvent] error=${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Extract payment ID from webhook event
 * According to GOV.UK Pay docs, resource.payment_id contains the payment ID
 */
export function extractPaymentIdFromEvent(event: WebhookEvent): string | null {
  // resource_id is the same as payment_id, but payment_id is also in resource object
  const resourcePaymentId = event.resource?.payment_id;
  const paymentId = event.resource_id || (typeof resourcePaymentId === 'string' ? resourcePaymentId : null);

  if (!paymentId) {
    logger.error(`[GOVPAY][SIGNATURE][FAILED][${FILE}][extractPaymentIdFromEvent] error=unable_to_extract_payment_id webhookMessageId=${event.webhook_message_id}`);
    return null;
  }

  return paymentId;
}

/**
 * Main webhook validation function
 * Returns { valid: boolean, error?: string, paymentId?: string }
 */
export function validateWebhookSignature(
  req: any,
  signingKey: string
): { valid: boolean; error?: string; event?: WebhookEvent; paymentId?: string } {
  const { signature, webhookId } = extractWebhookHeaders(req);

  if (!signature) {
    return { valid: false, error: ERROR_MESSAGES.INVALID_SIGNATURE };
  }

  if (!webhookId) {
    const hasWebhookMessageId = typeof req.body?.webhook_message_id === 'string'
      && req.body.webhook_message_id.length > 0;
    return {
      valid: false,
      error: hasWebhookMessageId
        ? ERROR_MESSAGES.INVALID_WEBHOOK_ID
        : ERROR_MESSAGES.INVALID_SIGNATURE,
    };
  }

  // Get raw body - use captured rawBody if available, otherwise reconstruct from parsed body
  const rawBody = (req as any).rawBody || (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));

  // Verify signature
  if (!verifyWebhookSignature(signature, rawBody, signingKey)) {
    return { valid: false, error: ERROR_MESSAGES.INVALID_SIGNATURE };
  }

  const event = parseWebhookEvent(req.body);
  if (!event) {
    return { valid: false, error: ERROR_MESSAGES.INVALID_WEBHOOK_STRUCTURE };
  }

  const paymentId = extractPaymentIdFromEvent(event);
  if (!paymentId) {
    return { valid: false, error: ERROR_MESSAGES.INVALID_PAYMENT_ID };
  }

  return { valid: true, event, paymentId };
}

export function validateWebhookSignatureMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const signingKey = process.env.GOVPAY_WEBHOOK_SIGNING_KEY || '';

  if (!signingKey) {
    logger.error(`[GOVPAY][SIGNATURE][FAILED][${FILE}][validateWebhookSignatureMiddleware] error=signing_key_not_configured`);
    return res.status(500).json({ error: ERROR_MESSAGES.SIGNING_KEY_NOT_CONFIGURED });
  }

  const validation = validateWebhookSignature(req, signingKey);

  if (!validation.valid) {
    logger.error(`[GOVPAY][SIGNATURE][FAILED][${FILE}][validateWebhookSignatureMiddleware] error=${validation.error}`);
    return res.status(401).json({ error: validation.error || ERROR_MESSAGES.SIGNATURE_VERIFICATION_FAILED });
  }

  // Attach validated data to request
  (req as any).webhookEvent = validation.event;
  (req as any).paymentId = validation.paymentId;

  next();
}

export default {
  extractWebhookHeaders,
  verifyWebhookSignature,
  parseWebhookEvent,
  extractPaymentIdFromEvent,
  validateWebhookSignature,
  validateWebhookSignatureMiddleware,
};
