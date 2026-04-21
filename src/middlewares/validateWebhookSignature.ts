// Webhook Signature Verification Middleware
// Verifies webhook signature from GOV.UK Pay

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { ERROR_MESSAGES } from '../constants';
const getLogger = require('../utils/loggerHelper');
const logger = getLogger(module);

interface WebhookSignatureOptions {
  secret: string;
}

interface WebhookEvent {
  webhook_id: string;
  event_type: string;
  created_date: string;
  resource: Record<string, any>;
}

/**
 * Extract webhook signature and ID from request headers
 */
export function extractWebhookHeaders(req: any): {
  signature: string | null;
  webhookId: string | null;
} {
  const signature = req.headers['x-webhook-signature'] || null;
  const webhookId = req.headers['x-webhook-id'] || (req.body?.webhook_id || null);
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
 */
export function parseWebhookEvent(rawBody: any): WebhookEvent | null {
  try {
    if (!rawBody || typeof rawBody !== 'object') {
      logger.warn('[Webhook] Invalid webhook body structure');
      return null;
    }

    const { webhook_id, event_type, created_date, resource } = rawBody;

    if (!webhook_id || !event_type || !resource) {
      logger.warn('[Webhook] Webhook missing required fields', {
        hasWebhookId: !!webhook_id,
        hasEventType: !!event_type,
        hasResource: !!resource,
      });
      return null;
    }

    return {
      webhook_id,
      event_type,
      created_date,
      resource,
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
 */
export function extractPaymentIdFromEvent(event: WebhookEvent): string | null {
  // GOV.UK Pay uses 'external_id' for custom reference, or 'payment_id' as fallback
  const paymentId = event.resource?.external_id || event.resource?.payment_id;

  if (!paymentId) {
    logger.warn('[Webhook] Unable to extract payment ID from event', {
      webhookId: event.webhook_id,
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
    return { valid: false, error: ERROR_MESSAGES.MISSING_SIGNATURE };
  }

  // Get raw body
  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

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
