// Callback Routes
import express from 'express';
import { webhookRateLimiter } from '../config/rateLimiting';
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
// 1. Rate limiting (express-rate-limit - CodeQL recognized)
// 2. Signature verification (Pay-Signature header)
// 3. Payload structure validation
// 4. Webhook processing
router.post(
  '/payment',
  webhookRateLimiter,
  validateWebhookSignatureMiddleware,
  validateWebhookPayloadMiddleware,
  handleWebhook
);

export default router;
