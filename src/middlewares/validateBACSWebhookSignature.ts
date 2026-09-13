import { Request, Response, NextFunction } from 'express';
import getLogger from '../utils/loggerHelper';
import { getRequestContext } from './requestContext';
import { computeHmacSignature, constantTimeSignatureCompare } from '../utils/cryptoUtils';
import { HTTP_STATUS, ERROR_CODES, ERROR_CATEGORIES } from '../constants/error.constants';
import { CRYPTO_CONFIG } from '../constants/config.constants';
import config from '../config/config';
import {
  BACS_SIGNATURE_VERSION,
  TIMESTAMP_WINDOW_MS,
  ISO_8601_UTC_REGEX,
  VALID_HEX_REGEX,
  HEADER_WEBHOOK_SIGNATURE,
  HEADER_SIGNATURE_VERSION,
  HEADER_REQUEST_TIMESTAMP,
  ERROR_EMPTY_BODY,
  ERROR_MISSING_SIGNATURE,
  ERROR_INVALID_SIGNATURE_FORMAT,
  ERROR_MISSING_TIMESTAMP,
  ERROR_UNSUPPORTED_VERSION,
  ERROR_INVALID_SIGNATURE,
  ERROR_INVALID_TIMESTAMP_FORMAT,
  ERROR_TIMESTAMP_EXPIRED,
  ERROR_INTERNAL,
  ERROR_CATEGORY_AUTHENTICATION,
  ERROR_CATEGORY_VALIDATION,
  ERROR_CATEGORY_INTERNAL,
} from '../constants/bacs.constants';

const logger = getLogger(module);

const FILE = 'validateBACSWebhookSignature.ts';

function verifyBACSSignature(
  signature: string,
  timestamp: string,
  body: string,
  signingSecret: string
): boolean {
  try {
    // DoS protection: Reject signatures that are too long before any buffer operations
    // HMAC-SHA256 produces exactly 64 hex characters (32 bytes * 2)
    if (signature.length > CRYPTO_CONFIG.SHA256_HEX_LENGTH) {
      logger.error(`[BACS][FAILED][${FILE}][verifyBACSSignature] error=signature_length_exceeds_maximum receivedLength=${signature.length} maxLength=${CRYPTO_CONFIG.SHA256_HEX_LENGTH} category=${ERROR_CATEGORIES.VALIDATION}`);
      return false;
    }

    const signedMessage = `${timestamp}.${body}`;
    const expectedSignature = computeHmacSignature(signedMessage, signingSecret, 'hex');

    return constantTimeSignatureCompare(expectedSignature, signature, 'hex');
  } catch (error) {
    logger.error(`[BACS][FAILED][${FILE}][verifyBACSSignature] error=${error instanceof Error ? error.message : String(error)} category=${ERROR_CATEGORIES.CRYPTOGRAPHY}`);
    return false;
  }
}

export function validateBACSWebhookSignatureMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Response | void {
  const start = Date.now();
  const correlationId = getRequestContext()?.correlation_id;

  logger.info(`[BACS][STARTED][${FILE}][validateBACSWebhookSignatureMiddleware] correlationId=${correlationId}`);
  try {
    return validateBACSWebhookSignatureInternal(req, res, next, correlationId);
  } finally {
    logger.info(`[BACS][ENDED][${FILE}][validateBACSWebhookSignatureMiddleware] correlationId=${correlationId} durationMs=${Date.now() - start}`);
  }
}

