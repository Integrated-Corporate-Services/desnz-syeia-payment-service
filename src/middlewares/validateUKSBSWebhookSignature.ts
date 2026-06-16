// UKSBS Webhook Signature Verification Middleware
// Verifies Pay-Signature header for UKSBS webhook payloads

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import getLogger from '../utils/loggerHelper';
import config from '../config/config';
import { HTTP_STATUS } from '../constants/error.constants';

const logger = getLogger(module);

/**
 * Verify UKSBS webhook signature using HMAC-SHA256
 */
function verifyUKSBSSignature(
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
    logger.error('[UKSBSWebhook] Signature verification error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Express middleware for UKSBS webhook signature validation
 */
export function validateUKSBSWebhookSignatureMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Response | void {
  const correlationId = req.headers['x-correlation-id'] || 'unknown';

  // Check if signature verification is enabled
  if (!config.features.signatureVerificationEnabled) {
    logger.info('[UKSBSWebhook] Signature verification is disabled - skipping validation', {
      correlationId,
    });
    return next();
  }

  // Extract Pay-Signature header
  const signatureHeader = req.headers['pay-signature'];
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;

  if (!signature) {
    logger.warn('[UKSBSWebhook] Missing Pay-Signature header', {
      correlationId,
      headers: Object.keys(req.headers),
    });

    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      error: 'Missing Pay-Signature header',
      message: 'UKSBS webhooks require Pay-Signature header for authentication',
      required_header: 'Pay-Signature',
    });
  }

  // Get raw body for signature verification
  const rawBody = (req as any).rawBody || (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));

  // Get UKSBS signing key from config
  const signingKey = config.uksbsWebhookConfig.signingKey;

  if (!signingKey) {
    logger.error('[UKSBSWebhook] UKSBS signing key not configured', {
      correlationId,
    });

    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Server configuration error',
      message: 'UKSBS webhook signing key not configured',
    });
  }

  // Verify signature
  const isValid = verifyUKSBSSignature(signature, rawBody, signingKey);

  if (!isValid) {
    logger.warn('[UKSBSWebhook] Invalid Pay-Signature', {
      correlationId,
      signatureProvided: signature.substring(0, 10) + '...',
      bodyLength: rawBody.length,
    });

    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      error: 'Invalid Pay-Signature',
      message: 'The provided Pay-Signature does not match the expected signature for this payload',
      hint: 'Ensure you are using the correct UKSBS_WEBHOOK_SIGNING_KEY and the exact raw payload',
    });
  }

  logger.info('[UKSBSWebhook] Pay-Signature validated successfully', {
    correlationId,
    eventId: req.body?.event?.eventId,
  });

  next();
}
