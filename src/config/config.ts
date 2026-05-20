// Configuration Module
// Environment-based configuration with proper defaults and validation

const dotenv = require('dotenv');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

// Load .env file first
dotenv.config();

// Check if we're in local environment AFTER loading .env
const isLocal = (process.env.NODE_ENV || '').toLowerCase() === 'local';

// Load environment-specific env file if in local mode
if (isLocal) {
  const envFile = `.env.${process.env.NODE_ENV || 'local'}`;
  dotenv.config({ path: envFile }); // This will override with .env.local if it exists
}

/**
 * Get configuration value with fallback
 */
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

/**
 * Get number configuration with validation
 */
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

/**
 * Get boolean configuration
 */
function getBooleanConfig(key: string, defaultValue: boolean = false): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Fetches and parses a secret from AWS Secrets Manager.
 * For local development, falls back to individual DB_USER and DB_PASSWORD env vars.
 */
interface DbCredentials {
  username: string;
  password: string;
  engine?: string;
  host?: string;
  port?: number;
  dbname?: string;
}

let cachedSecret: { value: DbCredentials; fetchedAt: number } | null = null;
const SECRET_TTL_MS = Number(process.env.DB_SECRET_TTL_MS || 10 * 60 * 1000); // 10 minutes

function needRefreshSecret(): boolean {
  if (!cachedSecret) return true;
  return Date.now() - cachedSecret.fetchedAt > SECRET_TTL_MS;
}

/**
 * Fetches DB credentials from Secrets Manager and caches them.
 * This is used when DB_CREDENTIALS env var contains a Secrets Manager ARN.
 */
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

/**
 * Gets DB credentials - either from AWS Secrets Manager or from individual env vars.
 * In AWS ECS, DB_CREDENTIALS is the entire secret JSON string injected by ECS.
 * For local dev, uses DB_USER and DB_PASSWORD directly.
 */
export async function getDbSecretConfig(): Promise<DbCredentials> {
  const dbCredentials = process.env.DB_CREDENTIALS;
  
  // If DB_CREDENTIALS exists
  if (dbCredentials) {
    // Check if it's already a JSON string (ECS injects the full secret value)
    try {
      const parsed = JSON.parse(dbCredentials);
      if (parsed.username && parsed.password) {
        return parsed;
      }
    } catch {
      // Not JSON, might be an ARN - fetch from Secrets Manager
      if (dbCredentials.startsWith('arn:aws:secretsmanager:')) {
        if (!needRefreshSecret()) {
          return cachedSecret!.value;
        }
        const credentials = await fetchSecretFromAWS(dbCredentials, awsConfig.region);
        cachedSecret = { value: credentials, fetchedAt: Date.now() };
        return credentials;
      }
    }
  }
  
  // Fall back to individual env vars (local development)
  const user = process.env.DB_USER || 'postgres';
  const password = process.env.DB_PASSWORD;
  
  if (!password) {
    throw new Error('DB credentials not found. Provide either DB_CREDENTIALS (AWS) or DB_PASSWORD (local).');
  }
  
  return { username: user, password };
}

/**
 * Server Configuration
 */
export const serverConfig = {
  port: getNumberConfig('PORT', 3001),
  host: getConfigValue('HOST', '0.0.0.0'),
  nodeEnv: getConfigValue('NODE_ENV', 'local'),
  logLevel: getConfigValue('LOG_LEVEL', isLocal ? 'debug' : 'info'),
  
  // Timeouts
  timeout: getNumberConfig('SERVER_TIMEOUT', 30000), // 30 seconds
  keepAliveTimeout: getNumberConfig('KEEP_ALIVE_TIMEOUT', 35000), // 35 seconds (buffer)
  requestTimeout: getNumberConfig('REQUEST_TIMEOUT', 25000), // 25 seconds
  
  // Rate limiting
  rateLimitWindowMs: getNumberConfig('RATE_LIMIT_WINDOW_MS', 60000), // 1 minute
  rateLimitMax: getNumberConfig('RATE_LIMIT_MAX', 100), // 100 requests per window
};

/**
 * Database Configuration
 * Note: In AWS, user and password come from DB_CREDENTIALS (Secrets Manager).
 * For local dev, use DB_USER and DB_PASSWORD env vars directly.
 */
export const dbConfig = {
  host: getConfigValue('DB_HOST', 'localhost'),
  port: getNumberConfig('DB_PORT', 5432),
  database: getConfigValue('DB_NAME', 'appdb'),
  user: getConfigValue('DB_USER', 'postgres'),
  password: getConfigValue('DB_PASSWORD', ''), // Optional - will be fetched from DB_CREDENTIALS if not provided
  
  // Pool configuration
  poolMax: getNumberConfig('DB_POOL_MAX', 10),
  idleTimeoutMs: getNumberConfig('DB_IDLE_MS', 20000),
  connectionTimeoutMs: getNumberConfig('DB_CONN_MS', 15000),
  queryTimeoutMs: getNumberConfig('DB_QUERY_MS', 40000),
  
  // SSL configuration
  sslMode: getConfigValue('PGSSLMODE', 'disable'),
  
  // Application name for connection tracking
  applicationName: getConfigValue('DB_APPLICATION_NAME', 'integration-service'),
};

/**
 * Backend Service Configuration
 */
