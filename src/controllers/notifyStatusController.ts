/**
 * GOV.UK Notify Callback Controller (Integration Service)
 * 
 * Handles callback notifications from Lambda processor about email send status
 * Similar pattern to payment webhook callback controller
 * 
 * Endpoints:
 * - POST /notify/callback/email-sent - Email successfully sent notification
 * - POST /notify/callback/email-failed - Email send failure notification
 */

import { Request, Response } from 'express';
import { processEmailSentCallback, processEmailFailedCallback } from '../services/notifyCallbackService';
import logger from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

/**
 * Handle email sent callback from Lambda processor
 * POST /notify/callback/email-sent
 * 
 * Request body:
 * {
 *   "correlationId": "f1e2d3c4-b5a6-7890",
 *   "reference": "user-123-email-2024-04-21",
 *   "notificationId": "notify-abc-123",
 *   "templateId": "a1b2c3d4-e5f6-7890",
 *   "emailAddress": "user@example.gov.uk",
 *   "status": "sent",
 *   "sentAt": "2024-04-21T10:30:00.000Z"
 * }
 */
export async function handleEmailSent(req: Request, res: Response) {
  const callbackId = uuidv4();
  const { correlationId, reference, notificationId } = req.body;

  logger.info('[NotifyCallbackController] Email sent callback received', {
    callbackId,
    correlationId,
    reference,
    notificationId,
    ip: req.ip,
  });

  try {
    // Validate required fields
    if (!correlationId || !notificationId) {
      logger.warn('[NotifyCallbackController] Missing required fields', {
        callbackId,
        hasCorrelationId: !!correlationId,
        hasNotificationId: !!notificationId,
      });

      return res.status(400).json({
        success: false,
        error: 'Missing required fields: correlationId, notificationId',
      });
    }

    // Process callback
    const result = await processEmailSentCallback({
      callbackId,
      correlationId,
      reference,
      notificationId,
      templateId: req.body.templateId,
      emailAddress: req.body.emailAddress,
      status: req.body.status || 'sent',
      sentAt: req.body.sentAt,
      metadata: req.body.metadata,
    });

    logger.info('[NotifyCallbackController] Callback processed successfully', {
      callbackId,
      correlationId,
      notificationId,
    });

    // Return 200 OK to Lambda
    res.json({
      success: true,
      callbackId,
      message: 'Email sent callback processed',
    });

  } catch (error: any) {
    logger.error('[NotifyCallbackController] Error processing callback', {
      callbackId,
      correlationId,
      error: error.message,
      stack: error.stack,
    });

    // Return 500 to trigger Lambda retry
    res.status(500).json({
      success: false,
      error: 'Failed to process callback',
      callbackId,
    });
  }
}

/**
 * Handle email send failure callback from Lambda processor
 * POST /notify/callback/email-failed
 * 
 * Request body:
 * {
 *   "correlationId": "f1e2d3c4-b5a6-7890",
 *   "reference": "user-123-email-2024-04-21",
 *   "templateId": "a1b2c3d4-e5f6-7890",
 *   "error": "Template not found",
 *   "errorCode": "404",
 *   "failedAt": "2024-04-21T10:30:00.000Z",
 *   "attempts": 3
 * }
 */
export async function handleEmailFailed(req: Request, res: Response) {
  const callbackId = uuidv4();
  const { correlationId, reference, error } = req.body;

  logger.error('[NotifyCallbackController] Email failed callback received', {
    callbackId,
    correlationId,
    reference,
    error,
    ip: req.ip,
  });

  try {
    // Validate required fields
    if (!correlationId) {
      logger.warn('[NotifyCallbackController] Missing correlationId', {
        callbackId,
      });

      return res.status(400).json({
        success: false,
        error: 'Missing required field: correlationId',
      });
    }

    // Process failure callback
    const result = await processEmailFailedCallback({
      callbackId,
      correlationId,
      reference,
      templateId: req.body.templateId,
      error: error || 'Unknown error',
      errorCode: req.body.errorCode,
      failedAt: req.body.failedAt,
      attempts: req.body.attempts,
      isRetryable: req.body.isRetryable,
      metadata: req.body.metadata,
    });

    logger.info('[NotifyCallbackController] Failure callback processed', {
      callbackId,
      correlationId,
      reference,
    });

    // Return 200 OK
    res.json({
      success: true,
      callbackId,
      message: 'Email failure callback processed',
    });

  } catch (error: any) {
    logger.error('[NotifyCallbackController] Error processing failure callback', {
      callbackId,
      correlationId,
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to process failure callback',
      callbackId,
    });
  }
}

/**
 * Health check endpoint for Lambda to verify callback service availability
 * GET /notify/callback/health
 */
export async function healthCheck(req: Request, res: Response) {
  res.json({
    status: 'healthy',
    service: 'notify-callback',
    timestamp: new Date().toISOString(),
  });
}
