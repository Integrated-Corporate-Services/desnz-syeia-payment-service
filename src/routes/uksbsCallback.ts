// UKSBS Callback Routes
import express from 'express';
import { handleUKSBSWebhook, uksbsHealthCheck } from '../controllers/uksbsCallbackController';
import { validateUKSBSWebhookPayloadMiddleware } from '../validators/uksbsWebhookPayloadValidator';
import { validateUKSBSWebhookSignatureMiddleware } from '../middlewares/validateUKSBSWebhookSignature';

const router = express.Router();

// Health check endpoint for UKSBS webhook service
router.get('/health', uksbsHealthCheck);

// UKSBS Payment webhook endpoint for UKSBS payment notifications
// Middleware chain:
// 1. Pay-Signature verification (HMAC-SHA256)
// 2. Payload structure validation (UKSBS format)
// 3. Webhook processing
router.post(
  '/payment',
  validateUKSBSWebhookSignatureMiddleware,
  validateUKSBSWebhookPayloadMiddleware,
  handleUKSBSWebhook
);

export default router;
