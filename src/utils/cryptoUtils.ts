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
    const bufferLength = encoding === 'hex' 
      ? CRYPTO_CONFIG.SHA256_BYTE_LENGTH 
      : CRYPTO_CONFIG.SHA256_HEX_LENGTH;
    
    const expectedBuf = Buffer.alloc(bufferLength);
    const receivedBuf = Buffer.alloc(bufferLength);
    
    Buffer.from(expected, encoding).copy(expectedBuf);
    Buffer.from(received, encoding).copy(receivedBuf);
    
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

export function verifyHmacSignature(
  receivedSignature: string,
  message: string,
  signingKey: string
): boolean {
  const expectedSignature = computeHmacSignature(message, signingKey, 'hex');
  return constantTimeSignatureCompare(expectedSignature, receivedSignature, 'utf8');
}
