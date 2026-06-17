/**
 * Webhook Utility Functions
 * Provides reusable utilities for webhook processing across different webhook types
 */

import { v4 as uuidv4, validate as uuidValidate } from 'uuid';
import getLogger from './loggerHelper';

const logger = getLogger(module);

/**
 * Validates and sanitizes webhook signature header for correlation tracking
 * Accepts HMAC-SHA256 hex (64 chars) or UUID format
 * Falls back to generating a new UUID if invalid
 * 
 * @param headerValue - The signature header value (typically Pay-Signature)
 * @returns Sanitized correlation ID
 */
export function getValidSignatureOrGenerateId(headerValue: unknown): string {
  if (typeof headerValue === 'string' && headerValue.length > 0 && headerValue.length <= 128) {
    const sanitized = headerValue.trim();
    
    // Accept HMAC-SHA256 hex (64 characters) or UUID format
    if (sanitized.length === 64 && /^[0-9a-f]{64}$/i.test(sanitized)) {
      return sanitized;
    }
    
    if (uuidValidate(sanitized)) {
      return sanitized;
    }
  }
  
  return uuidv4();
}

/**
 * Safely serializes request body to JSON string
 * Used for storing raw webhook payloads for audit trail
 * 
 * @param body - Request body (object or string)
 * @returns JSON string representation
 */
export function serializeWebhookPayload(body: unknown): string {
  try {
    if (typeof body === 'string') {
      return body;
    }
    return JSON.stringify(body);
  } catch (error) {
    logger.warn('[WebhookUtils] Failed to serialize webhook payload', {
      error: error instanceof Error ? error.message : String(error),
    });
    return '{}';
  }
}

/**
 * Extracts correlation ID from request headers
 * Checks multiple common header names in priority order
 * 
 * @param headers - Express request headers
 * @returns Correlation ID or 'unknown'
 */
export function extractCorrelationId(headers: Record<string, string | string[] | undefined>): string {
  const correlationId = 
    headers['x-correlation-id'] || 
    headers['x-request-id'] || 
    headers['pay-signature'] ||
    'unknown';
    
  return Array.isArray(correlationId) ? correlationId[0] : String(correlationId);
}
