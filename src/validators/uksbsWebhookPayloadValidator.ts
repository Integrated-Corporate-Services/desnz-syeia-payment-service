/**
 * UKSBS Webhook Payload Validator
 * Validates incoming UKSBS webhook payloads against specification
 */

import { Request, Response, NextFunction } from 'express';
import {
  UKSBSWebhookPayload,
  UKSBSValidationError,
  UKSBSValidationResult,
  UKSBS_EVENT_TYPES,
  UKSBS_PAYMENT_STATUSES,
  UKSBS_CURRENCY_CODES,
  isUKSBSWebhookPayload,
} from '../types/uksbsWebhook.types';
import { HTTP_STATUS } from '../constants/error.constants';
import getLogger from '../utils/loggerHelper';

const logger = getLogger(module);

/**
 * Validate complete UKSBS webhook payload
 */
export function validateUKSBSWebhookPayload(payload: any): UKSBSValidationResult {
  const errors: UKSBSValidationError[] = [];

  // Check if payload exists
  if (!payload || typeof payload !== 'object') {
    return {
      valid: false,
      errors: [{ field: 'payload', message: 'Payload is required and must be an object' }],
    };
  }

  // Type guard check
  if (!isUKSBSWebhookPayload(payload)) {
    errors.push({
      field: 'payload',
      message: 'Payload structure does not match UKSBS webhook format',
    });
    return { valid: false, errors };
  }

  // Validate event section
  validateEventSection(payload.event, errors);

  // Validate callback section
  validateCallbackSection(payload.callback, errors);

  // Validate payment section
  validatePaymentSection(payload.payment, errors);

  // Validate detail section
  validateDetailSection(payload.detail, errors);

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate event section
 */
function validateEventSection(event: any, errors: UKSBSValidationError[]): void {
  if (!event || typeof event !== 'object') {
    errors.push({ field: 'event', message: 'event section is required and must be an object' });
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
        message: 'eventId must be a valid UUID',
        value: event.eventId,
      });
    }
  }

  // Validate eventType is recognized
  if (event.eventType && typeof event.eventType === 'string') {
    const validEventTypes = Object.values(UKSBS_EVENT_TYPES);
    if (!validEventTypes.includes(event.eventType as any)) {
      errors.push({
        field: 'event.eventType',
        message: `Invalid eventType. Must be one of: ${validEventTypes.join(', ')}`,
        value: event.eventType,
      });
    }
  }

  // Validate occurredAt is ISO 8601 format
  if (event.occurredAt && typeof event.occurredAt === 'string') {
    if (!isValidISODate(event.occurredAt)) {
      errors.push({
        field: 'event.occurredAt',
        message: 'occurredAt must be a valid ISO 8601 date string',
        value: event.occurredAt,
      });
    }
  }

  // Validate eventVersion format (e.g., "1.0")
  if (event.eventVersion && typeof event.eventVersion === 'string') {
    if (!/^\d+\.\d+$/.test(event.eventVersion)) {
      errors.push({
        field: 'event.eventVersion',
        message: 'eventVersion must be in format "X.Y" (e.g., "1.0")',
        value: event.eventVersion,
      });
    }
  }
}

/**
 * Validate callback section
 */
function validateCallbackSection(callback: any, errors: UKSBSValidationError[]): void {
  if (!callback || typeof callback !== 'object') {
    errors.push({
      field: 'callback',
      message: 'callback section is required and must be an object',
    });
    return;
  }

  // Validate required fields
  validateRequiredString(callback, 'deliveryId', errors, 'callback.deliveryId');
  validateRequiredNumber(callback, 'attemptNumber', errors, 'callback.attemptNumber');

  // Validate deliveryId is a valid UUID
  if (callback.deliveryId && typeof callback.deliveryId === 'string') {
    if (!isValidUUID(callback.deliveryId)) {
      errors.push({
        field: 'callback.deliveryId',
        message: 'deliveryId must be a valid UUID',
        value: callback.deliveryId,
      });
    }
  }

  // Validate attemptNumber is a positive integer
  if (typeof callback.attemptNumber === 'number') {
    if (!Number.isInteger(callback.attemptNumber) || callback.attemptNumber < 1) {
      errors.push({
        field: 'callback.attemptNumber',
        message: 'attemptNumber must be a positive integer >= 1',
        value: callback.attemptNumber,
      });
    }
  }
}

