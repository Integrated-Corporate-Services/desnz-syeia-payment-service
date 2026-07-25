import { validateSigningKeyConfiguration } from '../../src/validators/signingKeyValidator';

describe('Signing Key Validator', () => {
  const VALID_32_CHAR_KEY = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';
  const VALID_64_CHAR_KEY = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6A7B8C9D0E1F2G3H4';
  const VALID_STRONG_KEY = '5f7d8a9b2c4e6f1a3d5b7c9e0f2a4c6e8a0b2c4d6e8f0a2b4c6d8e0f1a3b5c7d9e';

  describe('Missing Keys', () => {
    it('should throw error when GOV.UK Pay signing key is missing', () => {
      expect(() => {
        validateSigningKeyConfiguration({
          govPaySigningKey: '',
          bacsSigningKey: VALID_STRONG_KEY,
          environment: 'production',
        });
      }).toThrow('GOVPAY_WEBHOOK_SIGNING_KEY is not configured');
    });

    it('should throw error when GOV.UK Pay signing key is undefined', () => {
      expect(() => {
        validateSigningKeyConfiguration({
          govPaySigningKey: undefined as any,
          bacsSigningKey: VALID_STRONG_KEY,
          environment: 'production',
        });
      }).toThrow('GOVPAY_WEBHOOK_SIGNING_KEY is not configured');
    });

    it('should throw error when GOV.UK Pay signing key is whitespace only', () => {
      expect(() => {
        validateSigningKeyConfiguration({
          govPaySigningKey: '   ',
          bacsSigningKey: VALID_STRONG_KEY,
          environment: 'production',
        });
      }).toThrow('GOVPAY_WEBHOOK_SIGNING_KEY is not configured');
    });

    it('should throw error when BACS signing key is missing', () => {
      expect(() => {
        validateSigningKeyConfiguration({
          govPaySigningKey: VALID_STRONG_KEY,
          bacsSigningKey: '',
          environment: 'production',
        });
      }).toThrow('UKSBS_WEBHOOK_SIGNING_KEY is not configured');
    });

    it('should throw error when BACS signing key is undefined', () => {
      expect(() => {
        validateSigningKeyConfiguration({
          govPaySigningKey: VALID_STRONG_KEY,
          bacsSigningKey: undefined as any,
          environment: 'production',
        });
      }).toThrow('UKSBS_WEBHOOK_SIGNING_KEY is not configured');
    });

    it('should throw error when both signing keys are missing', () => {
      expect(() => {
        validateSigningKeyConfiguration({
          govPaySigningKey: '',
          bacsSigningKey: '',
          environment: 'production',
        });
      }).toThrow('GOVPAY_WEBHOOK_SIGNING_KEY is not configured');
    });
  });

  describe('Minimum Length Enforcement', () => {
    describe('Production Environment', () => {
      it('should reject GOV.UK Pay key shorter than 32 characters in production', () => {
        const shortKey = 'short123';
        expect(() => {
          validateSigningKeyConfiguration({
            govPaySigningKey: shortKey,
            bacsSigningKey: VALID_STRONG_KEY,
            environment: 'production',
          });
        }).toThrow('GOVPAY_WEBHOOK_SIGNING_KEY does not meet minimum length requirements');
      });

      it('should reject BACS key shorter than 32 characters in production', () => {
        const shortKey = 'short123';
        expect(() => {
          validateSigningKeyConfiguration({
            govPaySigningKey: VALID_STRONG_KEY,
            bacsSigningKey: shortKey,
            environment: 'production',
          });
        }).toThrow('UKSBS_WEBHOOK_SIGNING_KEY does not meet minimum length requirements');
      });

      it('should accept 32 character key in production', () => {
        const result = validateSigningKeyConfiguration({
          govPaySigningKey: VALID_32_CHAR_KEY,
          bacsSigningKey: VALID_32_CHAR_KEY,
          environment: 'production',
        });
        expect(result.isValid).toBe(true);
      });

      it('should accept 64 character key in production without warnings', () => {
        const result = validateSigningKeyConfiguration({
          govPaySigningKey: VALID_64_CHAR_KEY,
          bacsSigningKey: VALID_64_CHAR_KEY,
          environment: 'production',
        });
        expect(result.isValid).toBe(true);
        expect(result.warnings).toBeUndefined();
      });

      it('should warn for 32 character key (below recommended 64)', () => {
        const result = validateSigningKeyConfiguration({
          govPaySigningKey: VALID_32_CHAR_KEY,
          bacsSigningKey: VALID_32_CHAR_KEY,
          environment: 'production',
        });
        expect(result.isValid).toBe(true);
        expect(result.warnings).toBeDefined();
        expect(result.warnings?.[0]).toContain('32 characters');
        expect(result.warnings?.[0]).toContain('recommended: 64');
      });
    });

    describe('Development Environment', () => {
      it('should reject key shorter than 32 characters in development', () => {
        const shortKey = 'short123';
        expect(() => {
          validateSigningKeyConfiguration({
            govPaySigningKey: shortKey,
            bacsSigningKey: VALID_STRONG_KEY,
            environment: 'development',
          });
        }).toThrow('GOVPAY_WEBHOOK_SIGNING_KEY does not meet minimum length requirements');
      });

      it('should accept 32 character key in development', () => {
        const result = validateSigningKeyConfiguration({
          govPaySigningKey: VALID_32_CHAR_KEY,
          bacsSigningKey: VALID_32_CHAR_KEY,
          environment: 'development',
        });
        expect(result.isValid).toBe(true);
      });
    });

    describe('Staging Environment', () => {
      it('should reject key shorter than 32 characters in staging', () => {
        const shortKey = 'short123';
        expect(() => {
          validateSigningKeyConfiguration({
            govPaySigningKey: shortKey,
            bacsSigningKey: VALID_STRONG_KEY,
            environment: 'staging',
          });
        }).toThrow('GOVPAY_WEBHOOK_SIGNING_KEY does not meet minimum length requirements');
      });

      it('should accept 32 character key in staging', () => {
        const result = validateSigningKeyConfiguration({
          govPaySigningKey: VALID_32_CHAR_KEY,
          bacsSigningKey: VALID_32_CHAR_KEY,
          environment: 'staging',
        });
        expect(result.isValid).toBe(true);
      });
    });

    describe('Local Environment', () => {
      it('should accept short keys in local environment', () => {
        const shortKey = 'a1b2c3d4e5f6g7h8';
        const result = validateSigningKeyConfiguration({
          govPaySigningKey: shortKey,
          bacsSigningKey: shortKey,
          environment: 'local',
        });
        expect(result.isValid).toBe(true);
      });
    });
  });

  describe('Forbidden Weak Values', () => {
    const forbiddenValues = [
      'secret',
      'password',
      'test',
      'key',
      'changeme',
      'admin',
      'default',
      'example',
      'demo',
      '123456',
      'pass',
      'root',
      'testkey',
      'samplekey',
      'mykey',
      'supersecret',
    ];

    forbiddenValues.forEach((weakValue) => {
      it(`should reject forbidden weak value: "${weakValue}" for GOV.UK Pay key`, () => {
        expect(() => {
          validateSigningKeyConfiguration({
            govPaySigningKey: weakValue,
            bacsSigningKey: VALID_STRONG_KEY,
            environment: 'local',
          });
        }).toThrow('GOVPAY_WEBHOOK_SIGNING_KEY is a forbidden weak value');
      });

      it(`should reject forbidden weak value: "${weakValue}" for BACS key`, () => {
        expect(() => {
          validateSigningKeyConfiguration({
            govPaySigningKey: VALID_STRONG_KEY,
            bacsSigningKey: weakValue,
            environment: 'local',
          });
        }).toThrow('UKSBS_WEBHOOK_SIGNING_KEY is a forbidden weak value');
      });

      it(`should reject forbidden weak value case-insensitive: "${weakValue.toUpperCase()}"`, () => {
        expect(() => {
          validateSigningKeyConfiguration({
            govPaySigningKey: weakValue.toUpperCase(),
            bacsSigningKey: VALID_STRONG_KEY,
            environment: 'local',
          });
        }).toThrow('GOVPAY_WEBHOOK_SIGNING_KEY is a forbidden weak value');
      });
    });

    it('should reject forbidden value even if it meets length requirements', () => {
      expect(() => {
        validateSigningKeyConfiguration({
          govPaySigningKey: 'password',
          bacsSigningKey: VALID_STRONG_KEY,
          environment: 'local',
        });
      }).toThrow('GOVPAY_WEBHOOK_SIGNING_KEY is a forbidden weak value');
    });

    it('should accept strong keys that are not in forbidden list', () => {
      const result = validateSigningKeyConfiguration({
        govPaySigningKey: VALID_STRONG_KEY,
        bacsSigningKey: VALID_STRONG_KEY,
        environment: 'production',
      });
      expect(result.isValid).toBe(true);
    });
  });

  describe('Entropy Checks', () => {
    describe('32 Character Keys', () => {
      it('should reject 32-char key with insufficient unique characters (< 8)', () => {
        const lowEntropyKey = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
        expect(() => {
          validateSigningKeyConfiguration({
            govPaySigningKey: lowEntropyKey,
            bacsSigningKey: VALID_STRONG_KEY,
            environment: 'production',
          });
        }).toThrow('GOVPAY_WEBHOOK_SIGNING_KEY has insufficient entropy');
      });

      it('should reject 32-char key with only 7 unique characters', () => {
        const lowEntropyKey = 'abcdefgabcdefgabcdefgabcdefgabcd';
        expect(() => {
          validateSigningKeyConfiguration({
            govPaySigningKey: lowEntropyKey,
            bacsSigningKey: VALID_STRONG_KEY,
            environment: 'production',
          });
        }).toThrow('has insufficient entropy');
      });

      it('should accept 32-char key with exactly 8 unique characters', () => {
        const validEntropyKey = 'abcdefghabcdefghabcdefghabcdefgh';
        const result = validateSigningKeyConfiguration({
          govPaySigningKey: validEntropyKey,
          bacsSigningKey: validEntropyKey,
          environment: 'production',
        });
        expect(result.isValid).toBe(true);
      });

      it('should accept 32-char key with high entropy', () => {
        const result = validateSigningKeyConfiguration({
          govPaySigningKey: VALID_32_CHAR_KEY,
          bacsSigningKey: VALID_32_CHAR_KEY,
          environment: 'production',
        });
        expect(result.isValid).toBe(true);
      });
    });

    describe('64 Character Keys', () => {
      it('should reject 64-char key with insufficient unique characters (< 16)', () => {
        const lowEntropyKey = 'a'.repeat(64);
        expect(() => {
          validateSigningKeyConfiguration({
            govPaySigningKey: lowEntropyKey,
            bacsSigningKey: VALID_STRONG_KEY,
            environment: 'production',
          });
        }).toThrow('GOVPAY_WEBHOOK_SIGNING_KEY has insufficient entropy');
      });

      it('should reject 64-char key with only 15 unique characters', () => {
        const lowEntropyKey = 'abcdefghijklmnoabcdefghijklmnoabcdefghijklmnoabcdefghijklmnoabcd';
        expect(lowEntropyKey.length).toBe(64);
        expect(new Set(lowEntropyKey).size).toBe(15);
        expect(() => {
          validateSigningKeyConfiguration({
            govPaySigningKey: lowEntropyKey,
            bacsSigningKey: VALID_STRONG_KEY,
            environment: 'local',
          });
        }).toThrow('has insufficient entropy');
      });

      it('should accept 64-char key with exactly 16 unique characters', () => {
        const validEntropyKey = 'abcdefghijklmnopabcdefghijklmnopabcdefghijklmnopabcdefghijklm';
        const result = validateSigningKeyConfiguration({
          govPaySigningKey: validEntropyKey,
          bacsSigningKey: validEntropyKey,
          environment: 'production',
        });
        expect(result.isValid).toBe(true);
      });

      it('should accept 64-char key with high entropy', () => {
        const result = validateSigningKeyConfiguration({
          govPaySigningKey: VALID_64_CHAR_KEY,
          bacsSigningKey: VALID_64_CHAR_KEY,
          environment: 'production',
        });
        expect(result.isValid).toBe(true);
      });
    });

    it('should provide helpful error message with entropy requirements', () => {
      const lowEntropyKey = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      expect(() => {
        validateSigningKeyConfiguration({
          govPaySigningKey: lowEntropyKey,
          bacsSigningKey: VALID_STRONG_KEY,
          environment: 'production',
        });
      }).toThrow('Found 1 unique characters, need at least 8');
    });

    it('should mention brute-force risk in entropy error message', () => {
      const lowEntropyKey = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      expect(() => {
        validateSigningKeyConfiguration({
          govPaySigningKey: lowEntropyKey,
          bacsSigningKey: VALID_STRONG_KEY,
          environment: 'production',
        });
      }).toThrow('can be brute-forced');
    });
  });

  describe('Environment Handling', () => {
    it('should handle case-insensitive environment names', () => {
      const result = validateSigningKeyConfiguration({
        govPaySigningKey: VALID_STRONG_KEY,
        bacsSigningKey: VALID_STRONG_KEY,
        environment: 'PRODUCTION',
      });
      expect(result.isValid).toBe(true);
    });

    it('should handle mixed-case environment names', () => {
      const result = validateSigningKeyConfiguration({
        govPaySigningKey: VALID_STRONG_KEY,
        bacsSigningKey: VALID_STRONG_KEY,
        environment: 'PrOdUcTiOn',
      });
      expect(result.isValid).toBe(true);
    });
  });

  describe('OpenSSL Generation Hints', () => {
    it('should suggest openssl command in length error', () => {
      expect(() => {
        validateSigningKeyConfiguration({
          govPaySigningKey: 'short',
          bacsSigningKey: VALID_STRONG_KEY,
          environment: 'production',
        });
      }).toThrow('openssl rand -hex 64');
    });

    it('should suggest openssl command in forbidden value error', () => {
      expect(() => {
        validateSigningKeyConfiguration({
          govPaySigningKey: 'password',
          bacsSigningKey: VALID_STRONG_KEY,
          environment: 'production',
        });
      }).toThrow('openssl rand -hex 64');
    });

    it('should suggest openssl command in entropy error', () => {
      expect(() => {
        validateSigningKeyConfiguration({
          govPaySigningKey: 'a'.repeat(32),
          bacsSigningKey: VALID_STRONG_KEY,
          environment: 'production',
        });
      }).toThrow('openssl rand -hex 64');
    });

    it('should include openssl command in warnings', () => {
      const result = validateSigningKeyConfiguration({
        govPaySigningKey: VALID_32_CHAR_KEY,
        bacsSigningKey: VALID_32_CHAR_KEY,
        environment: 'production',
      });
      expect(result.warnings?.[0]).toContain('openssl rand -hex 64');
    });
  });

  describe('Both Keys Validation', () => {
    it('should validate both keys and fail on first invalid', () => {
      expect(() => {
        validateSigningKeyConfiguration({
          govPaySigningKey: 'short',
          bacsSigningKey: 'alsoshort',
          environment: 'production',
        });
      }).toThrow('GOVPAY_WEBHOOK_SIGNING_KEY');
    });

    it('should accept when both keys are valid', () => {
      const result = validateSigningKeyConfiguration({
        govPaySigningKey: VALID_STRONG_KEY,
        bacsSigningKey: VALID_STRONG_KEY,
        environment: 'production',
      });
      expect(result.isValid).toBe(true);
    });

    it('should collect warnings from both keys', () => {
      const result = validateSigningKeyConfiguration({
        govPaySigningKey: VALID_32_CHAR_KEY,
        bacsSigningKey: VALID_32_CHAR_KEY,
        environment: 'production',
      });
      expect(result.warnings).toHaveLength(2);
      expect(result.warnings?.[0]).toContain('GOVPAY_WEBHOOK_SIGNING_KEY');
      expect(result.warnings?.[1]).toContain('UKSBS_WEBHOOK_SIGNING_KEY');
    });
  });

  describe('Trimming and Whitespace', () => {
    it('should trim whitespace from keys before validation', () => {
      const keyWithSpaces = `  ${VALID_STRONG_KEY}  `;
      const result = validateSigningKeyConfiguration({
        govPaySigningKey: keyWithSpaces,
        bacsSigningKey: keyWithSpaces,
        environment: 'production',
      });
      expect(result.isValid).toBe(true);
    });

    it('should reject keys that are only whitespace', () => {
      expect(() => {
        validateSigningKeyConfiguration({
          govPaySigningKey: '     ',
          bacsSigningKey: VALID_STRONG_KEY,
          environment: 'production',
        });
      }).toThrow('GOVPAY_WEBHOOK_SIGNING_KEY is not configured');
    });
  });

  describe('Real-World Scenarios', () => {
    it('should accept production-quality 64-char hex key', () => {
      const productionKey = 'a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890';
      const result = validateSigningKeyConfiguration({
        govPaySigningKey: productionKey,
        bacsSigningKey: productionKey,
        environment: 'production',
      });
      expect(result.isValid).toBe(true);
      expect(result.warnings).toBeUndefined();
    });

    it('should reject developer mistake of using "test" in production', () => {
      expect(() => {
        validateSigningKeyConfiguration({
          govPaySigningKey: 'test',
          bacsSigningKey: VALID_STRONG_KEY,
          environment: 'local',
        });
      }).toThrow('GOVPAY_WEBHOOK_SIGNING_KEY is a forbidden weak value');
    });

    it('should catch copy-paste errors with low entropy', () => {
      const copiedKey = '1111111111111111111111111111111111111111111111111111111111111111';
      expect(() => {
        validateSigningKeyConfiguration({
          govPaySigningKey: copiedKey,
          bacsSigningKey: VALID_STRONG_KEY,
          environment: 'production',
        });
      }).toThrow('has insufficient entropy');
    });
  });
});
