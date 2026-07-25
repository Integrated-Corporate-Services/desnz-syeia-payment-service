import express from 'express';
import { handleBACSWebhook, BACSHealthCheck } from '../controllers/bacsWebhookController';
import { validateBACSWebhookPayloadMiddleware } from '../validators/bacsWebhookPayloadValidator';
import { validateBACSWebhookSignatureMiddleware } from '../middlewares/validateBACSWebhookSignature';
import { rateLimitMiddleware } from '../middlewares/rateLimiter';

const router = express.Router();

router.get('/health', BACSHealthCheck);

router.post(
  '/payments',
  rateLimitMiddleware,
  validateBACSWebhookSignatureMiddleware,
  validateBACSWebhookPayloadMiddleware,
  handleBACSWebhook
);

export default router;
