import { Request, Response, NextFunction } from 'express';
import {
  BACSWebhookPayload,
  BACSValidationError,
  BACSValidationResult,
  BACS_EVENT_TYPES,
  BACS_PAYMENT_STATUSES,
  BACS_CURRENCY_CODES,
  isBACSWebhookPayload,
} from '../types/bacsWebhook.types';
import { HTTP_STATUS, ERROR_CODES } from '../constants/error.constants';
import getLogger from '../utils/loggerHelper';
import {
  ISO_8601_DATE_REGEX,
  DATE_REGEX,
  UUID_V4_REGEX,
  EVENT_VERSION_REGEX,
  HEADER_CORRELATION_ID,
  DEFAULT_CORRELATION_ID,
  SUPPORTED_EVENT_VERSION,
  ERROR_PAYLOAD_REQUIRED,
  ERROR_PAYLOAD_STRUCTURE,
  ERROR_SCHEMA_VALIDATION_FAILED,
  ERROR_EVENT_REQUIRED,
  ERROR_EVENT_ID_INVALID_UUID,
  ERROR_EVENT_TYPE_INVALID,
  ERROR_OCCURRED_AT_INVALID,
  ERROR_EVENT_VERSION_FORMAT,
  ERROR_EVENT_VERSION_UNSUPPORTED,
  ERROR_CALLBACK_INVALID,
  ERROR_DELIVERY_ID_INVALID,
  ERROR_DELIVERY_ID_UUID,
  ERROR_ATTEMPT_NUMBER_INVALID,
  ERROR_ATTEMPT_NUMBER_POSITIVE,
  ERROR_PAYMENT_REQUIRED,
  ERROR_PAYMENT_REFERENCE_LENGTH,
  ERROR_DETAIL_REQUIRED,
  ERROR_STATUS_INVALID,
  ERROR_AMOUNT_POSITIVE,
  ERROR_AMOUNT_INTEGER,
  ERROR_CURRENCY_INVALID,
  ERROR_PAYMENT_DATE_FORMAT,
  ERROR_TRANSFER_REFERENCE_INVALID,
} from '../constants/bacs.constants';

const logger = getLogger(module);

export function validateBACSWebhookPayload(payload: any): BACSValidationResult {
  const errors: BACSValidationError[] = [];

  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: [{ field: 'payload', message: ERROR_PAYLOAD_REQUIRED }] };
  }

  if (!isBACSWebhookPayload(payload)) {
    return { valid: false, errors: [{ field: 'payload', message: ERROR_PAYLOAD_STRUCTURE }] };
  }

  validateEventSection(payload.event, errors);

  if (payload.callback !== undefined) {
    validateCallbackSection(payload.callback, errors);
  }

  validatePaymentSection(payload.payment, errors);
  validateDetailSection(payload.detail, errors);

  return { valid: errors.length === 0, errors };
}
function validateEventSection(event: any, errors: BACSValidationError[]): void {
  if (!event || typeof event !== 'object') {
    errors.push({ field: 'event', message: ERROR_EVENT_REQUIRED });
    return;
  }

  // Validate required string fields
  validateRequiredString(event, 'eventId', errors, 'event.eventId');
  validateRequiredString(event, 'eventType', errors, 'event.eventType');
  validateRequiredString(event, 'eventVersion', errors, 'event.eventVersion');
  validateRequiredString(event, 'occurredAt', errors, 'event.occurredAt');
  validateRequiredString(event, 'source', errors, 'event.source');

  // Validate eventId is a valid UUID
  if (event.eventId && typeof event.eventId === 'string') {
    if (!isValidUUID(event.eventId)) {
      errors.push({
        field: 'event.eventId',
        message: ERROR_EVENT_ID_INVALID_UUID,
        value: event.eventId,
      });
    }
  }

  // Validate eventType is recognized
  if (event.eventType && typeof event.eventType === 'string') {
    const validEventTypes = Object.values(BACS_EVENT_TYPES);
    if (!validEventTypes.includes(event.eventType as any)) {
      errors.push({
        field: 'event.eventType',
        message: ERROR_EVENT_TYPE_INVALID,
        value: event.eventType,
      });
    }
  }

  // Validate occurredAt is ISO 8601 format
  if (event.occurredAt && typeof event.occurredAt === 'string') {
    if (!isValidISODate(event.occurredAt)) {
      errors.push({
        field: 'event.occurredAt',
        message: ERROR_OCCURRED_AT_INVALID,
        value: event.occurredAt,
      });
    }
  }

  if (event.eventVersion && typeof event.eventVersion === 'string') {
    if (!EVENT_VERSION_REGEX.test(event.eventVersion)) {
      errors.push({
        field: 'event.eventVersion',
        message: ERROR_EVENT_VERSION_FORMAT,
        value: event.eventVersion,
      });
    } else if (event.eventVersion !== SUPPORTED_EVENT_VERSION) {
      errors.push({
        field: 'event.eventVersion',
        message: ERROR_EVENT_VERSION_UNSUPPORTED,
        value: event.eventVersion,
      });
    }
  }
}

