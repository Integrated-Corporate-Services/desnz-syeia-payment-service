// UKSBS Callback Routes
import express from 'express';
const router = express.Router();
const { handleUKSBSWebhook, uksbsHealthCheck } = require('../controllers/uksbsCallbackController');
const { validateUKSBSWebhookPayloadMiddleware } = require('../validators/uksbsWebhookPayloadValidator');

// Health check endpoint for UKSBS webhook service
router.get('/health', uksbsHealthCheck);

// UKSBS Payment webhook endpoint for UKSBS payment notifications
// Middleware chain:
// 1. Payload structure validation (UKSBS format)
// 2. Webhook processing
// Note: UKSBS may use different authentication mechanism than Pay-Signature
// Add signature verification middleware here if required by UKSBS specification
router.post(
  '/payment',
  validateUKSBSWebhookPayloadMiddleware,
  handleUKSBSWebhook
);

export default router;
