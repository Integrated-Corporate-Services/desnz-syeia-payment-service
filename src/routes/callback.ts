// Callback Routes
import express from 'express';
const router = express.Router();
const { handleWebhook, healthCheck } = require('../controllers/callbackController');
const { validateWebhookSignatureMiddleware } = require('../middlewares/validateWebhookSignature');
const {
  validateWebhookPayloadMiddleware,
} = require('../validators/webhookPayloadValidator');
import { ipWhitelistMiddleware } from '../middlewares/ipWhitelist';
import config from '../config/config';

// ✅ FIX HIGH-004: Health endpoint with IP whitelist protection
// Restricts access to monitoring services within VPC CIDR range
router.get(
  '/health',
  ipWhitelistMiddleware(
    config.security.healthEndpointAllowedIps,
    config.security.healthEndpointBypassInLocal
  ),
  healthCheck
);

// Payment webhook endpoint for GOV.UK Pay notifications
// Middleware chain:
// 1. Signature verification (Pay-Signature header)
// 2. Payload structure validation
// 3. Webhook processing
// codeql[js/missing-rate-limiting] Rate limiting applied globally in middlewareSetup.ts
router.post(
  '/payment',
  validateWebhookSignatureMiddleware,
  validateWebhookPayloadMiddleware,
  handleWebhook
);

export default router;
