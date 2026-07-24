import { ERROR_CODES, ERROR_CATEGORIES } from '../constants/error.constants';
import { CRYPTO_CONFIG, ENVIRONMENTS } from '../constants/config.constants';
import getLogger from '../utils/loggerHelper';

const logger = getLogger(module);

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
  
  if (isProduction && key.length < MIN_SIGNING_KEY_LENGTH) {
    return {
      isValid: false,
      errorCode: ERROR_CODES.SIGNING_KEY_TOO_SHORT,
      errorMessage: `${keyName} does not meet minimum length requirements for production.`,
    };
  }
  
  if (key.length < RECOMMENDED_SIGNING_KEY_LENGTH) {
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
  const isProduction = environment === ENVIRONMENTS.PRODUCTION;
  
  const govPayExistsResult = validateKeyExists(govPaySigningKey, 'GOVPAY_WEBHOOK_SIGNING_KEY');
  if (!govPayExistsResult.isValid) {
    logger.error('[Webhook] GOV.UK Pay signing key validation failed', {
      error_code: govPayExistsResult.errorCode,
      error_category: ERROR_CATEGORIES.CONFIGURATION,
    });
    throw new Error(govPayExistsResult.errorMessage);
  }
  
  const bacsExistsResult = validateKeyExists(bacsSigningKey, 'UKSBS_WEBHOOK_SIGNING_KEY');
  if (!bacsExistsResult.isValid) {
    logger.error('[Webhook] BACS signing key validation failed', {
      error_code: bacsExistsResult.errorCode,
      error_category: ERROR_CATEGORIES.CONFIGURATION,
    });
    throw new Error(bacsExistsResult.errorMessage);
  }
  
  const govPayLengthResult = validateKeyLength(govPaySigningKey, 'GOVPAY_WEBHOOK_SIGNING_KEY', isProduction);
  if (!govPayLengthResult.isValid) {
    logger.error('[Webhook] GOV.UK Pay signing key validation failed', {
      error_code: govPayLengthResult.errorCode,
      environment,
    });
    throw new Error(govPayLengthResult.errorMessage);
  }
  
  const bacsLengthResult = validateKeyLength(bacsSigningKey, 'UKSBS_WEBHOOK_SIGNING_KEY', isProduction);
  if (!bacsLengthResult.isValid) {
    logger.error('[Webhook] BACS signing key validation failed', {
      error_code: bacsLengthResult.errorCode,
      environment,
    });
    throw new Error(bacsLengthResult.errorMessage);
  }
  
  const allWarnings = [
    ...(govPayLengthResult.warnings || []),
    ...(bacsLengthResult.warnings || []),
  ];
  
  if (allWarnings.length > 0) {
    allWarnings.forEach(warning => {
      logger.warn('[Webhook] Signing key configuration warning', {
        warning,
        environment,
        error_code: ERROR_CODES.SIGNING_KEY_WEAK,
      });
    });
  }
  
  logger.info('[Webhook] Signing key configuration validated successfully', {
    environment,
  });
  
  return {
    isValid: true,
    warnings: allWarnings.length > 0 ? allWarnings : undefined,
  };
}