/**
 * Validate payment section
 */
function validatePaymentSection(payment: any, errors: UKSBSValidationError[]): void {
  if (!payment || typeof payment !== 'object') {
    errors.push({
      field: 'payment',
      message: 'payment section is required and must be an object',
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
        message: 'paymentReference must be between 1 and 100 characters',
        value: payment.paymentReference,
      });
    }
  }
}

/**
 * Validate detail section
 */
function validateDetailSection(detail: any, errors: UKSBSValidationError[]): void {
  if (!detail || typeof detail !== 'object') {
    errors.push({
      field: 'detail',
      message: 'detail section is required and must be an object',
    });
    return;
  }

  // Validate required fields
  validateRequiredString(detail, 'status', errors, 'detail.status');
  validateRequiredNumber(detail, 'amount', errors, 'detail.amount');
  validateRequiredString(detail, 'currency', errors, 'detail.currency');
  validateRequiredString(detail, 'paymentDate', errors, 'detail.paymentDate');
  validateRequiredString(detail, 'transferReference', errors, 'detail.transferReference');

  // Validate status is recognized
  if (detail.status && typeof detail.status === 'string') {
    const validStatuses = Object.values(UKSBS_PAYMENT_STATUSES);
    if (!validStatuses.includes(detail.status as any)) {
      errors.push({
        field: 'detail.status',
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        value: detail.status,
      });
    }
  }

  // Validate amount is a positive number
  if (typeof detail.amount === 'number') {
    if (detail.amount <= 0) {
      errors.push({
        field: 'detail.amount',
        message: 'amount must be a positive number (in pence)',
        value: detail.amount,
      });
    }
    if (!Number.isInteger(detail.amount)) {
      errors.push({
        field: 'detail.amount',
        message: 'amount must be an integer (pence)',
        value: detail.amount,
      });
    }
  }

  // Validate currency code
  if (detail.currency && typeof detail.currency === 'string') {
    const validCurrencies = Object.values(UKSBS_CURRENCY_CODES);
    if (!validCurrencies.includes(detail.currency as any)) {
      errors.push({
        field: 'detail.currency',
        message: `Invalid currency. Must be one of: ${validCurrencies.join(', ')}`,
        value: detail.currency,
      });
    }
  }

  // Validate paymentDate format (YYYY-MM-DD)
  if (detail.paymentDate && typeof detail.paymentDate === 'string') {
    if (!isValidDateFormat(detail.paymentDate)) {
      errors.push({
        field: 'detail.paymentDate',
        message: 'paymentDate must be in format YYYY-MM-DD',
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
  errors: UKSBSValidationError[],
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
  errors: UKSBSValidationError[],
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

/**
 * Helper: Check if string is valid ISO 8601 date
 */
function isValidISODate(dateString: string): boolean {
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
  if (!isoDateRegex.test(dateString)) {
    return false;
  }
  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

/**
 * Helper: Check if string is valid date format (YYYY-MM-DD)
 */
function isValidDateFormat(dateString: string): boolean {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateString)) {
    return false;
  }
  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

/**
 * Helper: Check if string is valid UUID
 */
function isValidUUID(uuid: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Express middleware for UKSBS webhook payload validation
 */
export function validateUKSBSWebhookPayloadMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Response | void {
  const correlationId = req.headers['x-correlation-id'] || 'unknown';

  // Validate payload
  const validationResult = validateUKSBSWebhookPayload(req.body);

  if (!validationResult.valid) {
    logger.warn('[UKSBSWebhook] Payload validation failed', {
      correlationId,
      errors: validationResult.errors,
    });

    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: 'Invalid webhook payload',
      validation_errors: validationResult.errors,
    });
  }

  // Attach validated data to request for downstream use
  (req as any).uksbsWebhookEvent = req.body;
  (req as any).paymentId = req.body.payment.paymentReference;

  logger.info('[UKSBSWebhook] Payload validation successful', {
    correlationId,
    eventId: req.body.event.eventId,
    eventType: req.body.event.eventType,
    paymentReference: req.body.payment.paymentReference,
  });

  next();
}
