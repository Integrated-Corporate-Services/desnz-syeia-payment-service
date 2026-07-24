import { ERROR_CODES, ERROR_CATEGORIES } from '../constants/error.constants';
import { CRYPTO_CONFIG, ENVIRONMENTS } from '../constants/config.constants';

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
      errorMessage: `${keyName} does not meet minimum length requirements for production.`,
    };
  }
  
  if (trimmedKey.length < RECOMMENDED_SIGNING_KEY_LENGTH) {
    warnings.push(
      `${keyName} is shorter than recommended length.`
    );
  }
  
  return {
    isValid: true,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

export function validateSigningKeyConfiguration(
  config: SigningKeyConfig
): SigningKeyValidationResult {
  const { govPaySigningKey, bacsSigningKey, environment } = config;
  const normalizedEnv = environment.toLowerCase();
  const isProduction = normalizedEnv === ENVIRONMENTS.PRODUCTION || 
                       normalizedEnv === ENVIRONMENTS.DEVELOPMENT || 
                       normalizedEnv === ENVIRONMENTS.STAGING;
  
  const govPayExistsResult = validateKeyExists(govPaySigningKey, 'GOVPAY_WEBHOOK_SIGNING_KEY');
  if (!govPayExistsResult.isValid) {
    throw new Error(govPayExistsResult.errorMessage);
  }
  
  const bacsExistsResult = validateKeyExists(bacsSigningKey, 'UKSBS_WEBHOOK_SIGNING_KEY');
  if (!bacsExistsResult.isValid) {
    throw new Error(bacsExistsResult.errorMessage);
  }
  
  const govPayLengthResult = validateKeyLength(govPaySigningKey, 'GOVPAY_WEBHOOK_SIGNING_KEY', isProduction);
  if (!govPayLengthResult.isValid) {
    throw new Error(govPayLengthResult.errorMessage);
  }
  
  const bacsLengthResult = validateKeyLength(bacsSigningKey, 'UKSBS_WEBHOOK_SIGNING_KEY', isProduction);
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
