// Callback Routes
import express from 'express';
const router = express.Router();
const { handleWebhook, healthCheck } = require('../controllers/callbackController');
const { validateWebhookSignatureMiddleware } = require('../middlewares/validateWebhookSignature');

// Health check endpoint
router.get('/health', healthCheck);

// Webhook endpoint for GOV.UK Pay notifications
// Requires signature verification via X-Webhook-Signature header
// Signature is HMAC-SHA256 of request body using GOVPAY_WEBHOOK_SIGNING_KEY
router.post('/webhook', validateWebhookSignatureMiddleware, handleWebhook);

export default router;
