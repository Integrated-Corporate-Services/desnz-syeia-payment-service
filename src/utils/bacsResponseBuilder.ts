export interface BACSWebhookResponse {
  received?: boolean;
  duplicate?: boolean;
  correlationId?: string;
  error?: string;
}

export function buildSuccessResponse(correlationId: string): BACSWebhookResponse {
  return { received: true, correlationId };
}

export function buildDuplicateResponse(correlationId: string): BACSWebhookResponse {
  return { received: true, duplicate: true, correlationId };
}

export function buildValidationErrorResponse(error: string): BACSWebhookResponse {
  return { error };
}

export function buildRetryableErrorResponse(error: string): BACSWebhookResponse {
  return { error };
}

export function buildPermanentErrorResponse(error: string): BACSWebhookResponse {
  return { error };
}

export function buildUnexpectedErrorResponse(): BACSWebhookResponse {
  return { error: 'Unexpected error processing webhook' };
}
