import crypto from 'crypto';
import { CRYPTO_CONFIG } from '../constants/config.constants';
import { ERROR_CATEGORIES } from '../constants/error.constants';
import getLogger from '../utils/loggerHelper';

const logger = getLogger(module);

export function constantTimeSignatureCompare(
  expected: string,
  received: string,
  encoding: BufferEncoding = 'utf8'
): boolean {
  try {
    const expectedBuf = Buffer.from(expected, encoding);
    const receivedBuf = Buffer.from(received, encoding);
    
    if (expectedBuf.length !== receivedBuf.length) {
      const maxLength = Math.max(expectedBuf.length, receivedBuf.length);
      const paddedExpected = Buffer.alloc(maxLength);
      const paddedReceived = Buffer.alloc(maxLength);
      expectedBuf.copy(paddedExpected);
      receivedBuf.copy(paddedReceived);
      crypto.timingSafeEqual(paddedExpected, paddedReceived);
      return false;
    }
    
    return crypto.timingSafeEqual(expectedBuf, receivedBuf);
  } catch (error) {
    logger.error('[Webhook] Signature comparison failed', {
      error: error instanceof Error ? error.message : String(error),
      error_category: ERROR_CATEGORIES.CRYPTOGRAPHY,
    });
    return false;
  }
}

export function computeHmacSignature(
  message: string,
  signingKey: string,
  outputFormat: 'hex' | 'base64' = 'hex'
): string {
  return crypto
    .createHmac(CRYPTO_CONFIG.HMAC_ALGORITHM, signingKey)
    .update(message, 'utf-8')
    .digest(outputFormat);
}

export function isValidHexSignature(signature: string, expectedLength: number = CRYPTO_CONFIG.SHA256_HEX_LENGTH): boolean {
  if (!signature || typeof signature !== 'string') {
    return false;
  }
  
  if (signature.length !== expectedLength) {
    return false;
  }
  
  const hexPattern = /^[0-9a-fA-F]+$/;
  return hexPattern.test(signature);
}

export function verifyHmacSignature(
  receivedSignature: string,
  message: string,
  signingKey: string
): boolean {
  if (!isValidHexSignature(receivedSignature)) {
    logger.warn('[Webhook] Invalid signature format', {
      signatureLength: receivedSignature?.length || 0,
      expectedLength: CRYPTO_CONFIG.SHA256_HEX_LENGTH,
      error_category: ERROR_CATEGORIES.CRYPTOGRAPHY,
    });
    return false;
  }
  
  const expectedSignature = computeHmacSignature(message, signingKey, 'hex');
  return constantTimeSignatureCompare(expectedSignature, receivedSignature, 'hex');
}
