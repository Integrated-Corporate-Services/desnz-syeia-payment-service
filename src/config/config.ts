const dotenv = require('dotenv');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
import getLogger from '../utils/loggerHelper';

const logger = getLogger(module);

dotenv.config();

const isLocal = (process.env.NODE_ENV || '').toLowerCase() === 'local';

if (isLocal) {
  const envFile = `.env.${process.env.NODE_ENV || 'local'}`;
  dotenv.config({ path: envFile });
}

function getConfigValue(key: string, defaultValue: any = undefined): any {
  const value = process.env[key];
  if (value === undefined || value === null || value === '') {
    if (defaultValue === undefined) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return defaultValue;
  }
  return value;
}

function getNumberConfig(key: string, defaultValue?: number): number {
  const value = process.env[key];
  if (!value) {
    if (defaultValue === undefined) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return defaultValue;
  }
  const parsed = Number(value);
  if (isNaN(parsed)) {
    throw new Error(`Invalid number value for ${key}: ${value}`);
  }
  return parsed;
}

function getBooleanConfig(key: string, defaultValue: boolean = false): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

interface DbCredentials {
  username: string;
  password: string;
  engine?: string;
  host?: string;
  port?: number;
  dbname?: string;
}

let cachedSecret: { value: DbCredentials; fetchedAt: number } | null = null;
const SECRET_TTL_MS = Number(process.env.DB_SECRET_TTL_MS || 10 * 60 * 1000);

function needRefreshSecret(): boolean {
  if (!cachedSecret) return true;
  return Date.now() - cachedSecret.fetchedAt > SECRET_TTL_MS;
}

async function fetchSecretFromAWS(secretArn: string, region: string = 'eu-west-2'): Promise<DbCredentials> {
  const secretsClient = new SecretsManagerClient({ region });
  const cmd = new GetSecretValueCommand({ SecretId: secretArn });
  const res = await secretsClient.send(cmd);
  
  let payload: string;
  if (res.SecretString) {
    payload = res.SecretString;
  } else if (res.SecretBinary) {
    payload = Buffer.from(res.SecretBinary as Uint8Array).toString('utf8');
  } else {
    throw new Error('Secret has no SecretString or SecretBinary.');
  }
  
  try {
    const parsed = JSON.parse(payload);
    if (!parsed.username || !parsed.password) {
      throw new Error("Secret JSON must contain 'username' and 'password'.");
    }
    return parsed;
  } catch (err) {
    throw new Error(`Failed to parse secret JSON: ${err}`);
  }
}

export async function getDbSecretConfig(): Promise<DbCredentials> {
  const dbCredentials = process.env.DB_CREDENTIALS;
  const nodeEnv = (process.env.NODE_ENV || 'local').toLowerCase();
  const isProduction = nodeEnv === 'production';
  const isLocalOrTest = nodeEnv === 'local' || nodeEnv === 'test';
  
  // ✅ FIX HIGH-002 & CRITICAL-007: Enforce Secrets Manager in production
  if (!dbCredentials) {
    if (isProduction) {
      throw new Error(
        'FATAL: DB_CREDENTIALS environment variable required in production. ' +
        'Must be AWS Secrets Manager ARN (e.g., arn:aws:secretsmanager:eu-west-2:123456789012:secret:db-credentials-abc123)'
      );
    }
    
    // Local/test fallback with clear warning
    const user = process.env.DB_USER || 'postgres';
    const password = process.env.DB_PASSWORD;
    
    if (!password) {
      throw new Error(
        'DB credentials not found. Provide DB_CREDENTIALS (AWS Secrets Manager ARN) or ' +
        'DB_PASSWORD (local/test only).'
      );
    }
    
    // ✅ FIX HIGH-007: Use structured logger instead of console.warn
    logger.warn('[SECURITY WARNING] Using plaintext DB credentials', {
      source: 'DB_USER/DB_PASSWORD',
      environment: process.env.NODE_ENV,
      message: 'This is ONLY allowed in local/test environments. Production MUST use AWS Secrets Manager ARN.'
    });
    
    return { username: user, password };
  }
  
  // ✅ Validate ARN format for Secrets Manager
  const isSecretsManagerArn = dbCredentials.startsWith('arn:aws:secretsmanager:');
  
  if (isProduction && !isSecretsManagerArn) {
    throw new Error(
      'FATAL: In production, DB_CREDENTIALS must be AWS Secrets Manager ARN. ' +
      'Plaintext credentials are forbidden for PCI DSS compliance. ' +
      'Format: arn:aws:secretsmanager:REGION:ACCOUNT:secret:SECRET_NAME'
    );
  }
  
  // ✅ Fetch from Secrets Manager (with caching)
  if (isSecretsManagerArn) {
    if (!needRefreshSecret()) {
      return cachedSecret!.value;
    }
    
    const credentials = await fetchSecretFromAWS(dbCredentials, awsConfig.region);
    cachedSecret = { value: credentials, fetchedAt: Date.now() };
    return credentials;
  }
  
  // ✅ Local/test can use JSON credentials (not recommended but allowed)
  if (isLocalOrTest) {
    try {
      const parsed = JSON.parse(dbCredentials);
      if (parsed.username && parsed.password) {
        // ✅ FIX HIGH-007: Use structured logger instead of console.warn
        logger.warn('[SECURITY WARNING] Using JSON plaintext credentials', {
          format: 'JSON',
          environment: process.env.NODE_ENV,
          message: 'Consider using AWS Secrets Manager ARN even in local development.'
        });
        return parsed;
      }
      throw new Error('JSON must contain username and password fields');
    } catch (err) {
      throw new Error(`Failed to parse DB_CREDENTIALS as JSON: ${err}`);
    }
  }
  
  throw new Error(
    'Invalid DB_CREDENTIALS format. Must be AWS Secrets Manager ARN or ' +
    'valid JSON with username/password (local/test only).'
  );
}

