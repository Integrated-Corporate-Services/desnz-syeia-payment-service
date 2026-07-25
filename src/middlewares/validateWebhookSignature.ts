// Webhook Signature Verification Middleware
// Verifies webhook signature from GOV.UK Pay
// Official Documentation: https://docs.payments.service.gov.uk/webhooks/

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { validate as uuidValidate } from 'uuid';
import { ERROR_MESSAGES } from '../constants';
import getLogger from '../utils/loggerHelper';
import config from '../config/config';

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
 * ✅ FIX HIGH-005: Added UUID validation for webhook_message_id
 */
export function extractWebhookHeaders(req: WebhookRequest): {
  signature: string | null;
  webhookId: string | null;
  isValidWebhookId: boolean;
} {
  // Official GOV.UK Pay header name is 'Pay-Signature'
  const signatureHeader = req.headers['pay-signature'];
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader || null;
  
  // ✅ FIX HIGH-005: Validate webhook_message_id is a valid UUID
  // This prevents SQL injection and ensures proper format
  const webhookId = req.body?.webhook_message_id || null;
  const isValidWebhookId = webhookId ? uuidValidate(webhookId) : false;
  
  if (webhookId && !isValidWebhookId) {
    logger.warn('[Webhook] Invalid webhook_message_id format (not a valid UUID)', {
      webhookId,
      type: typeof webhookId,
    });
  }
  
  return { signature, webhookId, isValidWebhookId };
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

    // Extract payment_id from resource if resource_id is not at top level
    const resourceObj = resource as Record<string, unknown>;
    const extractedResourceId = resource_id || resourceObj?.payment_id;

    // Validate essential fields only (more flexible for different webhook formats)
    if (!webhook_message_id || !event_type || !resource) {
      logger.warn('[Webhook] Webhook missing required fields', {
        hasWebhookMessageId: !!webhook_message_id,
        hasApiVersion: !!api_version,
        hasEventType: !!event_type,
        hasResourceId: !!extractedResourceId,
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
      resource_id: String(extractedResourceId || 'unknown'),
      resource_type: String(resource_type || 'payment'),
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
 * ✅ FIX HIGH-005: Added webhook_message_id UUID validation
 */
export function validateWebhookSignature(
  req: any,
  signingKey: string
): { valid: boolean; error?: string; event?: WebhookEvent; paymentId?: string } {
  const { signature, webhookId, isValidWebhookId } = extractWebhookHeaders(req);

  // ✅ FIX HIGH-005: Validate webhook_message_id format before processing
  if (!signature || !webhookId) {
    return { valid: false, error: 'Invalid webhook signature' };
  }
  
  if (!isValidWebhookId) {
    logger.warn('[Webhook] Rejected webhook with invalid webhook_message_id format', {
      webhookId,
      reason: 'Not a valid UUID',
    });
    return { valid: false, error: 'Invalid webhook_message_id format' };
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
  // Check if signature verification is enabled
  if (!config.features.signatureVerificationEnabled) {
    logger.info('[Webhook] Signature verification is disabled - skipping validation');
    
    // Still parse the event for downstream processing
    const event = parseWebhookEvent(req.body);
    if (!event) {
      logger.warn('[Webhook] Invalid webhook event structure');
      return res.status(400).json({ error: 'Invalid webhook event structure' });
    }
    
    const paymentId = extractPaymentIdFromEvent(event);
    if (!paymentId) {
      logger.warn('[Webhook] Unable to extract payment ID from event');
      return res.status(400).json({ error: 'Unable to extract payment ID from event' });
    }
    
    // Attach validated data to request
    (req as any).webhookEvent = event;
    (req as any).paymentId = paymentId;
    
    return next();
  }

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
