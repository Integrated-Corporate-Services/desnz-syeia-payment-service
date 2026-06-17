// BACS Webhook Routes (Bank Transfer Payments via UKSBS)
import express from 'express';
import { handleBACSWebhook, BACSHealthCheck } from '../controllers/bacsWebhookController';
import { validateBACSWebhookPayloadMiddleware } from '../validators/bacsWebhookPayloadValidator';
import { validateBACSWebhookSignatureMiddleware } from '../middlewares/validateBACSWebhookSignature';

const router = express.Router();

// Health check endpoint for BACS webhook service
router.get('/health', BACSHealthCheck);

// BACS Payment webhook endpoint for bank transfer notifications
// Middleware chain:
// 1. Signature verification (X-Webhook-Signature)
// 2. Payload structure validation (BACS format)
// 3. Webhook processing
// Note: Rate limiting is handled globally in middlewareSetup.ts
router.post(
  '/payments',
  validateBACSWebhookSignatureMiddleware,
  validateBACSWebhookPayloadMiddleware,
  handleBACSWebhook
);

export default router;