export const serverConfig = {
  port: getNumberConfig('PORT', 3001),
  host: getConfigValue('HOST', '0.0.0.0'),
  nodeEnv: getConfigValue('NODE_ENV', 'local'),
  logLevel: getConfigValue('LOG_LEVEL', isLocal ? 'debug' : 'info'),
  timeout: getNumberConfig('SERVER_TIMEOUT', 30000),
  keepAliveTimeout: getNumberConfig('KEEP_ALIVE_TIMEOUT', 35000),
  requestTimeout: getNumberConfig('REQUEST_TIMEOUT', 25000),
  rateLimitWindowMs: getNumberConfig('RATE_LIMIT_WINDOW_MS', 60000),
  rateLimitMax: getNumberConfig('RATE_LIMIT_MAX', isLocal ? 100 : 20),
};

export const dbConfig = {
  host: getConfigValue('DB_HOST', 'localhost'),
  port: getNumberConfig('DB_PORT', 5432),
  database: getConfigValue('DB_NAME', 'appdb'),
  user: getConfigValue('DB_USER', 'postgres'),
  password: process.env.DB_PASSWORD || '',
  poolMax: getNumberConfig('DB_POOL_MAX', 10),
  idleTimeoutMs: getNumberConfig('DB_IDLE_MS', 20000),
  connectionTimeoutMs: getNumberConfig('DB_CONN_MS', 15000),
  queryTimeoutMs: getNumberConfig('DB_QUERY_MS', 40000),
  sslMode: getConfigValue('PGSSLMODE', isLocal ? 'disable' : 'require'),
  applicationName: getConfigValue('DB_APPLICATION_NAME', 'integration-service'),
};

export const backendConfig = {
  url: getConfigValue('BACKEND_SERVICE_URL', 'http://localhost:3000/backend'),
  timeout: getNumberConfig('BACKEND_TIMEOUT', 5000),
  retryAttempts: getNumberConfig('BACKEND_RETRY_ATTEMPTS', 2),
  retryDelay: getNumberConfig('BACKEND_RETRY_DELAY', 1000),
};

export const webhookConfig = {
  signingKey: getConfigValue('GOVPAY_WEBHOOK_SIGNING_KEY'),
  signingAlgorithm: getConfigValue('WEBHOOK_SIGNING_ALGORITHM', 'sha256'),
  maxRetries: getNumberConfig('WEBHOOK_MAX_RETRIES', 3),
  retryIntervals: [
    getNumberConfig('WEBHOOK_RETRY_INTERVAL_1', 5 * 60 * 1000),
    getNumberConfig('WEBHOOK_RETRY_INTERVAL_2', 10 * 60 * 1000),
    getNumberConfig('WEBHOOK_RETRY_INTERVAL_3', 15 * 60 * 1000),
  ],
};

export const govPayConfig = {
  apiUrl: getConfigValue('GOVPAY_API_URL'),
  apiKey: getConfigValue('GOVPAY_API_KEY'),
  timeout: getNumberConfig('GOVPAY_TIMEOUT', 10000),
};

