/**
 * Database Pool Manager with On-Demand Password Rotation
 * 
 * Supports two credential modes:
 * 1. DB_CREDENTIALS (ECS valueFrom) - Recommended for production
 *    - Initial credentials loaded from DB_CREDENTIALS (JSON injected by ECS)
 *    - On authentication failure, fetches fresh credentials from DB_CREDENTIALS_SECRET_ARN
 *    - No ECS restart required for password rotation
 * 
 * 2. Environment Variables - Fallback mode
 *    - Uses DB_HOST, DB_USER, DB_PASSWORD directly
 *    - No automatic password rotation support
 *    - Requires container restart for password changes
 * 
 * Environment Variables:
 * - DB_CREDENTIALS: JSON credentials injected by ECS (optional, recommended for rotation)
 * - DB_CREDENTIALS_SECRET_ARN: Secrets Manager ARN for fetching rotated passwords (required for rotation)
 * - DB_HOST, DB_PORT, DB_NAME: Database connection details
 */

import { Pool, PoolConfig } from 'pg';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { getDbCredentials } from '../config/config';
import { logInfo, logError, logWarn, logDebug } from '../utils/loggerHelper';

const context = 'DBPoolManager';

interface DbCredentials {
  username: string;
  password: string;
  host?: string;
  port?: number;
  dbname?: string;
  engine?: string;
}

const isLocal = (process.env.NODE_ENV || '').toLowerCase() === 'local';

class DatabasePoolManager {
  private currentPool: Pool | null = null;
  private currentCredentials: DbCredentials | null = null;
  private isRefreshing: boolean = false;

  /**
   * Build SSL configuration for AWS RDS
   */
  private buildSslConfig(): boolean | { require: boolean; rejectUnauthorized: boolean } {
    if (isLocal) return false;
    const sslMode = (process.env.DB_SSLMODE || '').toLowerCase();
    if (sslMode === 'disable') return false;
    
    return {
      require: true,
      rejectUnauthorized: false,
    };
  }

  /**
   * Get current pool instance (creates if needed)
   */
  async getPool(): Promise<Pool> {
    if (!this.currentPool) {
      await this.initializePool();
    }
    return this.currentPool!;
  }

  /**
   * Initialize database pool with credentials
   */
  private async initializePool(): Promise<void> {
    logInfo(context, '[initializePool] Initializing database connection pool');

    const credentials = await this.loadInitialCredentials();
    this.currentCredentials = credentials;

    const poolConfig = this.createPoolConfig(credentials);
    this.currentPool = new Pool(poolConfig);

    this.setupEventHandlers();

    logInfo(context, '[initializePool] Database pool initialized successfully', {
      host: poolConfig.host,
      database: poolConfig.database,
      credentialSource: process.env.DB_CREDENTIALS ? 'DB_CREDENTIALS' : 'environment',
      rotationEnabled: !!process.env.DB_CREDENTIALS_SECRET_ARN
    });
  }

  /**
   * Load initial credentials from DB_CREDENTIALS or environment
   */
  private async loadInitialCredentials(): Promise<DbCredentials> {
    if (process.env.DB_CREDENTIALS) {
      try {
        const parsed = JSON.parse(process.env.DB_CREDENTIALS);
        if (!parsed.username || !parsed.password) {
          throw new Error('DB_CREDENTIALS must contain username and password');
        }
        logInfo(context, '[loadInitialCredentials] Loaded credentials from DB_CREDENTIALS');
        return parsed;
      } catch (error) {
        logError(context, '[loadInitialCredentials] Failed to parse DB_CREDENTIALS', error as Error);
        throw error;
      }
    }

    // Fallback to environment variables via config
    logInfo(context, '[loadInitialCredentials] Using credentials from environment');
    const envCreds = getDbCredentials();
    return {
      username: envCreds.user,
      password: envCreds.password,
    };
  }

  /**
   * Create pool configuration
   */
  private createPoolConfig(credentials: DbCredentials): PoolConfig {
    const dbHost = (credentials as any).host || process.env.DB_HOST;
    const dbPort = Number((credentials as any).port || process.env.DB_PORT || 5432);
    const dbName = (credentials as any).dbname || process.env.DB_NAME;
    const poolMax = Number(process.env.DB_POOL_MAX || 20);
    const idleTimeoutMs = Number(process.env.DB_IDLE_TIMEOUT_MS || 10000);
    const connectionTimeoutMs = Number(process.env.DB_CONNECTION_TIMEOUT_MS || 5000);

    if (!dbHost || !dbName) {
      throw new Error('Database host and name are required (DB_HOST, DB_NAME)');
    }

    return {
      host: dbHost,
      port: dbPort,
      database: dbName,
      user: credentials.username,
      password: credentials.password,
      max: poolMax,
      idleTimeoutMillis: idleTimeoutMs,
      connectionTimeoutMillis: connectionTimeoutMs,
      ssl: this.buildSslConfig(),
      keepAlive: true,
      application_name: 'payment-callback-service',
    };
  }

