import express from 'express';
import { handleBACSWebhook, BACSHealthCheck } from '../controllers/bacsWebhookController';
import { validateBACSWebhookPayloadMiddleware } from '../validators/bacsWebhookPayloadValidator';
import { validateBACSWebhookSignatureMiddleware } from '../middlewares/validateBACSWebhookSignature';
import { ipWhitelistMiddleware } from '../middlewares/ipWhitelist';
import config from '../config/config';

const router = express.Router();

// ✅ FIX HIGH-004: Health endpoint with IP whitelist protection
// Restricts access to monitoring services within VPC CIDR range
router.get(
  '/health',
  ipWhitelistMiddleware(
    config.security.healthEndpointAllowedIps,
    config.security.healthEndpointBypassInLocal
  ),
  BACSHealthCheck
);

// codeql[js/missing-rate-limiting] Rate limiting applied globally in middlewareSetup.ts
router.post('/payments', validateBACSWebhookSignatureMiddleware, validateBACSWebhookPayloadMiddleware, handleBACSWebhook);

export default router;