export const bacsWebhookConfig = {
  signingKey: getConfigValue('UKSBS_WEBHOOK_SIGNING_KEY'),
  signingAlgorithm: getConfigValue('UKSBS_SIGNING_ALGORITHM', 'sha256'),
};

export const featureFlags = {
  callbackServiceEnabled: getBooleanConfig('CALLBACK_SERVICE_ENABLED', true),
  retryEnabled: getBooleanConfig('RETRY_ENABLED', true),
  dlqEnabled: getBooleanConfig('DLQ_ENABLED', true),
  signatureVerificationEnabled: getBooleanConfig('SIGNATURE_VERIFICATION_ENABLED', true),
  metricsEnabled: getBooleanConfig('METRICS_ENABLED', false),
  detailedLogging: getBooleanConfig('DETAILED_LOGGING', isLocal),
};

const isProduction = process.env.NODE_ENV === 'production';

export const securityConfig = {
  corsOrigins: getConfigValue('CORS_ORIGINS', isProduction ? '' : '*').split(',').filter(Boolean),
  trustedProxies: getConfigValue('TRUSTED_PROXIES', '').split(',').filter(Boolean),
  healthEndpointAllowedIps: getConfigValue('HEALTH_ENDPOINT_ALLOWED_IPS', '')
    .split(',')
    .map((ip: string) => ip.trim())
    .filter(Boolean),
  healthEndpointBypassInLocal: getBooleanConfig('HEALTH_ENDPOINT_BYPASS_IN_LOCAL', true),
};

export const awsConfig = {
  region: getConfigValue('AWS_REGION', 'eu-west-2'),
  endpoint: getConfigValue('AWS_ENDPOINT', ''),
  sqsQueueUrl: getConfigValue('PAYMENT_WEBHOOK_QUEUE_URL', ''),
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || undefined,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || undefined,
  sqsEnabled: getBooleanConfig('SQS_ENABLED', false),
};

function validateConfig(): void {
  const errors: string[] = [];

  if (!webhookConfig.signingKey) {
    errors.push('GOVPAY_WEBHOOK_SIGNING_KEY is required');
  }

  if (!bacsWebhookConfig.signingKey) {
    errors.push('UKSBS_WEBHOOK_SIGNING_KEY is required');
  }

  if (!govPayConfig.apiKey) {
    errors.push('GOVPAY_API_KEY is required');
  }

  // ✅ FIX HIGH-002: Enhanced database credential validation
  if (isProduction) {
    if (!process.env.DB_CREDENTIALS) {
      errors.push('DB_CREDENTIALS is required in production (must be AWS Secrets Manager ARN)');
    } else if (!process.env.DB_CREDENTIALS.startsWith('arn:aws:secretsmanager:')) {
      errors.push('DB_CREDENTIALS must be AWS Secrets Manager ARN in production (not plaintext)');
    }
  } else {
    // Local/test: require at least one credential method
    if (!process.env.DB_CREDENTIALS && !dbConfig.password) {
      errors.push('DB credentials required: provide either DB_CREDENTIALS (AWS Secrets Manager ARN) or DB_PASSWORD (local/test only)');
    }
  }

  if (serverConfig.keepAliveTimeout <= serverConfig.timeout) {
    errors.push('KEEP_ALIVE_TIMEOUT must be greater than SERVER_TIMEOUT');
  }

  if (webhookConfig.maxRetries < 0 || webhookConfig.maxRetries > 10) {
    errors.push('WEBHOOK_MAX_RETRIES must be between 0 and 10');
  }

  if (isProduction && securityConfig.corsOrigins.length === 0) {
    errors.push('CORS_ORIGINS must be configured for production (webhook endpoints should not allow * origin)');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

if (process.env.NODE_ENV !== 'test') {
  try {
    validateConfig();
  } catch (error) {
    // ✅ FIX HIGH-007: Use structured logger instead of console.error
    logger.error('Configuration validation failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      environment: process.env.NODE_ENV
    });
    if (!isLocal) {
      process.exit(1);
    }
  }
}

const config = {
  server: serverConfig,
  db: dbConfig,
  backend: backendConfig,
  webhook: webhookConfig,
  govPay: govPayConfig,
  bacsWebhookConfig: bacsWebhookConfig,
  features: featureFlags,
  security: securityConfig,
  aws: awsConfig,
  isLocal,
  isProduction,
};

export default config;
