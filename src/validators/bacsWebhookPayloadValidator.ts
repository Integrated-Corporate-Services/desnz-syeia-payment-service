import { Request, Response, NextFunction } from 'express';
import { HTTP_STATUS, ERROR_CODES, ERROR_CATEGORIES } from '../constants/error.constants';
import { ERROR_SCHEMA_VALIDATION_FAILED } from '../constants/bacs.constants';
import getLogger from '../utils/loggerHelper';
import { getRequestContext } from '../middlewares/requestContext';
import { bacsWebhookSchema } from './bacsWebhookSchema';

const logger = getLogger(module);

export function validateBACSWebhookPayloadMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Response | void {
  const correlationId = getRequestContext()?.correlation_id;

  logger.start('BACSWebhook', 'validateBACSWebhookPayloadMiddleware', { correlationId });
  try {
    const { error } = bacsWebhookSchema.validate(req.body);

    if (error) {
      const validationErrors = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value,
      }));

      logger.warn('[BACSWebhook] Payload validation failed', {
        correlationId,
        errors: validationErrors,
        error_category: ERROR_CATEGORIES.VALIDATION,
        error_code: ERROR_CODES.VALIDATION_ERROR,
      });

      return res.status(HTTP_STATUS.UNPROCESSABLE_ENTITY).json({
        error: ERROR_SCHEMA_VALIDATION_FAILED,
        errorCode: ERROR_CODES.VALIDATION_ERROR,
      });
    }

    // Use original req.body after validation passes (Joi's value may have unexpected behavior)
    (req as any).BACSWebhookEvent = req.body;
    (req as any).paymentId = req.body.payment.paymentReference;

    logger.info('[BACSWebhook] Payload validation successful', {
      correlationId,
      eventId: req.body.event.eventId,
      eventType: req.body.event.eventType,
      paymentReference: req.body.payment.paymentReference,
    });

    next();
  } finally {
    logger.end('BACSWebhook', 'validateBACSWebhookPayloadMiddleware', { correlationId });
  }
}
