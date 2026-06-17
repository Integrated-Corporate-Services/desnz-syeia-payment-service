/**
 * BACS Webhook Response Builders
 * Minimal responses per Partner specification (api-spec.md)
 * 
 * Follows industry standard: Stripe, PayPal, GOV.UK Pay use minimal acknowledgments
 * - Security: Don't expose internal processing details
 * - Simplicity: Partner only needs to know if webhook was received
 * - Detailed info is logged server-side for debugging
 */

/**
 * Minimal response interface per Partner spec
 * Success/duplicate responses contain only essential fields
 * Error responses contain only error message
 */
export interface BACSWebhookResponse {
  received?: boolean;
  duplicate?: boolean;
  correlationId?: string;
  error?: string;
}

/**
 * Build success response for newly processed webhook
 * Returns 202 Accepted to signal async processing
 * 
 * Per spec: { "received": true, "correlationId": "..." }
 */
export function buildSuccessResponse(
  eventId: string,
  deliveryId: string,
  paymentReference: string,
  eventType: string,
  paymentStatus: string,
  correlationId: string
): BACSWebhookResponse {
  // eventId, deliveryId, paymentReference, eventType, paymentStatus are logged but not returned
  // Partner doesn't need to see details they already sent
  return {
    received: true,
    correlationId,
  };
}

/**
 * Build duplicate response for already-processed webhook
 * Returns 200 OK to signal partner to stop retrying
 * 
 * Per spec: { "received": true, "duplicate": true, "correlationId": "..." }
 */
export function buildDuplicateResponse(
  eventId: string,
  deliveryId: string,
  paymentReference: string,
  correlationId: string
): BACSWebhookResponse {
  // eventId, deliveryId, paymentReference are logged but not returned
  return {
    received: true,
    duplicate: true,
    correlationId,
  };
}

/**
 * Build error response for validation failures
 * Returns 202 Accepted for retryable errors (partner will retry)
 * 
 * Per spec: { "error": "message" }
 */
export function buildValidationErrorResponse(
  eventId: string,
  deliveryId: string,
  error: string
): BACSWebhookResponse {
  // eventId, deliveryId are logged but not returned
  return {
    error,
  };
}

/**
 * Build error response for retryable processing failures
 * Returns 202 Accepted to allow partner retry
 * 
 * Per spec: { "error": "message" }
 */
export function buildRetryableErrorResponse(
  eventId: string,
  deliveryId: string,
  paymentReference: string,
  error: string
): BACSWebhookResponse {
  // eventId, deliveryId, paymentReference are logged but not returned
  return {
    error,
  };
}

/**
 * Build error response for permanent failures
 * Returns 202 Accepted but moves to dead-letter queue
 * 
 * Per spec: { "error": "message" }
 */
export function buildPermanentErrorResponse(
  eventId: string,
  deliveryId: string,
  paymentReference: string,
  error: string
): BACSWebhookResponse {
  // eventId, deliveryId, paymentReference are logged but not returned
  return {
    error,
  };
}

/**
 * Build error response for unexpected exceptions
 * Returns 202 Accepted to allow partner retry
 * 
 * Per spec: { "error": "message" }
 */
export function buildUnexpectedErrorResponse(
  eventId: string,
  deliveryId: string,
  paymentReference: string
): BACSWebhookResponse {
  // eventId, deliveryId, paymentReference are logged but not returned
  return {
    error: 'Unexpected error processing webhook',
  };
}
