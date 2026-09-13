import { Request, Response, NextFunction } from 'express';
import { HTTP_STATUS, ERROR_CODES, ERROR_CATEGORIES } from '../constants/error.constants';
import { ERROR_SCHEMA_VALIDATION_FAILED } from '../constants/bacs.constants';
import getLogger from '../utils/loggerHelper';
import { getRequestContext } from '../middlewares/requestContext';
import { bacsWebhookSchema } from './bacsWebhookSchema';

const logger = getLogger(module);

const FILE = 'bacsWebhookPayloadValidator.ts';

export function validateBACSWebhookPayloadMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Response | void {
  const start = Date.now();
  const correlationId = getRequestContext()?.correlation_id;

  logger.info(`[BACS][PAYLOAD_VALIDATION][STARTED][${FILE}][validateBACSWebhookPayloadMiddleware] correlationId=${correlationId}`);
  try {
    const { error } = bacsWebhookSchema.validate(req.body);

    if (error) {
      const validationErrors = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value,
      }));

      logger.error(`[BACS][PAYLOAD_VALIDATION][FAILED][${FILE}][validateBACSWebhookPayloadMiddleware] error=payload_validation_failed errors=${JSON.stringify(validationErrors)} category=${ERROR_CATEGORIES.VALIDATION} code=${ERROR_CODES.VALIDATION_ERROR} - correlationId=${correlationId}`);

      return res.status(HTTP_STATUS.UNPROCESSABLE_ENTITY).json({
        error: ERROR_SCHEMA_VALIDATION_FAILED,
        errorCode: ERROR_CODES.VALIDATION_ERROR,
      });
    }

    // Use original req.body after validation passes (Joi's value may have unexpected behavior)
    (req as any).BACSWebhookEvent = req.body;
    (req as any).paymentId = req.body.payment.paymentReference;

    logger.info(`[BACS][PAYLOAD][PAYLOAD_VALIDATED][${FILE}][validateBACSWebhookPayloadMiddleware] payload validation successful - correlationId=${correlationId} eventId=${req.body.event.eventId} eventType=${req.body.event.eventType} paymentReference=${req.body.payment.paymentReference}`);

    next();
  } finally {
    logger.info(`[BACS][PAYLOAD][ENDED][${FILE}][validateBACSWebhookPayloadMiddleware] correlationId=${correlationId} durationMs=${Date.now() - start}`);
  }
}
