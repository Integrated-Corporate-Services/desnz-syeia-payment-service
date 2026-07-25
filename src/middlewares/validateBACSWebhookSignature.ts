import { Request, Response, NextFunction } from 'express';
import getLogger from '../utils/loggerHelper';
import { computeHmacSignature, constantTimeSignatureCompare } from '../utils/cryptoUtils';
import { HTTP_STATUS, ERROR_CODES, ERROR_CATEGORIES } from '../constants/error.constants';
import config from '../config/config';
import {
  BACS_SIGNATURE_VERSION,
  TIMESTAMP_WINDOW_MS,
  ISO_8601_UTC_REGEX,
  VALID_HEX_REGEX,
  HEADER_WEBHOOK_SIGNATURE,
  HEADER_SIGNATURE_VERSION,
  HEADER_REQUEST_TIMESTAMP,
  HEADER_CORRELATION_ID,
  ERROR_EMPTY_BODY,
  ERROR_MISSING_SIGNATURE,
  ERROR_INVALID_SIGNATURE_FORMAT,
  ERROR_MISSING_TIMESTAMP,
  ERROR_UNSUPPORTED_VERSION,
  ERROR_INVALID_SIGNATURE,
  ERROR_INVALID_TIMESTAMP_FORMAT,
  ERROR_TIMESTAMP_EXPIRED,
  ERROR_INTERNAL,
  DEFAULT_CORRELATION_ID,
  ERROR_CATEGORY_AUTHENTICATION,
  ERROR_CATEGORY_VALIDATION,
  ERROR_CATEGORY_INTERNAL,
} from '../constants/bacs.constants';

const logger = getLogger(module);

function verifyBACSSignature(
  signature: string,
  timestamp: string,
  body: string,
  signingSecret: string
): boolean {
  try {
    const signedMessage = `${timestamp}.${body}`;
    const expectedSignature = computeHmacSignature(signedMessage, signingSecret, 'hex');
    
    return constantTimeSignatureCompare(expectedSignature, signature, 'hex');
  } catch (error) {
    logger.error('[BACSWebhook] Signature verification error', {
      error: error instanceof Error ? error.message : String(error),
      error_category: ERROR_CATEGORIES.CRYPTOGRAPHY,
    });
    return false;
  }
}

export function validateBACSWebhookSignatureMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Response | void {
  const correlationId = req.headers[HEADER_CORRELATION_ID] || DEFAULT_CORRELATION_ID;

  const signatureHeader = req.headers[HEADER_WEBHOOK_SIGNATURE];
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  
  const timestampHeader = req.headers[HEADER_REQUEST_TIMESTAMP];
  const timestamp = Array.isArray(timestampHeader) ? timestampHeader[0] : timestampHeader;
  
  const versionHeader = req.headers[HEADER_SIGNATURE_VERSION];
  const version = Array.isArray(versionHeader) ? versionHeader[0] : versionHeader;

  const rawBody = (req as any).rawBody || (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
  
  if (!rawBody || rawBody.length === 0) {
    logger.warn('[BACSWebhook] Empty request body', {
      correlationId,
      error_category: ERROR_CATEGORY_VALIDATION,
      error_code: ERROR_CODES.EMPTY_BODY,
    });
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
      error: ERROR_EMPTY_BODY,
      errorCode: ERROR_CODES.EMPTY_BODY,
    });
  }
  if (!signature) {
    logger.warn('[BACSWebhook] Missing signature', {
      correlationId,
      error_category: ERROR_CATEGORY_AUTHENTICATION,
      error_code: ERROR_CODES.MISSING_SIGNATURE,
    });
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({ 
      error: ERROR_MISSING_SIGNATURE,
      errorCode: ERROR_CODES.MISSING_SIGNATURE,
    });
  }

  const normalizedSignature = signature.trim().toLowerCase();
  if (!VALID_HEX_REGEX.test(normalizedSignature)) {
    logger.warn('[BACSWebhook] Invalid signature format', {
      correlationId,
      error_category: ERROR_CATEGORY_AUTHENTICATION,
      error_code: ERROR_CODES.INVALID_SIGNATURE_FORMAT,
    });
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({ 
      error: ERROR_INVALID_SIGNATURE_FORMAT,
      errorCode: ERROR_CODES.INVALID_SIGNATURE_FORMAT,
    });
  }

  if (!timestamp) {
    logger.warn('[BACSWebhook] Missing timestamp', {
      correlationId,
      error_category: ERROR_CATEGORY_AUTHENTICATION,
      error_code: ERROR_CODES.INVALID_TIMESTAMP,
    });
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({ 
      error: ERROR_MISSING_TIMESTAMP,
      errorCode: ERROR_CODES.INVALID_TIMESTAMP,
    });
  }

  if (version !== BACS_SIGNATURE_VERSION) {
    logger.warn('[BACSWebhook] Invalid version', {
      correlationId,
      version,
      error_category: ERROR_CATEGORY_VALIDATION,
      error_code: ERROR_CODES.UNSUPPORTED_VERSION,
    });
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
      error: ERROR_UNSUPPORTED_VERSION,
      errorCode: ERROR_CODES.UNSUPPORTED_VERSION,
    });
  }

  const signingSecret = config.bacsWebhookConfig.signingKey;
  if (!signingSecret) {
    logger.error('[BACSWebhook] Signing secret not configured', {
      correlationId,
      error_category: ERROR_CATEGORY_INTERNAL,
      error_code: ERROR_CODES.CONFIGURATION_ERROR,
    });
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ 
      error: ERROR_INTERNAL,
      errorCode: ERROR_CODES.CONFIGURATION_ERROR,
    });
  }

  const isValid = verifyBACSSignature(normalizedSignature, timestamp, rawBody, signingSecret);
  if (!isValid) {
    logger.warn('[BACSWebhook] Invalid signature', {
      correlationId,
      timestamp,
      bodyLength: rawBody.length,
      error_category: ERROR_CATEGORY_AUTHENTICATION,
      error_code: ERROR_CODES.INVALID_SIGNATURE,
    });
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({ 
      error: ERROR_INVALID_SIGNATURE,
      errorCode: ERROR_CODES.INVALID_SIGNATURE,
    });
  }

  if (!ISO_8601_UTC_REGEX.test(timestamp)) {
    logger.warn('[BACSWebhook] Invalid timestamp format', {
      correlationId,
      timestamp,
      error_category: ERROR_CATEGORY_VALIDATION,
      error_code: ERROR_CODES.INVALID_TIMESTAMP_FORMAT,
    });
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({ 
      error: ERROR_INVALID_TIMESTAMP_FORMAT,
      errorCode: ERROR_CODES.INVALID_TIMESTAMP_FORMAT,
    });
  }

  const requestTime = new Date(timestamp).getTime();
  const now = Date.now();
  const timeDiff = Math.abs(now - requestTime);

  if (isNaN(requestTime) || timeDiff > TIMESTAMP_WINDOW_MS) {
    logger.warn('[BACSWebhook] Timestamp outside window', {
      correlationId,
      timestamp,
      timeDiffSeconds: isNaN(requestTime) ? 'invalid' : timeDiff / 1000,
      error_category: ERROR_CATEGORY_AUTHENTICATION,
      error_code: ERROR_CODES.TIMESTAMP_EXPIRED,
    });
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({ 
      error: ERROR_TIMESTAMP_EXPIRED,
      errorCode: ERROR_CODES.TIMESTAMP_EXPIRED,
    });
  }

  logger.info('[BACSWebhook] Signature validated', { correlationId, timestamp, eventId: req.body?.event?.eventId });
  next();
}
