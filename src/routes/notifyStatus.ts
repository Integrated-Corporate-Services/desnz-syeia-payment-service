/**
 * GOV.UK Notify Callback Routes (Integration Service)
 * 
 * Callback endpoints for Lambda processor notifications
 * Mount at: /notify/callback
 */

import { Router } from 'express';
import { handleEmailSent, handleEmailFailed, healthCheck } from '../controllers/notifyCallbackController';

const router = Router();

/**
 * POST /notify/callback/email-sent
 * Callback when Lambda successfully sends an email via Notify
 * 
 * Request body:
 * {
 *   "correlationId": "f1e2d3c4-b5a6-7890",
 *   "reference": "user-123-email-2024-04-21",
 *   "notificationId": "notify-abc-123",
 *   "templateId": "a1b2c3d4-e5f6-7890",
 *   "status": "sent",
 *   "sentAt": "2024-04-21T10:30:00.000Z"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "callbackId": "callback-123",
 *   "message": "Email sent callback processed"
 * }
 */
router.post('/email-sent', handleEmailSent);

/**
 * POST /notify/callback/email-failed
 * Callback when Lambda fails to send an email
 * 
 * Request body:
 * {
 *   "correlationId": "f1e2d3c4-b5a6-7890",
 *   "reference": "user-123-email-2024-04-21",
 *   "error": "Template not found",
 *   "errorCode": "404",
 *   "failedAt": "2024-04-21T10:30:00.000Z",
 *   "attempts": 3
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "callbackId": "callback-456",
 *   "message": "Email failure callback processed"
 * }
 */
router.post('/email-failed', handleEmailFailed);

/**
 * GET /notify/callback/health
 * Health check endpoint for Lambda to verify service availability
 * 
 * Response:
 * {
 *   "status": "healthy",
 *   "service": "notify-callback",
 *   "timestamp": "2024-04-21T10:30:00.000Z"
 * }
 */
router.get('/health', healthCheck);

export default router;