export const backendConfig = {
  url: getConfigValue('BACKEND_SERVICE_URL', 'http://localhost:3000/backend'),
  timeout: getNumberConfig('BACKEND_TIMEOUT', 5000), // 5 seconds
  retryAttempts: getNumberConfig('BACKEND_RETRY_ATTEMPTS', 2),
  retryDelay: getNumberConfig('BACKEND_RETRY_DELAY', 1000), // 1 second
};

/**
 * Webhook Configuration
 */
export const webhookConfig = {
  signingKey: getConfigValue('GOVPAY_WEBHOOK_SIGNING_KEY'), // Required
  signingAlgorithm: getConfigValue('WEBHOOK_SIGNING_ALGORITHM', 'sha256'),
  
  // Retry configuration
  maxRetries: getNumberConfig('WEBHOOK_MAX_RETRIES', 3),
  retryIntervals: [
    getNumberConfig('WEBHOOK_RETRY_INTERVAL_1', 5 * 60 * 1000),  // 5 minutes
    getNumberConfig('WEBHOOK_RETRY_INTERVAL_2', 10 * 60 * 1000), // 10 minutes
    getNumberConfig('WEBHOOK_RETRY_INTERVAL_3', 15 * 60 * 1000), // 15 minutes
  ],
};

/**
 * GOV.UK Pay Configuration
 */
export const govPayConfig = {
  apiUrl: getConfigValue('GOVPAY_API_URL', 'https://publicapi.payments.service.gov.uk/v1/payments'),
  apiKey: getConfigValue('GOVPAY_API_KEY'), // Required
  timeout: getNumberConfig('GOVPAY_TIMEOUT', 10000), // 10 seconds
};

/**
 * Feature Flags
 */
export const featureFlags = {
  callbackServiceEnabled: getBooleanConfig('CALLBACK_SERVICE_ENABLED', true),
  retryEnabled: getBooleanConfig('RETRY_ENABLED', true),
  dlqEnabled: getBooleanConfig('DLQ_ENABLED', true),
  signatureVerificationEnabled: getBooleanConfig('SIGNATURE_VERIFICATION_ENABLED', true),
  metricsEnabled: getBooleanConfig('METRICS_ENABLED', false),
  detailedLogging: getBooleanConfig('DETAILED_LOGGING', isLocal),
};

/**
 * Security Configuration
 */
export const securityConfig = {
  sessionSecret: getConfigValue('SESSION_SECRET', 'dev-secret-change-in-production'),
  corsOrigins: getConfigValue('CORS_ORIGINS', '*').split(','),
  trustedProxies: getConfigValue('TRUSTED_PROXIES', '').split(',').filter(Boolean),
};

/**
 * AWS Configuration (if applicable)
 */
export const awsConfig = {
  region: getConfigValue('AWS_REGION', 'eu-west-2'),
  endpoint: getConfigValue('AWS_ENDPOINT', ''), // LocalStack for local dev (empty string = not used)
  sqsQueueUrl: getConfigValue('PAYMENT_WEBHOOK_QUEUE_URL', ''),
  accessKeyId: getConfigValue('AWS_ACCESS_KEY_ID', ''), // Optional - uses IAM role if not provided
  secretAccessKey: getConfigValue('AWS_SECRET_ACCESS_KEY', ''), // Optional - uses IAM role if not provided
  sqsEnabled: getBooleanConfig('SQS_ENABLED', false), // Enable/disable SQS integration
};

/**
 * Validate configuration on module load
 */
function validateConfig(): void {
  const errors: string[] = [];

  // Validate required configurations
  if (!webhookConfig.signingKey) {
    errors.push('GOVPAY_WEBHOOK_SIGNING_KEY is required');
  }

  if (!govPayConfig.apiKey) {
    errors.push('GOVPAY_API_KEY is required');
  }

  // Check DB credentials - either DB_CREDENTIALS (AWS) or DB_PASSWORD (local) must be provided
  if (!process.env.DB_CREDENTIALS && !dbConfig.password) {
    errors.push('DB credentials required: provide either DB_CREDENTIALS (AWS Secrets Manager) or DB_PASSWORD (local)');
  }

  if (serverConfig.keepAliveTimeout <= serverConfig.timeout) {
    errors.push('KEEP_ALIVE_TIMEOUT must be greater than SERVER_TIMEOUT');
  }

  if (webhookConfig.maxRetries < 0 || webhookConfig.maxRetries > 10) {
    errors.push('WEBHOOK_MAX_RETRIES must be between 0 and 10');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

// Validate on load (but allow override in tests)
if (process.env.NODE_ENV !== 'test') {
  try {
    validateConfig();
  } catch (error) {
    // Use console.error here since logger may not be initialized yet
    // This is before logger initialization and only runs during module load
    // eslint-disable-next-line no-console
    console.error('Configuration validation failed:', error);
    if (!isLocal) {
      process.exit(1); // Exit in production, warn in local
    }
  }
}

/**
 * Export all configuration
 */
const config = {
  server: serverConfig,
  db: dbConfig,
  backend: backendConfig,
  webhook: webhookConfig,
  govPay: govPayConfig,
  features: featureFlags,
  security: securityConfig,
  aws: awsConfig,
  isLocal,
  isProduction: process.env.NODE_ENV === 'production',
};

export default config;