function validateBACSWebhookSignatureInternal(
  req: Request,
  res: Response,
  next: NextFunction,
  correlationId: string | undefined
): Response | void {
  const signatureHeader = req.headers[HEADER_WEBHOOK_SIGNATURE];
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;

  const timestampHeader = req.headers[HEADER_REQUEST_TIMESTAMP];
  const timestamp = Array.isArray(timestampHeader) ? timestampHeader[0] : timestampHeader;

  const versionHeader = req.headers[HEADER_SIGNATURE_VERSION];
  const version = Array.isArray(versionHeader) ? versionHeader[0] : versionHeader;

  const rawBody = (req as any).rawBody || (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));

  if (!rawBody || rawBody.length === 0) {
    logger.error(`[BACS][FAILED][${FILE}][validateBACSWebhookSignatureInternal] error=empty_request_body category=${ERROR_CATEGORY_VALIDATION} code=${ERROR_CODES.EMPTY_BODY} - correlationId=${correlationId}`);
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: ERROR_EMPTY_BODY,
      errorCode: ERROR_CODES.EMPTY_BODY,
    });
  }
  if (!signature) {
    logger.error(`[BACS][FAILED][${FILE}][validateBACSWebhookSignatureInternal] error=missing_signature category=${ERROR_CATEGORY_AUTHENTICATION} code=${ERROR_CODES.MISSING_SIGNATURE} - correlationId=${correlationId}`);
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      error: ERROR_MISSING_SIGNATURE,
      errorCode: ERROR_CODES.MISSING_SIGNATURE,
    });
  }

  const normalizedSignature = signature.trim().toLowerCase();
  if (!VALID_HEX_REGEX.test(normalizedSignature)) {
    logger.error(`[BACS][FAILED][${FILE}][validateBACSWebhookSignatureInternal] error=invalid_signature_format category=${ERROR_CATEGORY_AUTHENTICATION} code=${ERROR_CODES.INVALID_SIGNATURE_FORMAT} - correlationId=${correlationId}`);
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      error: ERROR_INVALID_SIGNATURE_FORMAT,
      errorCode: ERROR_CODES.INVALID_SIGNATURE_FORMAT,
    });
  }

  if (!timestamp) {
    logger.error(`[BACS][FAILED][${FILE}][validateBACSWebhookSignatureInternal] error=missing_timestamp category=${ERROR_CATEGORY_AUTHENTICATION} code=${ERROR_CODES.INVALID_TIMESTAMP} - correlationId=${correlationId}`);
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      error: ERROR_MISSING_TIMESTAMP,
      errorCode: ERROR_CODES.INVALID_TIMESTAMP,
    });
  }

  if (version !== BACS_SIGNATURE_VERSION) {
    logger.error(`[BACS][FAILED][${FILE}][validateBACSWebhookSignatureInternal] error=invalid_version version=${version} category=${ERROR_CATEGORY_VALIDATION} code=${ERROR_CODES.UNSUPPORTED_VERSION} - correlationId=${correlationId}`);
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: ERROR_UNSUPPORTED_VERSION,
      errorCode: ERROR_CODES.UNSUPPORTED_VERSION,
    });
  }

  const signingSecret = config.bacsWebhookConfig.signingKey;
  if (!signingSecret) {
    logger.error(`[BACS][FAILED][${FILE}][validateBACSWebhookSignatureInternal] error=signing_secret_not_configured category=${ERROR_CATEGORY_INTERNAL} code=${ERROR_CODES.CONFIGURATION_ERROR} - correlationId=${correlationId}`);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: ERROR_INTERNAL,
      errorCode: ERROR_CODES.CONFIGURATION_ERROR,
    });
  }

  const isValid = verifyBACSSignature(normalizedSignature, timestamp, rawBody, signingSecret);
  if (!isValid) {
    logger.error(`[BACS][FAILED][${FILE}][validateBACSWebhookSignatureInternal] error=invalid_signature category=${ERROR_CATEGORY_AUTHENTICATION} code=${ERROR_CODES.INVALID_SIGNATURE} - correlationId=${correlationId} timestamp=${timestamp} bodyLength=${rawBody.length}`);
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      error: ERROR_INVALID_SIGNATURE,
      errorCode: ERROR_CODES.INVALID_SIGNATURE,
    });
  }

  if (!ISO_8601_UTC_REGEX.test(timestamp)) {
    logger.error(`[BACS][FAILED][${FILE}][validateBACSWebhookSignatureInternal] error=invalid_timestamp_format category=${ERROR_CATEGORY_VALIDATION} code=${ERROR_CODES.INVALID_TIMESTAMP_FORMAT} - correlationId=${correlationId} timestamp=${timestamp}`);
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      error: ERROR_INVALID_TIMESTAMP_FORMAT,
      errorCode: ERROR_CODES.INVALID_TIMESTAMP_FORMAT,
    });
  }

  const requestTime = new Date(timestamp).getTime();
  const now = Date.now();
  const timeDiff = Math.abs(now - requestTime);

  if (isNaN(requestTime) || timeDiff > TIMESTAMP_WINDOW_MS) {
    logger.error(`[BACS][FAILED][${FILE}][validateBACSWebhookSignatureInternal] error=timestamp_outside_window category=${ERROR_CATEGORY_AUTHENTICATION} code=${ERROR_CODES.TIMESTAMP_EXPIRED} - correlationId=${correlationId} timestamp=${timestamp} timeDiffSeconds=${isNaN(requestTime) ? 'invalid' : timeDiff / 1000}`);
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      error: ERROR_TIMESTAMP_EXPIRED,
      errorCode: ERROR_CODES.TIMESTAMP_EXPIRED,
    });
  }

  logger.info(`[BACS][SIGNATURE_VALIDATED][${FILE}][validateBACSWebhookSignatureInternal] signature validated - correlationId=${correlationId} timestamp=${timestamp} eventId=${req.body?.event?.eventId}`);
  next();
}