/**
 * Validate callback section (optional)
 */
function validateCallbackSection(callback: any, errors: BACSValidationError[]): void {
  if (!callback || typeof callback !== 'object') {
    errors.push({
      field: 'callback',
      message: ERROR_CALLBACK_INVALID,
    });
    return;
  }

  // Validate optional fields (only if present)
  if (callback.deliveryId !== undefined) {
    if (typeof callback.deliveryId !== 'string' || callback.deliveryId.trim().length === 0) {
      errors.push({
        field: 'callback.deliveryId',
        message: ERROR_DELIVERY_ID_INVALID,
        value: callback.deliveryId,
      });
    }
  }

  if (callback.attemptNumber !== undefined) {
    if (typeof callback.attemptNumber !== 'number') {
      errors.push({
        field: 'callback.attemptNumber',
        message: ERROR_ATTEMPT_NUMBER_INVALID,
        value: callback.attemptNumber,
      });
    }
  }

  // Validate deliveryId format (UUID) if present
  if (callback.deliveryId && typeof callback.deliveryId === 'string') {
    if (!isValidUUID(callback.deliveryId)) {
      errors.push({
        field: 'callback.deliveryId',
        message: ERROR_DELIVERY_ID_UUID,
        value: callback.deliveryId,
      });
    }
  }

  // Validate attemptNumber is a positive integer if present
  if (callback.attemptNumber !== undefined && typeof callback.attemptNumber === 'number') {
    if (!Number.isInteger(callback.attemptNumber) || callback.attemptNumber < 1) {
      errors.push({
        field: 'callback.attemptNumber',
        message: ERROR_ATTEMPT_NUMBER_POSITIVE,
        value: callback.attemptNumber,
      });
    }
  }
}

/**
 * Validate payment section
 */
function validatePaymentSection(payment: any, errors: BACSValidationError[]): void {
  if (!payment || typeof payment !== 'object') {
    errors.push({
      field: 'payment',
      message: ERROR_PAYMENT_REQUIRED,
    });
    return;
  }

  // Validate required fields
  validateRequiredString(payment, 'paymentReference', errors, 'payment.paymentReference');

  // Validate paymentReference format (e.g., "PAY-2026-00123456")
  if (payment.paymentReference && typeof payment.paymentReference === 'string') {
    if (payment.paymentReference.length === 0 || payment.paymentReference.length > 100) {
      errors.push({
        field: 'payment.paymentReference',
        message: ERROR_PAYMENT_REFERENCE_LENGTH,
        value: payment.paymentReference,
      });
    }
  }
}

/**
 * Validate detail section
 */
