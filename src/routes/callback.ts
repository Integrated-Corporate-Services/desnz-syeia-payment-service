// Callback Routes
import express from 'express';
const router = express.Router();
const { handleWebhook, healthCheck } = require('../controllers/callbackController');
const { validateWebhookSignatureMiddleware } = require('../middlewares/validateWebhookSignature');
const {
  validateWebhookPayloadMiddleware,
} = require('../validators/webhookPayloadValidator');

// Health check endpoint
router.get('/health', healthCheck);

// Payment webhook endpoint for GOV.UK Pay notifications
// Middleware chain:
// 1. Signature verification (Pay-Signature header)
// 2. Payload structure validation
// 3. Webhook processing
router.post(
  '/payment',
  validateWebhookSignatureMiddleware,
  validateWebhookPayloadMiddleware,
  handleWebhook
);

export default router;
