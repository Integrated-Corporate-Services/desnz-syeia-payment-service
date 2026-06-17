/**
 * BACS Webhook Constants
 * Centralized configuration for BACS payment webhook processing
 */

// Signature validation
export const BACS_SIGNATURE_VERSION = 'v1';
export const TIMESTAMP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes in milliseconds
export const ISO_8601_UTC_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
export const ISO_8601_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
export const VALID_HEX_REGEX = /^[0-9a-f]+$/;
export const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const EVENT_VERSION_REGEX = /^\d+\.\d+$/;

// Headers
export const HEADER_WEBHOOK_SIGNATURE = 'x-webhook-signature';
export const HEADER_SIGNATURE_VERSION = 'x-webhook-signature-version';
export const HEADER_REQUEST_TIMESTAMP = 'x-request-timestamp';
export const HEADER_CORRELATION_ID = 'x-correlation-id';

// Webhook processing
export const WEBHOOK_CREATOR = 'BACS-webhook-receiver';
export const WEBHOOK_STATUS_PENDING = 'pending';

// Event types
export const EVENT_TYPE_PAYMENT_STATUS_UPDATE = 'PAYMENT_STATUS_UPDATE';

// Payment statuses
export const PAYMENT_STATUS_PAID = 'PAID';
export const PAYMENT_STATUS_FAILED = 'FAILED';

// Signature validation error messages
export const ERROR_EMPTY_BODY = 'Empty body';
export const ERROR_MISSING_SIGNATURE = 'Missing X-Webhook-Signature header';
export const ERROR_INVALID_SIGNATURE_FORMAT = 'Invalid signature format';
export const ERROR_MISSING_TIMESTAMP = 'Missing X-Request-Timestamp header';
export const ERROR_UNSUPPORTED_VERSION = 'Unsupported X-Webhook-Signature-Version';
export const ERROR_INVALID_SIGNATURE = 'Invalid signature';
export const ERROR_INVALID_TIMESTAMP_FORMAT = 'X-Request-Timestamp must be a valid ISO 8601 datetime';
export const ERROR_TIMESTAMP_EXPIRED = 'Request timestamp expired or too far in future';
export const ERROR_INTERNAL = 'Internal error — please retry';

// Payload validation error messages
export const ERROR_PAYLOAD_REQUIRED = 'Payload is required and must be an object';
export const ERROR_PAYLOAD_STRUCTURE = 'Payload structure does not match BACS webhook format';
export const ERROR_SCHEMA_VALIDATION_FAILED = 'Schema validation failed';

// Event section validation errors
export const ERROR_EVENT_REQUIRED = 'event section is required and must be an object';
export const ERROR_EVENT_ID_REQUIRED = 'event.eventId is required';
export const ERROR_EVENT_ID_INVALID_UUID = 'eventId must be a valid UUID';
export const ERROR_EVENT_TYPE_REQUIRED = 'event.eventType is required';
export const ERROR_EVENT_TYPE_INVALID = 'Invalid eventType. Must be one of: PAYMENT_STATUS_UPDATE';
export const ERROR_EVENT_VERSION_REQUIRED = 'event.eventVersion is required';
export const ERROR_EVENT_VERSION_FORMAT = 'eventVersion must be in format "X.Y" (e.g., "1.0")';
export const ERROR_EVENT_VERSION_UNSUPPORTED = 'Only eventVersion "1.0" is supported';
export const ERROR_OCCURRED_AT_REQUIRED = 'event.occurredAt is required';
export const ERROR_OCCURRED_AT_INVALID = 'occurredAt must be a valid ISO 8601 date string';
export const ERROR_SOURCE_REQUIRED = 'event.source is required';

// Callback section validation errors
export const ERROR_CALLBACK_INVALID = 'callback must be an object if present';
export const ERROR_DELIVERY_ID_INVALID = 'deliveryId must be a non-empty string if present';
export const ERROR_DELIVERY_ID_UUID = 'deliveryId must be a valid UUID if present';
export const ERROR_ATTEMPT_NUMBER_INVALID = 'attemptNumber must be a number if present';
export const ERROR_ATTEMPT_NUMBER_POSITIVE = 'attemptNumber must be a positive integer >= 1 if present';

// Payment section validation errors
export const ERROR_PAYMENT_REQUIRED = 'payment section is required and must be an object';
export const ERROR_PAYMENT_REFERENCE_REQUIRED = 'payment.paymentReference is required';
export const ERROR_PAYMENT_REFERENCE_LENGTH = 'paymentReference must be between 1 and 100 characters';

// Detail section validation errors
export const ERROR_DETAIL_REQUIRED = 'detail section is required and must be an object';
export const ERROR_STATUS_REQUIRED = 'detail.status is required';
export const ERROR_STATUS_INVALID = 'Invalid status. Must be one of: PAID, FAILED, PENDING';
export const ERROR_AMOUNT_REQUIRED = 'detail.amount is required';
export const ERROR_AMOUNT_POSITIVE = 'amount must be a positive number (in pence)';
export const ERROR_AMOUNT_INTEGER = 'amount must be an integer (pence)';
export const ERROR_CURRENCY_REQUIRED = 'detail.currency is required';
export const ERROR_CURRENCY_INVALID = 'Invalid currency. Must be one of: GBP';
export const ERROR_PAYMENT_DATE_REQUIRED = 'detail.paymentDate is required';
export const ERROR_PAYMENT_DATE_FORMAT = 'paymentDate must be in format YYYY-MM-DD';
export const ERROR_TRANSFER_REFERENCE_INVALID = 'transferReference must be a non-empty string if present';

// Field validation helper messages
export const ERROR_FIELD_MUST_BE_STRING = 'must be a string';
export const ERROR_FIELD_CANNOT_BE_EMPTY = 'cannot be empty';
export const ERROR_FIELD_MUST_BE_NUMBER = 'must be a number';

// Default values
export const DEFAULT_CORRELATION_ID = 'unknown';
export const SUPPORTED_EVENT_VERSION = '1.0';

// Request Outcome Categories for CloudWatch Analytics
export const OUTCOME_SUCCESS = 'success';
export const OUTCOME_DUPLICATE = 'duplicate';
export const OUTCOME_ERROR_VALIDATION = 'error_validation';
export const OUTCOME_ERROR_AUTHENTICATION = 'error_authentication';
export const OUTCOME_ERROR_DATABASE = 'error_database';
export const OUTCOME_ERROR_INTERNAL = 'error_internal';

// Error Categories for Structured Logging
export const ERROR_CATEGORY_VALIDATION = 'validation';
export const ERROR_CATEGORY_AUTHENTICATION = 'authentication';
export const ERROR_CATEGORY_DATABASE = 'database';
export const ERROR_CATEGORY_INTERNAL = 'internal';
export const ERROR_CATEGORY_CONFIGURATION = 'configuration';