function validateDetailSection(detail: any, errors: BACSValidationError[]): void {
  if (!detail || typeof detail !== 'object') {
    errors.push({
      field: 'detail',
      message: ERROR_DETAIL_REQUIRED,
    });
    return;
  }

  // Validate required fields
  validateRequiredString(detail, 'status', errors, 'detail.status');
  validateRequiredNumber(detail, 'amount', errors, 'detail.amount');
  validateRequiredString(detail, 'currency', errors, 'detail.currency');
  validateRequiredString(detail, 'paymentDate', errors, 'detail.paymentDate');
  
  // transferReference is optional (FAILED payments may not have a transfer match)
  if (detail.transferReference !== undefined) {
    if (typeof detail.transferReference !== 'string' || detail.transferReference.trim().length === 0) {
      errors.push({
        field: 'detail.transferReference',
        message: ERROR_TRANSFER_REFERENCE_INVALID,
        value: detail.transferReference,
      });
    }
  }

  // Validate status is recognized
  if (detail.status && typeof detail.status === 'string') {
    const validStatuses = Object.values(BACS_PAYMENT_STATUSES);
    if (!validStatuses.includes(detail.status as any)) {
      errors.push({
        field: 'detail.status',
        message: ERROR_STATUS_INVALID,
        value: detail.status,
      });
    }
  }

  // Validate amount is a positive number
  if (typeof detail.amount === 'number') {
    if (detail.amount <= 0) {
      errors.push({
        field: 'detail.amount',
        message: ERROR_AMOUNT_POSITIVE,
        value: detail.amount,
      });
    }
    if (!Number.isInteger(detail.amount)) {
      errors.push({
        field: 'detail.amount',
        message: ERROR_AMOUNT_INTEGER,
        value: detail.amount,
      });
    }
  }

  // Validate currency code
  if (detail.currency && typeof detail.currency === 'string') {
    const validCurrencies = Object.values(BACS_CURRENCY_CODES);
    if (!validCurrencies.includes(detail.currency as any)) {
      errors.push({
        field: 'detail.currency',
        message: ERROR_CURRENCY_INVALID,
        value: detail.currency,
      });
    }
  }

  // Validate paymentDate format (YYYY-MM-DD)
  if (detail.paymentDate && typeof detail.paymentDate === 'string') {
    if (!isValidDateFormat(detail.paymentDate)) {
      errors.push({
        field: 'detail.paymentDate',
        message: ERROR_PAYMENT_DATE_FORMAT,
        value: detail.paymentDate,
      });
    }
  }
}

/**
 * Helper: Validate required string field
 */
function validateRequiredString(
  obj: any,
  field: string,
  errors: BACSValidationError[],
  fieldPath?: string
): void {
  const path = fieldPath || field;
  if (!obj[field]) {
    errors.push({ field: path, message: `${path} is required` });
  } else if (typeof obj[field] !== 'string') {
    errors.push({
      field: path,
      message: `${path} must be a string`,
      value: obj[field],
    });
  } else if (obj[field].trim().length === 0) {
    errors.push({
      field: path,
      message: `${path} cannot be empty`,
      value: obj[field],
    });
  }
}

/**
 * Helper: Validate required number field
 */
function validateRequiredNumber(
  obj: any,
  field: string,
  errors: BACSValidationError[],
  fieldPath?: string
): void {
  const path = fieldPath || field;
  if (obj[field] === undefined || obj[field] === null) {
    errors.push({ field: path, message: `${path} is required` });
  } else if (typeof obj[field] !== 'number') {
    errors.push({
      field: path,
      message: `${path} must be a number`,
      value: obj[field],
    });
  }
}

function isValidISODate(dateString: string): boolean {
  if (!ISO_8601_DATE_REGEX.test(dateString)) {
    return false;
  }
  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

function isValidDateFormat(dateString: string): boolean {
  if (!DATE_REGEX.test(dateString)) {
    return false;
  }
  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

function isValidUUID(uuid: string): boolean {
  return UUID_V4_REGEX.test(uuid);
}

export function validateBACSWebhookPayloadMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Response | void {
  const correlationId = req.headers[HEADER_CORRELATION_ID] || DEFAULT_CORRELATION_ID;

  const validationResult = validateBACSWebhookPayload(req.body);

  if (!validationResult.valid) {
    logger.warn('[BACSWebhook] Payload validation failed', {
      correlationId,
      errors: validationResult.errors,
      error_category: 'validation',
      error_code: ERROR_CODES.VALIDATION_ERROR,
    });

    // Return 422 for schema validation failures (non-retryable)
    // Per Partner spec: minimal error response, detailed errors are logged
    // This signals to partner to stop retrying (circuit-breaker for version changes)
    return res.status(HTTP_STATUS.UNPROCESSABLE_ENTITY).json({
      error: ERROR_SCHEMA_VALIDATION_FAILED,
      errorCode: ERROR_CODES.VALIDATION_ERROR,
    });
  }

  // Attach validated data to request for downstream use
  (req as any).BACSWebhookEvent = req.body;
  (req as any).paymentId = req.body.payment.paymentReference;

  logger.info('[BACSWebhook] Payload validation successful', {
    correlationId,
    eventId: req.body.event.eventId,
    eventType: req.body.event.eventType,
    paymentReference: req.body.payment.paymentReference,
  });

  next();
}
