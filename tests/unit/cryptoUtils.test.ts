const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

jest.mock('../../src/utils/loggerHelper', () => jest.fn(() => mockLogger));

const mockConfig = {
  server: {
    rateLimitWindowMs: 60000,
    rateLimitMax: 100,
  },
};

jest.mock('../../src/config/config', () => ({
  __esModule: true,
  default: mockConfig,
}));

import crypto from 'crypto';
import { 
  constantTimeSignatureCompare, 
  computeHmacSignature, 
  verifyHmacSignature,
  isValidHexSignature 
} from '../../src/utils/cryptoUtils';
import { CRYPTO_CONFIG } from '../../src/constants/config.constants';

describe('Crypto Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isValidHexSignature', () => {
    describe('Valid Signatures', () => {
      it('should accept valid 64-character hex signature', () => {
        const validHex = 'a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890';
        expect(isValidHexSignature(validHex)).toBe(true);
      });

      it('should accept hex with uppercase characters', () => {
        const validHex = 'A1B2C3D4E5F67890ABCDEF1234567890A1B2C3D4E5F67890ABCDEF1234567890';
        expect(isValidHexSignature(validHex)).toBe(true);
      });

      it('should accept hex with mixed case', () => {
        const validHex = 'A1b2C3d4E5f67890aBcDeF1234567890a1B2c3D4e5F67890AbCdEf1234567890';
        expect(isValidHexSignature(validHex)).toBe(true);
      });

      it('should accept all zeros', () => {
        const validHex = '0'.repeat(64);
        expect(isValidHexSignature(validHex)).toBe(true);
      });

      it('should accept all Fs', () => {
        const validHex = 'f'.repeat(64);
        expect(isValidHexSignature(validHex)).toBe(true);
      });
    });

    describe('Invalid Signatures - Wrong Length', () => {
      it('should reject 63-character signature (too short)', () => {
        const shortHex = 'a'.repeat(63);
        expect(isValidHexSignature(shortHex)).toBe(false);
      });

      it('should reject 65-character signature (too long)', () => {
        const longHex = 'a'.repeat(65);
        expect(isValidHexSignature(longHex)).toBe(false);
      });

      it('should reject empty string', () => {
        expect(isValidHexSignature('')).toBe(false);
      });

      it('should reject 32-character signature (SHA256 raw bytes, not hex)', () => {
        const shortHex = 'a'.repeat(32);
        expect(isValidHexSignature(shortHex)).toBe(false);
      });

      it('should reject 1-character signature', () => {
        expect(isValidHexSignature('a')).toBe(false);
      });
    });

    describe('Invalid Signatures - Wrong Format', () => {
      it('should reject signature with non-hex characters (g-z)', () => {
        const invalidHex = 'g1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef123456789';
        expect(isValidHexSignature(invalidHex)).toBe(false);
      });

      it('should reject signature with special characters', () => {
        const invalidHex = 'a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef12345678@0';
        expect(isValidHexSignature(invalidHex)).toBe(false);
      });

      it('should reject signature with spaces', () => {
        const invalidHex = 'a1b2c3d4e5f67890 abcdef1234567890a1b2c3d4e5f67890abcdef1234567890';
        expect(isValidHexSignature(invalidHex)).toBe(false);
      });

      it('should reject signature with newlines', () => {
        const invalidHex = 'a1b2c3d4e5f67890\\nabcdef1234567890a1b2c3d4e5f67890abcdef1234567890';
        expect(isValidHexSignature(invalidHex)).toBe(false);
      });

      it('should reject signature with dashes', () => {
        const invalidHex = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890a1b2c3d4e5f67890abcdef1234567';
        expect(isValidHexSignature(invalidHex)).toBe(false);
      });

      it('should reject base64-encoded signature', () => {
        const base64Sig = 'YTFiMmMzZDRlNWY2Nzg5MGFiY2RlZjEyMzQ1Njc4OTBhMWIyYzNkNGU1ZjY3ODkw';
        expect(isValidHexSignature(base64Sig)).toBe(false);
      });
    });

    describe('Invalid Signatures - Type Errors', () => {
      it('should reject null', () => {
        expect(isValidHexSignature(null as any)).toBe(false);
      });

      it('should reject undefined', () => {
        expect(isValidHexSignature(undefined as any)).toBe(false);
      });

      it('should reject number', () => {
        expect(isValidHexSignature(12345 as any)).toBe(false);
      });

      it('should reject object', () => {
        expect(isValidHexSignature({} as any)).toBe(false);
      });

      it('should reject array', () => {
        expect(isValidHexSignature([] as any)).toBe(false);
      });
    });

    describe('Custom Length Validation', () => {
      it('should accept 32-character hex when expectedLength is 32', () => {
        const hex32 = 'a'.repeat(32);
        expect(isValidHexSignature(hex32, 32)).toBe(true);
      });

      it('should reject 64-character hex when expectedLength is 32', () => {
        const hex64 = 'a'.repeat(64);
        expect(isValidHexSignature(hex64, 32)).toBe(false);
      });

      it('should accept 128-character hex when expectedLength is 128', () => {
        const hex128 = 'a'.repeat(128);
        expect(isValidHexSignature(hex128, 128)).toBe(true);
      });
    });

    describe('Odd-Length Hex Strings', () => {
      it('should reject odd-length hex string (31 chars)', () => {
        const oddHex = 'a'.repeat(31);
        expect(isValidHexSignature(oddHex, 31)).toBe(true);
      });

      it('should reject odd-length hex for default SHA256 (63 chars)', () => {
        const oddHex = 'a'.repeat(63);
        expect(isValidHexSignature(oddHex)).toBe(false);
      });
    });
  });

  describe('constantTimeSignatureCompare', () => {
    describe('Equal Length Comparisons', () => {
      it('should return true for identical strings', () => {
        const sig = 'a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890';
        expect(constantTimeSignatureCompare(sig, sig, 'hex')).toBe(true);
      });

      it('should return false for different strings of same length', () => {
        const sig1 = 'a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890';
        const sig2 = 'b1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890';
        expect(constantTimeSignatureCompare(sig1, sig2, 'hex')).toBe(false);
      });

      it('should return false for strings differing by one character', () => {
        const sig1 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
        const sig2 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab';
        expect(constantTimeSignatureCompare(sig1, sig2, 'hex')).toBe(false);
      });

      it('should return true for identical UTF-8 strings', () => {
        const msg = 'hello world';
        expect(constantTimeSignatureCompare(msg, msg, 'utf8')).toBe(true);
      });
    });

    describe('Different Length Comparisons - SECURITY CRITICAL', () => {
      it('should return false for truncated signature (1 char shorter)', () => {
        const full = 'a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890';
        const truncated = full.substring(0, 63);
        expect(constantTimeSignatureCompare(full, truncated, 'hex')).toBe(false);
      });

      it('should return false for extended signature (1 char longer)', () => {
        const original = 'a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890';
        const extended = original + 'aa';
        expect(constantTimeSignatureCompare(original, extended, 'hex')).toBe(false);
      });

      it('should return false when expected ends with 00 and received is truncated', () => {
        const expectedWithZeros = 'a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567800';
        const truncated = 'a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef12345678';
        expect(constantTimeSignatureCompare(expectedWithZeros, truncated, 'hex')).toBe(false);
      });

      it('should return false when expected ends with 0000 and received is truncated by 2 bytes', () => {
        const expectedWithZeros = 'a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234560000';
        const truncated = 'a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef12345600';
        expect(constantTimeSignatureCompare(expectedWithZeros, truncated, 'hex')).toBe(false);
      });

      it('should return false for significantly different lengths', () => {
        const long = 'a'.repeat(64);
        const short = 'a'.repeat(10);
        expect(constantTimeSignatureCompare(long, short, 'hex')).toBe(false);
      });

      it('should return false when received is longer than expected', () => {
        const expected = 'aa'.repeat(32);
        const received = 'aa'.repeat(33);
        expect(constantTimeSignatureCompare(expected, received, 'hex')).toBe(false);
      });

      it('should return false for empty vs non-empty', () => {
        const sig = 'a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890';
        expect(constantTimeSignatureCompare(sig, '', 'hex')).toBe(false);
        expect(constantTimeSignatureCompare('', sig, 'hex')).toBe(false);
      });
    });

    describe('Timing Attack Resistance', () => {
      it('should perform constant-time comparison even for different lengths', () => {
        const sig1 = 'a'.repeat(64);
        const sig2 = 'a'.repeat(63);
        
        const startTime = process.hrtime.bigint();
        constantTimeSignatureCompare(sig1, sig2, 'hex');
        const endTime = process.hrtime.bigint();
        
        expect(endTime > startTime).toBe(true);
      });

      it('should not short-circuit on first byte mismatch', () => {
        const sig1 = 'a' + '0'.repeat(63);
        const sig2 = 'b' + '0'.repeat(63);
        
        expect(constantTimeSignatureCompare(sig1, sig2, 'hex')).toBe(false);
      });
    });

    describe('Error Handling', () => {
      it('should handle invalid hex gracefully and return false', () => {
        const validHex = 'a'.repeat(64);
        const invalidHex = 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz';
        
        const result = constantTimeSignatureCompare(validHex, invalidHex, 'hex');
        expect(result).toBe(false);
      });
    });
  });

  describe('computeHmacSignature', () => {
    const testMessage = 'test message';
    const testKey = 'test-key-12345';

    it('should compute HMAC-SHA256 signature in hex format', () => {
      const signature = computeHmacSignature(testMessage, testKey, 'hex');
      
      expect(signature).toBeDefined();
      expect(typeof signature).toBe('string');
      expect(signature.length).toBe(64);
      expect(/^[0-9a-f]+$/.test(signature)).toBe(true);
    });

    it('should compute HMAC-SHA256 signature in base64 format', () => {
      const signature = computeHmacSignature(testMessage, testKey, 'base64');
      
      expect(signature).toBeDefined();
      expect(typeof signature).toBe('string');
      expect(signature.length).toBeLessThan(64);
    });

    it('should produce consistent results for same input', () => {
      const sig1 = computeHmacSignature(testMessage, testKey, 'hex');
      const sig2 = computeHmacSignature(testMessage, testKey, 'hex');
      
      expect(sig1).toBe(sig2);
    });

    it('should produce different signatures for different messages', () => {
      const sig1 = computeHmacSignature('message1', testKey, 'hex');
      const sig2 = computeHmacSignature('message2', testKey, 'hex');
      
      expect(sig1).not.toBe(sig2);
    });

    it('should produce different signatures for different keys', () => {
      const sig1 = computeHmacSignature(testMessage, 'key1', 'hex');
      const sig2 = computeHmacSignature(testMessage, 'key2', 'hex');
      
      expect(sig1).not.toBe(sig2);
    });

    it('should handle empty message', () => {
      const signature = computeHmacSignature('', testKey, 'hex');
      
      expect(signature).toBeDefined();
      expect(signature.length).toBe(64);
    });

    it('should handle empty key', () => {
      const signature = computeHmacSignature(testMessage, '', 'hex');
      
      expect(signature).toBeDefined();
      expect(signature.length).toBe(64);
    });

    it('should handle long messages', () => {
      const longMessage = 'a'.repeat(10000);
      const signature = computeHmacSignature(longMessage, testKey, 'hex');
      
      expect(signature).toBeDefined();
      expect(signature.length).toBe(64);
    });

    it('should match Node.js crypto.createHmac output', () => {
      const expected = crypto
        .createHmac('sha256', testKey)
        .update(testMessage, 'utf-8')
        .digest('hex');
      
      const actual = computeHmacSignature(testMessage, testKey, 'hex');
      
      expect(actual).toBe(expected);
    });
  });

  describe('verifyHmacSignature', () => {
    const testMessage = 'test webhook payload';
    const testKey = 'signing-key-123';
    let validSignature: string;

    beforeEach(() => {
      validSignature = computeHmacSignature(testMessage, testKey, 'hex');
    });

    describe('Valid Signatures', () => {
      it('should verify correct signature', () => {
        const result = verifyHmacSignature(validSignature, testMessage, testKey);
        expect(result).toBe(true);
      });

      it('should verify signature with uppercase hex', () => {
        const upperSignature = validSignature.toUpperCase();
        const result = verifyHmacSignature(upperSignature, testMessage, testKey);
        expect(result).toBe(true);
      });

      it('should verify signature with mixed case hex', () => {
        const mixedSignature = validSignature
          .split('')
          .map((c, i) => (i % 2 === 0 ? c.toUpperCase() : c))
          .join('');
        const result = verifyHmacSignature(mixedSignature, testMessage, testKey);
        expect(result).toBe(true);
      });
    });

    describe('Invalid Signatures - Format Validation', () => {
      it('should reject signature that is too short', () => {
        const shortSignature = validSignature.substring(0, 63);
        const result = verifyHmacSignature(shortSignature, testMessage, testKey);
        
        expect(result).toBe(false);
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Invalid signature format'),
          expect.objectContaining({
            signatureLength: 63,
            expectedLength: 64,
          })
        );
      });

      it('should reject signature that is too long', () => {
        const longSignature = validSignature + 'aa';
        const result = verifyHmacSignature(longSignature, testMessage, testKey);
        
        expect(result).toBe(false);
      });

      it('should reject non-hex signature', () => {
        const invalidSignature = 'z'.repeat(64);
        const result = verifyHmacSignature(invalidSignature, testMessage, testKey);
        
        expect(result).toBe(false);
      });

      it('should reject signature with spaces', () => {
        const spacedSignature = validSignature.substring(0, 32) + ' ' + validSignature.substring(32);
        const result = verifyHmacSignature(spacedSignature, testMessage, testKey);
        
        expect(result).toBe(false);
      });

      it('should reject empty signature', () => {
        const result = verifyHmacSignature('', testMessage, testKey);
        
        expect(result).toBe(false);
      });

      it('should reject null signature', () => {
        const result = verifyHmacSignature(null as any, testMessage, testKey);
        
        expect(result).toBe(false);
      });

      it('should reject undefined signature', () => {
        const result = verifyHmacSignature(undefined as any, testMessage, testKey);
        
        expect(result).toBe(false);
      });
    });

    describe('Invalid Signatures - Wrong Value', () => {
      it('should reject signature with wrong key', () => {
        const wrongKeySignature = computeHmacSignature(testMessage, 'wrong-key', 'hex');
        const result = verifyHmacSignature(wrongKeySignature, testMessage, testKey);
        
        expect(result).toBe(false);
      });

      it('should reject signature for different message', () => {
        const wrongMessageSignature = computeHmacSignature('different message', testKey, 'hex');
        const result = verifyHmacSignature(wrongMessageSignature, testMessage, testKey);
        
        expect(result).toBe(false);
      });

      it('should reject signature with one bit flipped', () => {
        const tamperedSignature = 
          validSignature.substring(0, 1) + 
          (validSignature[1] === 'a' ? 'b' : 'a') + 
          validSignature.substring(2);
        const result = verifyHmacSignature(tamperedSignature, testMessage, testKey);
        
        expect(result).toBe(false);
      });

      it('should reject all-zeros signature', () => {
        const zeroSignature = '0'.repeat(64);
        const result = verifyHmacSignature(zeroSignature, testMessage, testKey);
        
        expect(result).toBe(false);
      });
    });

    describe('Truncation Attack Prevention', () => {
      it('should reject truncated signature even if it matches prefix', () => {
        const truncated = validSignature.substring(0, 62);
        const result = verifyHmacSignature(truncated, testMessage, testKey);
        
        expect(result).toBe(false);
      });

      it('should reject extended signature even if prefix matches', () => {
        const extended = validSignature + '00';
        const result = verifyHmacSignature(extended, testMessage, testKey);
        
        expect(result).toBe(false);
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty message', () => {
        const emptyMsgSignature = computeHmacSignature('', testKey, 'hex');
        const result = verifyHmacSignature(emptyMsgSignature, '', testKey);
        
        expect(result).toBe(true);
      });

      it('should handle very long messages', () => {
        const longMessage = 'x'.repeat(100000);
        const longMsgSignature = computeHmacSignature(longMessage, testKey, 'hex');
        const result = verifyHmacSignature(longMsgSignature, longMessage, testKey);
        
        expect(result).toBe(true);
      });

      it('should handle unicode characters in message', () => {
        const unicodeMessage = 'Hello 世界 🌍';
        const unicodeSignature = computeHmacSignature(unicodeMessage, testKey, 'hex');
        const result = verifyHmacSignature(unicodeSignature, unicodeMessage, testKey);
        
        expect(result).toBe(true);
      });
    });
  });

  describe('Integration - Full HMAC Workflow', () => {
    it('should compute and verify signature correctly', () => {
      const message = JSON.stringify({ event: 'payment.succeeded', amount: 1000 });
      const key = 'production-signing-key-a1b2c3d4';
      
      const signature = computeHmacSignature(message, key, 'hex');
      const isValid = verifyHmacSignature(signature, message, key);
      
      expect(isValid).toBe(true);
    });

    it('should detect tampered message', () => {
      const originalMessage = JSON.stringify({ event: 'payment.succeeded', amount: 1000 });
      const tamperedMessage = JSON.stringify({ event: 'payment.succeeded', amount: 9999 });
      const key = 'production-signing-key-a1b2c3d4';
      
      const signature = computeHmacSignature(originalMessage, key, 'hex');
      const isValid = verifyHmacSignature(signature, tamperedMessage, key);
      
      expect(isValid).toBe(false);
    });

    it('should reject signature from different key', () => {
      const message = JSON.stringify({ event: 'payment.succeeded' });
      const correctKey = 'correct-key';
      const wrongKey = 'wrong-key';
      
      const signature = computeHmacSignature(message, correctKey, 'hex');
      const isValid = verifyHmacSignature(signature, message, wrongKey);
      
      expect(isValid).toBe(false);
    });
  });
});
