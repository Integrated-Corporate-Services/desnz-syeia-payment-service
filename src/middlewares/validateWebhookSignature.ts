// Webhook Signature Verification Middleware
// Verifies webhook signature from GOV.UK Pay
// Official Documentation: https://docs.payments.service.gov.uk/webhooks/

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { ERROR_MESSAGES } from '../constants';
import getLogger from '../utils/loggerHelper';

const logger = getLogger(module);

interface WebhookSignatureOptions {
  secret: string;
}

interface WebhookEvent {
  webhook_message_id: string; // Updated to match official GOV.UK Pay spec
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
  return { signature, webhookId };
}

/**
 * Verify webhook signature using HMAC-SHA256
 */
export function verifyWebhookSignature(
  signature: string,
  body: string,
  signingKey: string
): boolean {
  try {
    const expectedSignature = crypto
      .createHmac('sha256', signingKey)
      .update(body, 'utf-8')
      .digest('hex');

    return signature === expectedSignature;
  } catch (error) {
    logger.error('[Webhook] Signature verification error', {
      error: error instanceof Error ? error.message : String(error),
    });
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
      logger.warn('[Webhook] Invalid webhook body structure');
      return null;
    }

    const { webhook_message_id, api_version, event_type, created_date, resource_id, resource_type, resource } = rawBody;

    if (!webhook_message_id || !event_type || !resource || !resource_id || !resource_type) {
      logger.warn('[Webhook] Webhook missing required fields', {
        hasWebhookMessageId: !!webhook_message_id,
        hasApiVersion: !!api_version,
        hasEventType: !!event_type,
        hasResourceId: !!resource_id,
        hasResourceType: !!resource_type,
        hasResource: !!resource,
      });
      return null;
    }

    // Type assertions with validation
    if (typeof webhook_message_id !== 'string' || typeof event_type !== 'string') {
      logger.warn('[Webhook] Invalid field types');
      return null;
    }

    return {
      webhook_message_id,
      api_version: typeof api_version === 'number' ? api_version : 1,
      event_type,
      created_date: String(created_date || new Date().toISOString()),
      resource_id: String(resource_id),
      resource_type: String(resource_type),
      resource: resource as Record<string, unknown>,
    };
  } catch (error) {
    logger.error('[Webhook] Error parsing webhook event', {
      error: error instanceof Error ? error.message : String(error),
    });
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
    logger.warn('[Webhook] Unable to extract payment ID from event', {
      webhookMessageId: event.webhook_message_id,
    });
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

  if (!signature || !webhookId) {
    return { valid: false, error: 'Invalid webhook signature' };
  }

  // Get raw body - use captured rawBody if available, otherwise reconstruct from parsed body
  const rawBody = (req as any).rawBody || (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));

  // Verify signature
  if (!verifyWebhookSignature(signature, rawBody, signingKey)) {
    return { valid: false, error: 'Invalid webhook signature' };
  }

  // Parse event
  const event = parseWebhookEvent(req.body);
  if (!event) {
    return { valid: false, error: 'Invalid webhook event structure' };
  }

  // Extract payment ID
  const paymentId = extractPaymentIdFromEvent(event);
  if (!paymentId) {
    return { valid: false, error: 'Unable to extract payment ID from event' };
  }

  return { valid: true, event, paymentId };
}

/**
 * Express middleware for webhook signature validation
 */
export function validateWebhookSignatureMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const signingKey = process.env.GOVPAY_WEBHOOK_SIGNING_KEY || '';

  if (!signingKey) {
    logger.error('[Webhook] GOVPAY_WEBHOOK_SIGNING_KEY not configured');
    return res.status(500).json({ error: 'Webhook signing key not configured' });
  }

  const validation = validateWebhookSignature(req, signingKey);

  if (!validation.valid) {
    logger.warn('[Webhook] Webhook validation failed', {
      error: validation.error,
    });
    return res.status(401).json({ error: validation.error || 'Webhook validation failed' });
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
