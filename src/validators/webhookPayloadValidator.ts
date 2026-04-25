/**
 * Webhook Payload Validator
 * Validates incoming webhook payloads against GOV.UK Pay specification
 */

import {
  WebhookPayload,
  ValidationError,
  ValidationResult,
  PaymentResource,
  PaymentState,
} from '../types/webhook.types';
import { WEBHOOK_EVENT_TYPES } from '../constants/webhook.constants';
import getLogger from '../utils/loggerHelper';

const logger = getLogger(module);

/**
 * Validate webhook payload structure and required fields
 */
export function validateWebhookPayload(payload: any): ValidationResult {
  const errors: ValidationError[] = [];

  // Check if payload exists
  if (!payload || typeof payload !== 'object') {
    return {
      valid: false,
      errors: [{ field: 'payload', message: 'Payload is required and must be an object' }],
    };
  }

  // Validate root level required fields
  validateRequiredString(payload, 'webhook_message_id', errors);
  validateRequiredNumber(payload, 'api_version', errors);
  validateRequiredString(payload, 'created_date', errors);
  validateRequiredString(payload, 'resource_id', errors);
  validateRequiredString(payload, 'resource_type', errors);
  validateRequiredString(payload, 'event_type', errors);

  // Validate resource_type is "payment"
  if (payload.resource_type && payload.resource_type !== 'payment') {
    errors.push({
      field: 'resource_type',
      message: 'resource_type must be "payment"',
      value: payload.resource_type,
    });
  }

  // Validate event_type is recognized
  if (payload.event_type) {
    const validEventTypes = Object.values(WEBHOOK_EVENT_TYPES);
    if (!validEventTypes.includes(payload.event_type)) {
      errors.push({
        field: 'event_type',
        message: `Invalid event_type. Must be one of: ${validEventTypes.join(', ')}`,
        value: payload.event_type,
      });
    }
  }

  // Validate created_date is ISO 8601 format
  if (payload.created_date && !isValidISODate(payload.created_date)) {
    errors.push({
      field: 'created_date',
      message: 'created_date must be a valid ISO 8601 date string',
      value: payload.created_date,
    });
  }

  // Validate resource object exists
  if (!payload.resource || typeof payload.resource !== 'object') {
    errors.push({
      field: 'resource',
      message: 'resource is required and must be an object',
    });
  } else {
    // Validate resource fields
    validatePaymentResource(payload.resource, errors);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate payment resource object
 */
function validatePaymentResource(resource: any, errors: ValidationError[]): void {
  // Required fields
  validateRequiredNumber(resource, 'amount', errors, 'resource.amount');
  validateRequiredString(resource, 'description', errors, 'resource.description');
  validateRequiredString(resource, 'reference', errors, 'resource.reference');
  validateRequiredString(resource, 'payment_id', errors, 'resource.payment_id');
  validateRequiredString(resource, 'payment_provider', errors, 'resource.payment_provider');
  validateRequiredString(resource, 'created_date', errors, 'resource.created_date');

  // Validate amount is positive
  if (typeof resource.amount === 'number' && resource.amount <= 0) {
    errors.push({
      field: 'resource.amount',
      message: 'amount must be a positive number (in pence)',
      value: resource.amount,
    });
  }

  // Validate email format if provided
  if (resource.email && !isValidEmail(resource.email)) {
    errors.push({
      field: 'resource.email',
      message: 'email must be a valid email address',
      value: resource.email,
    });
  }

  // Validate state object
  if (!resource.state || typeof resource.state !== 'object') {
    errors.push({
      field: 'resource.state',
      message: 'state is required and must be an object',
    });
  } else {
    validatePaymentState(resource.state, errors);
  }

  // Validate created_date format
  if (resource.created_date && !isValidISODate(resource.created_date)) {
    errors.push({
      field: 'resource.created_date',
      message: 'created_date must be a valid ISO 8601 date string',
      value: resource.created_date,
    });
  }

  // Validate card_details if provided
  if (resource.card_details && typeof resource.card_details === 'object') {
    validateCardDetails(resource.card_details, errors);
  }
}

/**
 * Validate payment state object
 */
function validatePaymentState(state: any, errors: ValidationError[]): void {
  validateRequiredString(state, 'status', errors, 'resource.state.status');
  validateRequiredBoolean(state, 'finished', errors, 'resource.state.finished');

  // Validate status is a known value
  const validStatuses = [
    'created',
    'started',
    'submitted',
    'success',
    'failed',
    'cancelled',
    'error',
    'capturable',
    'expired',
  ];

  if (state.status && !validStatuses.includes(state.status)) {
    errors.push({
      field: 'resource.state.status',
      message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      value: state.status,
    });
  }
}

/**
 * Validate card details if present
 */
function validateCardDetails(cardDetails: any, errors: ValidationError[]): void {
  // Optional fields - just validate format if present
  if (cardDetails.expiry_date && !isValidExpiryDate(cardDetails.expiry_date)) {
    errors.push({
      field: 'resource.card_details.expiry_date',
      message: 'expiry_date must be in format MM/YY',
      value: cardDetails.expiry_date,
    });
  }

  if (
    cardDetails.card_type &&
    !['debit', 'credit', 'prepaid'].includes(cardDetails.card_type)
  ) {
    errors.push({
      field: 'resource.card_details.card_type',
      message: 'card_type must be one of: debit, credit, prepaid',
      value: cardDetails.card_type,
    });
  }
}

/**
 * Helper: Validate required string field
 */
function validateRequiredString(
  obj: any,
  field: string,
  errors: ValidationError[],
  fullPath?: string
): void {
  const path = fullPath || field;
  if (!obj[field]) {
    errors.push({
      field: path,
      message: `${path} is required`,
    });
  } else if (typeof obj[field] !== 'string') {
    errors.push({
      field: path,
      message: `${path} must be a string`,
      value: typeof obj[field],
    });
  } else if (obj[field].trim() === '') {
    errors.push({
      field: path,
      message: `${path} cannot be empty`,
    });
  }
}

/**
 * Helper: Validate required number field
 */
function validateRequiredNumber(
  obj: any,
  field: string,
  errors: ValidationError[],
  fullPath?: string
): void {
  const path = fullPath || field;
  if (obj[field] === undefined || obj[field] === null) {
    errors.push({
      field: path,
      message: `${path} is required`,
    });
  } else if (typeof obj[field] !== 'number') {
    errors.push({
      field: path,
      message: `${path} must be a number`,
      value: typeof obj[field],
    });
  }
}

/**
 * Helper: Validate required boolean field
 */
function validateRequiredBoolean(
  obj: any,
  field: string,
  errors: ValidationError[],
  fullPath?: string
): void {
  const path = fullPath || field;
  if (obj[field] === undefined || obj[field] === null) {
    errors.push({
      field: path,
      message: `${path} is required`,
    });
  } else if (typeof obj[field] !== 'boolean') {
    errors.push({
      field: path,
      message: `${path} must be a boolean`,
      value: typeof obj[field],
    });
  }
}

/**
 * Helper: Validate ISO 8601 date format
 */
function isValidISODate(dateString: string): boolean {
  try {
    const date = new Date(dateString);
    return date.toISOString() === dateString || !isNaN(date.getTime());
  } catch {
    return false;
  }
}

/**
 * Helper: Validate email format
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Helper: Validate card expiry date format (MM/YY)
 */
function isValidExpiryDate(expiry: string): boolean {
  const expiryRegex = /^(0[1-9]|1[0-2])\/\d{2}$/;
  return expiryRegex.test(expiry);
}

/**
 * Express middleware for validating webhook payload
 */
export function validateWebhookPayloadMiddleware(req: any, res: any, next: any): void {
  const result = validateWebhookPayload(req.body);

  if (!result.valid) {
    logger.warn('[WebhookValidator] Payload validation failed', {
      errors: result.errors,
      body: req.body,
    });

    return res.status(400).json({
      error: 'Invalid webhook payload',
      details: result.errors,
    });
  }

  logger.info('[WebhookValidator] Payload validation passed', {
    webhook_message_id: req.body.webhook_message_id,
    event_type: req.body.event_type,
  });

  next();
}
