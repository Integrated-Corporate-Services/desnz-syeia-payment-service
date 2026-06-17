// BACS Webhook Signature Verification Middleware
// Verifies X-Webhook-Signature header for BACS webhook payloads
// Implements HMAC-SHA256 signature verification per API spec

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import getLogger from '../utils/loggerHelper';
import config from '../config/config';
import { HTTP_STATUS } from '../constants/error.constants';

const logger = getLogger(module);

// ISO 8601 UTC datetime format validation
const ISO_8601_UTC_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
// Valid hexadecimal string (lowercase)
const VALID_HEX_REGEX = /^[0-9a-f]+$/;

/**
 * Verify BACS webhook signature using HMAC-SHA256
 * Signature is computed over: timestamp + "." + rawBody
 * Uses constant-time comparison to prevent timing attacks
 */
function verifyBACSSignature(
  signature: string,
  timestamp: string,
  body: string,
  signingSecret: string
): boolean {
  try {
    // Construct signed message: timestamp + "." + body
    const signedMessage = timestamp + '.' + body;
    
    // Compute HMAC-SHA256
    const expectedSignature = crypto
      .createHmac('sha256', signingSecret)
      .update(signedMessage, 'utf-8')
      .digest('hex');

    // Convert to buffers for constant-time comparison
    const expectedBuf = Buffer.from(expectedSignature, 'hex');
    const receivedBuf = Buffer.from(signature, 'hex');
    
    // Length check before constant-time compare (prevents timing leak via exception)
    if (expectedBuf.length !== receivedBuf.length) {
      return false;
    }
    
    // Constant-time comparison prevents timing attacks
    return crypto.timingSafeEqual(expectedBuf, receivedBuf);
  } catch (error) {
    logger.error('[BACSWebhook] Signature verification error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Express middleware for BACS webhook signature validation
 */
export function validateBACSWebhookSignatureMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Response | void {
  const correlationId = req.headers['x-correlation-id'] || 'unknown';

  // Check if signature verification is enabled
  if (!config.features.signatureVerificationEnabled) {
    logger.info('[BACSWebhook] Signature verification is disabled - skipping validation', {
      correlationId,
    });
    return next();
  }

  // Extract required headers
  const signatureHeader = req.headers['x-webhook-signature'];
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  
  const timestampHeader = req.headers['x-request-timestamp'];
  const timestamp = Array.isArray(timestampHeader) ? timestampHeader[0] : timestampHeader;
  
  const versionHeader = req.headers['x-webhook-signature-version'];
  const version = Array.isArray(versionHeader) ? versionHeader[0] : versionHeader;

  // ── 1. Empty body guard (before any crypto operations) ────────────────────
  const rawBody = (req as any).rawBody || (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
  
  if (!rawBody || rawBody.length === 0) {
    logger.warn('[BACSWebhook] Empty request body', {
      correlationId,
    });

    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Empty body',
    });
  }

  // ── 2. Signature presence check ───────────────────────────────────────────
  if (!signature) {
    logger.warn('[BACSWebhook] Missing X-Webhook-Signature header', {
      correlationId,
      headers: Object.keys(req.headers),
    });

    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      error: 'Missing X-Webhook-Signature header',
    });
  }

  // ── 3. Hex format validation (before buffer conversion) ───────────────────
  const normalizedSignature = signature.trim().toLowerCase();
  if (!VALID_HEX_REGEX.test(normalizedSignature)) {
    logger.warn('[BACSWebhook] Invalid signature format - not hexadecimal', {
      correlationId,
      signaturePrefix: signature.substring(0, 10) + '...',
    });

    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      error: 'Invalid signature format',
    });
  }

  // ── 4. Timestamp presence check (public requirement) ─────────────────────
  if (!timestamp) {
    logger.warn('[BACSWebhook] Missing X-Request-Timestamp header', {
      correlationId,
    });

    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      error: 'Missing X-Request-Timestamp header',
    });
  }

  // ── 5. Version check (public knowledge - before HMAC) ────────────────────
  if (version !== 'v1') {
    logger.warn('[BACSWebhook] Invalid or missing X-Webhook-Signature-Version', {
      correlationId,
      version,
    });

    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Unsupported X-Webhook-Signature-Version',
    });
  }

  // ── 6. Get signing secret ────────────────────────────────────────────────
  const signingSecret = config.bacsWebhookConfig.signingKey;

  if (!signingSecret) {
    logger.error('[BACSWebhook] BACS signing secret not configured', {
      correlationId,
    });

    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: 'Internal error — please retry',
    });
  }

  // ── 7. HMAC signature verification (constant-time) ───────────────────────
  const isValid = verifyBACSSignature(normalizedSignature, timestamp, rawBody, signingSecret);

  if (!isValid) {
    logger.warn('[BACSWebhook] Invalid X-Webhook-Signature', {
      correlationId,
      signatureProvided: signature.substring(0, 10) + '...',
      timestamp,
      bodyLength: rawBody.length,
    });

    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      error: 'Invalid signature',
    });
  }

  // ── 8. Timestamp format validation (AFTER HMAC - prevents probing) ───────
  if (!ISO_8601_UTC_REGEX.test(timestamp)) {
    logger.warn('[BACSWebhook] Invalid timestamp format', {
      correlationId,
      timestamp,
    });

    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      error: 'X-Request-Timestamp must be a valid ISO 8601 datetime',
    });
  }

  // ── 9. Timestamp expiry check (AFTER HMAC - prevents window probing) ─────
  const requestTime = new Date(timestamp).getTime();
  const now = Date.now();
  const timeDiff = Math.abs(now - requestTime);
  const maxTimeDiff = 5 * 60 * 1000; // 5 minutes in milliseconds

  if (isNaN(requestTime) || timeDiff > maxTimeDiff) {
    logger.warn('[BACSWebhook] Timestamp outside acceptable window', {
      correlationId,
      timestamp,
      timeDiffSeconds: isNaN(requestTime) ? 'invalid' : timeDiff / 1000,
    });

    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      error: 'Request timestamp expired or too far in future',
    });
  }

  logger.info('[BACSWebhook] X-Webhook-Signature validated successfully', {
    correlationId,
    timestamp,
    eventId: req.body?.event?.eventId,
  });

  next();
}