  /**
   * Setup pool event handlers
   */
  private setupEventHandlers(): void {
    if (!this.currentPool) return;

    this.currentPool.on('connect', () => {
      logDebug(context, '[setupEventHandlers] New connection established');
    });

    this.currentPool.on('error', (err: any) => {
      logError(context, '[setupEventHandlers] Pool error', err);

      // Detect authentication failures (password rotation)
      if (
        err.code === '28P01' ||
        err.message?.toLowerCase().includes('password authentication failed')
      ) {
        logWarn(context, '[setupEventHandlers] Authentication error detected - password may have been rotated');
        
        if (process.env.DB_CREDENTIALS_SECRET_ARN) {
          logInfo(context, '[setupEventHandlers] Triggering automatic credential refresh');
          this.refreshCredentials().catch((refreshErr) => {
            logError(context, '[setupEventHandlers] Failed to refresh credentials', refreshErr as Error);
          });
        } else {
          logWarn(context, '[setupEventHandlers] DB_CREDENTIALS_SECRET_ARN not configured - cannot auto-refresh');
          logWarn(context, '[setupEventHandlers] ECS restart required to pick up new password');
        }
      }
    });
  }

  /**
   * Fetch fresh credentials from Secrets Manager and recreate pool
   */
  async refreshCredentials(): Promise<void> {
    if (this.isRefreshing) {
      logDebug(context, '[refreshCredentials] Credential refresh already in progress');
      return;
    }

    const secretArn = process.env.DB_CREDENTIALS_SECRET_ARN;
    if (!secretArn) {
      logWarn(context, '[refreshCredentials] Cannot refresh - DB_CREDENTIALS_SECRET_ARN not configured');
      return;
    }

    const refreshStartTime = Date.now();
    
    try {
      this.isRefreshing = true;
      logInfo(context, '[refreshCredentials] CREDENTIAL REFRESH STARTED', {
        secretArnConfigured: true,
        timestamp: new Date().toISOString(),
      });

      // Fetch fresh credentials from Secrets Manager
      logInfo(context, '[refreshCredentials] Fetching fresh credentials from Secrets Manager');
      const newCredentials = await this.fetchCredentialsFromSecretsManager(secretArn);

      // Check if credentials actually changed
      const credentialsChanged =
        this.currentCredentials?.username !== newCredentials.username ||
        this.currentCredentials?.password !== newCredentials.password;

      if (credentialsChanged) {
        logInfo(context, '[refreshCredentials] Credentials changed - recreating pool', {
          usernameChanged: this.currentCredentials?.username !== newCredentials.username,
          passwordChanged: this.currentCredentials?.password !== newCredentials.password,
        });

        await this.recreatePool(newCredentials);

        const refreshDuration = Date.now() - refreshStartTime;
        logInfo(context, '[refreshCredentials] CREDENTIAL REFRESH COMPLETED', {
          refreshDurationMs: refreshDuration,
        });
      } else {
        logInfo(context, '[refreshCredentials] Credentials unchanged - pool error may be transient');
      }
    } catch (error) {
      const refreshDuration = Date.now() - refreshStartTime;
      logError(context, '[refreshCredentials] CREDENTIAL REFRESH FAILED', error as Error, {
        refreshDurationMs: refreshDuration,
      });
      throw error;
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Fetch credentials from AWS Secrets Manager
   */
  private async fetchCredentialsFromSecretsManager(secretArn: string): Promise<DbCredentials> {
    const region = process.env.AWS_REGION || 'eu-west-2';
    const client = new SecretsManagerClient({ region });

    logInfo(context, '[fetchCredentialsFromSecretsManager] Calling Secrets Manager', { secretArn });

    const command = new GetSecretValueCommand({ SecretId: secretArn });
    const response = await client.send(command);

    if (!response.SecretString) {
      throw new Error('Secret has no SecretString');
    }

    const parsed = JSON.parse(response.SecretString);
    
    if (!parsed.username || !parsed.password) {
      throw new Error('Secret must contain username and password fields');
    }

    logInfo(context, '[fetchCredentialsFromSecretsManager] Successfully fetched credentials from Secrets Manager', {
      hasUsername: !!parsed.username,
      hasPassword: !!parsed.password,
      hasHost: !!parsed.host,
    });

    return parsed;
  }

  /**
   * Recreate pool with new credentials
   */
  private async recreatePool(newCredentials: DbCredentials): Promise<void> {
    logInfo(context, '[recreatePool] Recreating connection pool with new credentials');

    // Close existing pool
    if (this.currentPool) {
      logInfo(context, '[recreatePool] Closing old connection pool');
      await this.currentPool.end();
      this.currentPool = null;
    }

    // Create new pool
    this.currentCredentials = newCredentials;
    const poolConfig = this.createPoolConfig(newCredentials);
    this.currentPool = new Pool(poolConfig);
    this.setupEventHandlers();

    logInfo(context, '[recreatePool] New connection pool created successfully');
  }

  /**
   * Close database pool (graceful shutdown)
   */
  async closePool(): Promise<void> {
    if (this.currentPool) {
      logInfo(context, '[closePool] Closing connection pool');
      await this.currentPool.end();
      this.currentPool = null;
      logInfo(context, '[closePool] Connection pool closed');
    }
  }
}

// Singleton instance
const poolManager = new DatabasePoolManager();

export default poolManager;
