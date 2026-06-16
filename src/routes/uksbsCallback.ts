// UKSBS Callback Routes
import express from 'express';
import rateLimit from 'express-rate-limit';
import { handleUKSBSWebhook, uksbsHealthCheck } from '../controllers/uksbsCallbackController';
import { validateUKSBSWebhookPayloadMiddleware } from '../validators/uksbsWebhookPayloadValidator';
import { validateUKSBSWebhookSignatureMiddleware } from '../middlewares/validateUKSBSWebhookSignature';

const router = express.Router();

// Rate limiter for UKSBS webhook endpoint
const uksbsWebhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per 15 minutes
  message: 'Too many webhook requests from this IP, please try again later',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Health check endpoint for UKSBS webhook service
router.get('/health', uksbsHealthCheck);

// UKSBS Payment webhook endpoint for UKSBS payment notifications
// Middleware chain:
// 1. Rate limiting (prevent abuse)
// 2. Pay-Signature verification (HMAC-SHA256)
// 3. Payload structure validation (UKSBS format)
// 4. Webhook processing
router.post(
  '/payment',
  uksbsWebhookLimiter,
  validateUKSBSWebhookSignatureMiddleware,
  validateUKSBSWebhookPayloadMiddleware,
  handleUKSBSWebhook
);

export default router;
