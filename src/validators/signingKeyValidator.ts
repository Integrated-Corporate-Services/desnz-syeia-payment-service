import { ERROR_CODES } from '../constants/error.constants';
import { CRYPTO_CONFIG } from '../constants/config.constants';

export interface SigningKeyValidationResult {
  isValid: boolean;
  errorCode?: ERROR_CODES;
  errorMessage?: string;
  warnings?: string[];
}

export interface SigningKeyConfig {
  govPaySigningKey: string;
  bacsSigningKey: string;
  environment: string;
}

function validateKeyExists(
  key: string | undefined,
  keyName: string
): SigningKeyValidationResult {
  if (!key || key.trim().length === 0) {
    return {
      isValid: false,
      errorCode: ERROR_CODES.SIGNING_KEY_NOT_CONFIGURED,
      errorMessage: `${keyName} is not configured. ` +
        'Webhook signature verification requires a valid signing key.',
    };
  }
  
  return { isValid: true };
}

function validateKeyLength(
  key: string,
  keyName: string,
  isProduction: boolean
): SigningKeyValidationResult {
  const { MIN_SIGNING_KEY_LENGTH, RECOMMENDED_SIGNING_KEY_LENGTH } = CRYPTO_CONFIG;
  const warnings: string[] = [];
  const trimmedKey = key.trim();
  
  if (isProduction && trimmedKey.length < MIN_SIGNING_KEY_LENGTH) {
    return {
      isValid: false,
      errorCode: ERROR_CODES.SIGNING_KEY_TOO_SHORT,
      errorMessage: 
        `FATAL: ${keyName} does not meet minimum length requirements. ` +
        `Key must be at least ${MIN_SIGNING_KEY_LENGTH} characters. ` +
        `Generate a strong key with: openssl rand -hex 64`,
    };
  }
  
  if (trimmedKey.length < RECOMMENDED_SIGNING_KEY_LENGTH) {
    warnings.push(
      `${keyName} is ${trimmedKey.length} characters (recommended: ${RECOMMENDED_SIGNING_KEY_LENGTH}+). ` +
      `Generate a stronger key with: openssl rand -hex 64`
    );
  }
  
  return {
    isValid: true,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

function validateKeyStrength(
  key: string,
  keyName: string
): SigningKeyValidationResult {
  const { FORBIDDEN_KEY_VALUES, MIN_UNIQUE_CHARS_32, MIN_UNIQUE_CHARS_64 } = CRYPTO_CONFIG;
  const trimmedKey = key.trim();
  const lowerKey = trimmedKey.toLowerCase();
  
  if ((FORBIDDEN_KEY_VALUES as readonly string[]).includes(lowerKey)) {
    return {
      isValid: false,
      errorCode: ERROR_CODES.SIGNING_KEY_FORBIDDEN_VALUE,
      errorMessage:
        `FATAL: ${keyName} is a forbidden weak value. ` +
        `Weak keys like 'secret', 'password', 'test' are easily guessed. ` +
        `Generate a strong key with: openssl rand -hex 64`,
    };
  }
  
  const uniqueChars = new Set(trimmedKey).size;
  const minUnique = trimmedKey.length >= 64 ? MIN_UNIQUE_CHARS_64 : MIN_UNIQUE_CHARS_32;
  
  if (uniqueChars < minUnique) {
    return {
      isValid: false,
      errorCode: ERROR_CODES.SIGNING_KEY_INSUFFICIENT_ENTROPY,
      errorMessage:
        `FATAL: ${keyName} has insufficient entropy. ` +
        `Found ${uniqueChars} unique characters, need at least ${minUnique}. ` +
        `Keys with repetitive patterns (e.g., 'aaaa...') can be brute-forced. ` +
        `Generate a strong key with: openssl rand -hex 64`,
    };
  }
  
  return { isValid: true };
}

export function validateSigningKeyConfiguration(
  config: SigningKeyConfig
): SigningKeyValidationResult {
  const { govPaySigningKey, bacsSigningKey, environment } = config;
  const normalizedEnv = environment.toLowerCase();

  const govPayExistsResult = validateKeyExists(govPaySigningKey, 'GOVPAY_WEBHOOK_SIGNING_KEY');
  if (!govPayExistsResult.isValid) {
    throw new Error(govPayExistsResult.errorMessage);
  }
  
  const bacsExistsResult = validateKeyExists(bacsSigningKey, 'UKSBS_WEBHOOK_SIGNING_KEY');
  if (!bacsExistsResult.isValid) {
    throw new Error(bacsExistsResult.errorMessage);
  }
  
  
  const govPayStrengthResult = validateKeyStrength(govPaySigningKey, 'GOVPAY_WEBHOOK_SIGNING_KEY');
  if (!govPayStrengthResult.isValid) {
    throw new Error(govPayStrengthResult.errorMessage);
  }
  
  const bacsStrengthResult = validateKeyStrength(bacsSigningKey, 'UKSBS_WEBHOOK_SIGNING_KEY');
  if (!bacsStrengthResult.isValid) {
    throw new Error(bacsStrengthResult.errorMessage);
  }
  

  const govPayLengthResult = validateKeyLength(govPaySigningKey, 'GOVPAY_WEBHOOK_SIGNING_KEY', true);
  if (!govPayLengthResult.isValid) {
    throw new Error(govPayLengthResult.errorMessage);
  }
  
  const bacsLengthResult = validateKeyLength(bacsSigningKey, 'UKSBS_WEBHOOK_SIGNING_KEY', true);
  if (!bacsLengthResult.isValid) {
    throw new Error(bacsLengthResult.errorMessage);
  }
  
  const allWarnings = [
    ...(govPayLengthResult.warnings || []),
    ...(bacsLengthResult.warnings || []),
  ];
  
  return {
    isValid: true,
    warnings: allWarnings.length > 0 ? allWarnings : undefined,
  };
}
