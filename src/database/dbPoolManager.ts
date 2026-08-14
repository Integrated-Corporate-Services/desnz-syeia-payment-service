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
import { dbConfig, getDbSecretConfig } from '../config/config';
import getLogger from '../utils/loggerHelper';

const logger = getLogger(module);

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
  private isRefreshing = false;

  /**
   * Build SSL configuration for AWS RDS
   */
  private buildSslConfig(): boolean | { require: boolean; rejectUnauthorized: boolean } {
    if (isLocal) return false;
    const sslMode = (process.env.PGSSLMODE || dbConfig.sslMode || '').toLowerCase();
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
    if (!this.currentPool) {
      throw new Error('Failed to initialize database pool');
    }
    return this.currentPool;
  }

  /**
   * Initialize database pool with credentials
   */
  private async initializePool(): Promise<void> {
    logger.info('[DBPoolManager] Initializing database connection pool');

    const credentials = await this.loadInitialCredentials();
    this.currentCredentials = credentials;

    const poolConfig = this.createPoolConfig(credentials);
    this.currentPool = new Pool(poolConfig);

    this.setupEventHandlers();

    logger.info('[DBPoolManager] Database pool initialized successfully');
  }

  /**
   * Load initial credentials from DB_CREDENTIALS or environment
   */
  private async loadInitialCredentials(): Promise<DbCredentials> {
    // Use the existing getDbSecretConfig which handles ARN, JSON, and env vars
    try {
      const credentials = await getDbSecretConfig();
      logger.info('[DBPoolManager] Loaded credentials via getDbSecretConfig');
      return credentials;
    } catch (error) {
      logger.error('[DBPoolManager] Failed to load credentials', { error });
      throw error;
    }
  }

  /**
   * Create pool configuration
   */
  private createPoolConfig(credentials: DbCredentials): PoolConfig {
    const dbHost = credentials.host || dbConfig.host;
    const dbPort = Number(credentials.port || dbConfig.port);
    const dbName = credentials.dbname || dbConfig.database;
    const appName = dbConfig.applicationName || 'payment-callback-service';

    if (!dbHost || !dbName) {
      throw new Error('Database host and name are required');
    }

    return {
      host: dbHost,
      port: dbPort,
      database: dbName,
      user: credentials.username,
      password: credentials.password,
      max: dbConfig.poolMax,
      idleTimeoutMillis: dbConfig.idleTimeoutMs,
      connectionTimeoutMillis: dbConfig.connectionTimeoutMs,
      query_timeout: dbConfig.queryTimeoutMs,
      ssl: this.buildSslConfig(),
      keepAlive: true,
      application_name: appName,
    };
  }

  /**
   * Setup pool event handlers
   */
  private setupEventHandlers(): void {
    if (!this.currentPool) return;

    this.currentPool.on('connect', () => {
      logger.debug('[DBPoolManager] New connection established');
    });

    this.currentPool.on('error', (err: Error & { code?: string }) => {
      logger.error('[DBPoolManager] Pool error', { error: err });

      // Detect authentication failures (password rotation)
      if (
        err.code === '28P01' ||
        err.message?.toLowerCase().includes('password authentication failed')
      ) {
        logger.warn('[DBPoolManager] Authentication error detected - password may have been rotated');
        
        // Check if we have a Secrets Manager ARN available for refresh
        const hasSecretArn = 
          process.env.DB_CREDENTIALS_SECRET_ARN || 
          process.env.DB_CREDENTIALS?.startsWith('arn:aws:secretsmanager:');
        
        if (hasSecretArn) {
          logger.info('[DBPoolManager] Triggering automatic credential refresh');
          this.refreshCredentials().catch((refreshErr) => {
            logger.error('[DBPoolManager] Failed to refresh credentials', { error: refreshErr });
          });
        } else {
          logger.warn('[DBPoolManager] No Secrets Manager ARN configured - cannot auto-refresh');
          logger.warn('[DBPoolManager] ECS restart required to pick up new password');
        }
      }
    });
  }

  /**
   * Fetch fresh credentials from Secrets Manager and recreate pool
   */
  async refreshCredentials(): Promise<void> {
    if (this.isRefreshing) {
      logger.debug('[DBPoolManager] Credential refresh already in progress');
      return;
    }

    // Check DB_CREDENTIALS_SECRET_ARN first, then fall back to DB_CREDENTIALS if it's an ARN
    let secretArn = process.env.DB_CREDENTIALS_SECRET_ARN;
    if (!secretArn && process.env.DB_CREDENTIALS?.startsWith('arn:aws:secretsmanager:')) {
      secretArn = process.env.DB_CREDENTIALS;
      logger.info('[DBPoolManager]  Using DB_CREDENTIALS as secret ARN for refresh');
    }
    
    if (!secretArn) {
      logger.warn('[DBPoolManager] Cannot refresh - no Secrets Manager ARN configured');
      return;
    }

    const refreshStartTime = Date.now();
    
    try {
      this.isRefreshing = true;
      logger.info('[DBPoolManager] CREDENTIAL REFRESH STARTED');

      // Fetch fresh credentials from Secrets Manager
      logger.info('[DBPoolManager] Fetching fresh credentials from Secrets Manager');
      const newCredentials = await this.fetchCredentialsFromSecretsManager(secretArn);

      // Check if credentials actually changed
      const credentialsChanged =
        this.currentCredentials?.username !== newCredentials.username ||
        this.currentCredentials?.password !== newCredentials.password;

      if (credentialsChanged) {
        logger.info('[DBPoolManager] Credentials changed - recreating pool');

        await this.recreatePool(newCredentials);

        const refreshDuration = Date.now() - refreshStartTime;
        logger.info('[DBPoolManager] CREDENTIAL REFRESH COMPLETED', {
          refreshDurationMs: refreshDuration,
        });
      } else {
        logger.info('[DBPoolManager] Credentials unchanged - pool error may be transient');
      }
    } catch (error) {
      const refreshDuration = Date.now() - refreshStartTime;
      logger.error('[DBPoolManager] CREDENTIAL REFRESH FAILED', {
        error,
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

    try {
      logger.info('[DBPoolManager] Calling Secrets Manager', { secretArn });

      const command = new GetSecretValueCommand({ SecretId: secretArn });
      const response = await client.send(command);

      let secretString: string;
      
      // Support both SecretString and SecretBinary
      if (response.SecretString) {
        secretString = response.SecretString;
      } else if (response.SecretBinary) {
        // Decode binary secret to string
        const buffer = Buffer.from(response.SecretBinary);
        secretString = buffer.toString('utf-8');
      } else {
        throw new Error('Secret has neither SecretString nor SecretBinary');
      }

      const parsed = JSON.parse(secretString);
      
      if (!parsed.username || !parsed.password) {
        throw new Error('Secret must contain username and password fields');
      }

      logger.info('[DBPoolManager] Successfully fetched credentials from Secrets Manager', {
        hasUsername: !!parsed.username,
        hasPassword: !!parsed.password,
        hasHost: !!parsed.host,
      });

      return parsed;
    } finally {
      // Clean up client to prevent socket/file descriptor leaks
      client.destroy();
    }
  }

  /**
   * Recreate pool with new credentials
   */
  private async recreatePool(newCredentials: DbCredentials): Promise<void> {
    logger.info('[DBPoolManager] Recreating connection pool with new credentials');

    // Close existing pool
    if (this.currentPool) {
      logger.info('[DBPoolManager] Closing old connection pool');
      await this.currentPool.end();
      this.currentPool = null;
    }

    // Create new pool
    this.currentCredentials = newCredentials;
    const poolConfig = this.createPoolConfig(newCredentials);
    this.currentPool = new Pool(poolConfig);
    this.setupEventHandlers();

    logger.info('[DBPoolManager] New connection pool created successfully');
  }

  /**
   * Close database pool (graceful shutdown)
   */
  async closePool(): Promise<void> {
    if (this.currentPool) {
      logger.info('[DBPoolManager] Closing connection pool');
      await this.currentPool.end();
      this.currentPool = null;
      logger.info('[DBPoolManager] Connection pool closed');
    }
  }
}

// Singleton instance
const poolManager = new DatabasePoolManager();

export default poolManager;
