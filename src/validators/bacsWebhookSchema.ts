import Joi from 'joi';
import { BACS_EVENT_TYPES, BACS_PAYMENT_STATUSES, BACS_CURRENCY_CODES } from '../types/bacsWebhook.types';
import { 
  SUPPORTED_EVENT_VERSION, 
  UUID_V4_REGEX, 
  ISO_8601_UTC_REGEX, 
  DATE_REGEX,
  ERROR_EVENT_ID_REQUIRED,
  ERROR_EVENT_ID_INVALID_UUID,
  ERROR_EVENT_TYPE_REQUIRED,
  ERROR_EVENT_TYPE_INVALID,
  ERROR_EVENT_VERSION_REQUIRED,
  ERROR_EVENT_VERSION_UNSUPPORTED,
  ERROR_OCCURRED_AT_REQUIRED,
  ERROR_OCCURRED_AT_INVALID,
  ERROR_SOURCE_REQUIRED,
  ERROR_DELIVERY_ID_UUID,
  ERROR_ATTEMPT_NUMBER_INVALID,
  ERROR_ATTEMPT_NUMBER_POSITIVE,
  ERROR_PAYMENT_REFERENCE_REQUIRED,
  ERROR_PAYMENT_REFERENCE_LENGTH,
  ERROR_STATUS_REQUIRED,
  ERROR_STATUS_INVALID,
  ERROR_AMOUNT_REQUIRED,
  ERROR_AMOUNT_INTEGER,
  ERROR_AMOUNT_POSITIVE,
  ERROR_CURRENCY_REQUIRED,
  ERROR_CURRENCY_INVALID,
  ERROR_PAYMENT_DATE_REQUIRED,
  ERROR_PAYMENT_DATE_FORMAT,
  ERROR_BACS_REFERENCE_INVALID,
} from '../constants/bacs.constants';

export const bacsWebhookSchema = Joi.object({
  event: Joi.object({
    eventId: Joi.string()
      .required()
      .regex(UUID_V4_REGEX)
      .messages({
        'string.empty': ERROR_EVENT_ID_REQUIRED,
        'any.required': ERROR_EVENT_ID_REQUIRED,
        'string.pattern.base': ERROR_EVENT_ID_INVALID_UUID,
      }),

    eventType: Joi.string()
      .valid(...Object.values(BACS_EVENT_TYPES))
      .required()
      .messages({
        'string.empty': ERROR_EVENT_TYPE_REQUIRED,
        'any.required': ERROR_EVENT_TYPE_REQUIRED,
        'any.only': ERROR_EVENT_TYPE_INVALID,
      }),

    eventVersion: Joi.string()
      .valid(SUPPORTED_EVENT_VERSION)
      .required()
      .messages({
        'string.empty': ERROR_EVENT_VERSION_REQUIRED,
        'any.required': ERROR_EVENT_VERSION_REQUIRED,
        'any.only': ERROR_EVENT_VERSION_UNSUPPORTED,
      }),

    occurredAt: Joi.string()
      .required()
      .regex(ISO_8601_UTC_REGEX)
      .messages({
        'string.empty': ERROR_OCCURRED_AT_REQUIRED,
        'any.required': ERROR_OCCURRED_AT_REQUIRED,
        'string.pattern.base': ERROR_OCCURRED_AT_INVALID,
      }),

    source: Joi.string()
      .required()
      .messages({
        'string.empty': ERROR_SOURCE_REQUIRED,
        'any.required': ERROR_SOURCE_REQUIRED,
      }),
  }).required(),

  callback: Joi.object({
    deliveryId: Joi.string()
      .regex(UUID_V4_REGEX)
      .optional()
      .messages({
        'string.pattern.base': ERROR_DELIVERY_ID_UUID,
      }),

    attemptNumber: Joi.number()
      .integer()
      .min(1)
      .optional()
      .messages({
        'number.base': ERROR_ATTEMPT_NUMBER_INVALID,
        'number.integer': ERROR_ATTEMPT_NUMBER_INVALID,
        'number.min': ERROR_ATTEMPT_NUMBER_POSITIVE,
      }),
  }).optional(),

  payment: Joi.object({
    paymentReference: Joi.string()
      .required()
      .max(100)
      .messages({
        'string.empty': ERROR_PAYMENT_REFERENCE_REQUIRED,
        'any.required': ERROR_PAYMENT_REFERENCE_REQUIRED,
        'string.max': ERROR_PAYMENT_REFERENCE_LENGTH,
      }),
  }).required(),

  detail: Joi.object({
    status: Joi.string()
      .valid(...Object.values(BACS_PAYMENT_STATUSES))
      .required()
      .messages({
        'string.empty': ERROR_STATUS_REQUIRED,
        'any.required': ERROR_STATUS_REQUIRED,
        'any.only': ERROR_STATUS_INVALID,
      }),

    amount: Joi.number()
      .integer()
      .positive()
      .required()
      .messages({
        'number.base': ERROR_AMOUNT_REQUIRED,
        'number.integer': ERROR_AMOUNT_INTEGER,
        'number.positive': ERROR_AMOUNT_POSITIVE,
        'any.required': ERROR_AMOUNT_REQUIRED,
      }),

    currency: Joi.string()
      .valid(...Object.values(BACS_CURRENCY_CODES))
      .required()
      .messages({
        'string.empty': ERROR_CURRENCY_REQUIRED,
        'any.required': ERROR_CURRENCY_REQUIRED,
        'any.only': ERROR_CURRENCY_INVALID,
      }),

    paymentDate: Joi.string()
      .required()
      .regex(DATE_REGEX)
      .messages({
        'string.empty': ERROR_PAYMENT_DATE_REQUIRED,
        'any.required': ERROR_PAYMENT_DATE_REQUIRED,
        'string.pattern.base': ERROR_PAYMENT_DATE_FORMAT,
      }),

    bacsReference: Joi.string()
      .optional()
      .messages({
        'string.empty': ERROR_BACS_REFERENCE_INVALID,
      }),
  }).required(),
}).options({ 
  abortEarly: false,
  stripUnknown: false,
  allowUnknown: false,
});
