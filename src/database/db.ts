// Database Connection Pool Setup (aligned with backend patterns)
import { Pool, PoolConfig, PoolClient } from 'pg';
import { dbConfig, getDbSecretConfig } from '../config/config';
import getLogger from '../utils/loggerHelper';

const logger = getLogger(module);
const isLocal = process.env.NODE_ENV === 'local';

// Build SSL config
function buildSslConfig(): boolean | { require: boolean; rejectUnauthorized: boolean } {
  if (isLocal || dbConfig.sslMode === 'disable') return false;
  
  return {
    require: true,
    rejectUnauthorized: false,
  };
}

// Create pool configuration from config module
async function createPoolConfig(): Promise<PoolConfig> {
  // Fetch DB credentials from Secrets Manager if needed
  let user = dbConfig.user;
  let password = dbConfig.password;
  
  // If DB_CREDENTIALS is available, fetch credentials from Secrets Manager
  if (process.env.DB_CREDENTIALS) {
    try {
      const credentials = await getDbSecretConfig();
      user = credentials.username;
      password = credentials.password;
      logger.info('Database credentials loaded from AWS Secrets Manager');
    } catch (error) {
      logger.error('Failed to fetch DB credentials from Secrets Manager', { error });
      throw error;
    }
  }
  
  const poolConfig: PoolConfig = {
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user,
    password,
    max: dbConfig.poolMax,
    idleTimeoutMillis: dbConfig.idleTimeoutMs,
    connectionTimeoutMillis: dbConfig.connectionTimeoutMs,
    ssl: buildSslConfig(),
    keepAlive: true,
    query_timeout: dbConfig.queryTimeoutMs,
    application_name: dbConfig.applicationName,
  };

  // Validate required fields
  if (!poolConfig.host || !poolConfig.database) {
    const error = new Error("Database 'host' and 'database' must be provided via env vars.");
    logger.error('Database configuration validation failed', { error: error.message });
    throw error;
  }

  if (!poolConfig.password) {
    logger.warn('Database password is empty - this may cause connection failures');
  }

  logger.info('Database pool configuration initialized', {
    host: poolConfig.host,
    port: poolConfig.port,
    database: poolConfig.database,
    maxConnections: poolConfig.max,
    applicationName: poolConfig.application_name,
    ssl: !!poolConfig.ssl,
  });

  return poolConfig;
}

// Initialize pool asynchronously
let pool: Pool;
let poolInitPromise: Promise<Pool>;

function initializePool(): Promise<Pool> {
  if (!poolInitPromise) {
    poolInitPromise = createPoolConfig().then((config) => {
      pool = new Pool(config);
      
      // Database error interface
      interface DatabaseError extends Error {
        code?: string;
      }
      
      // Health status tracking
      interface PoolWithHealth extends Pool {
        _isHealthy?: boolean;
      }
      
      const poolWithHealth = pool as PoolWithHealth;
      poolWithHealth._isHealthy = true;
      
      // Handle pool errors
      pool.on('error', (err: Error, client: PoolClient) => {
        const dbError = err as DatabaseError;
        logger.error('Unexpected error on idle database client', {
          error: err.message,
          code: dbError.code,
          stack: err.stack,
        });
        
        // Mark pool as unhealthy for health checks
        poolWithHealth._isHealthy = false;
        
        // Attempt reconnection after a delay
        setTimeout(() => {
          logger.info('Attempting to reconnect database pool');
          poolWithHealth._isHealthy = true;
        }, 5000);
      });
      
      // Handle pool connection
      pool.on('connect', (client: PoolClient) => {
        logger.debug('New database client connected', {
          totalCount: pool.totalCount,
          idleCount: pool.idleCount,
          waitingCount: pool.waitingCount,
        });
      });
      
      return pool;
    });
  }
  
  return poolInitPromise;
}

// Export async getter for pool
export async function getPool(): Promise<Pool> {
  if (!pool) {
    await initializePool();
  }
  return pool;
}

/**
 * Gracefully close the database pool
 * Should be called during application shutdown
 */
export async function closePool(): Promise<void> {
  logger.info('Closing database pool');
  try {
    const currentPool = await getPool();
    await currentPool.end();
    logger.info('Database pool closed successfully');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Error closing database pool', { error: errorMessage });
    throw error;
  }
}

/**
 * Check database connectivity
 * Used for health checks
 */
export async function checkDatabaseConnectivity(): Promise<{ connected: boolean; latencyMs: number; error?: string }> {
  const startTime = Date.now();
  try {
    const currentPool = await getPool();
    await currentPool.query('SELECT 1');
    const latencyMs = Date.now() - startTime;
    return { connected: true, latencyMs };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { connected: false, latencyMs, error: errorMessage };
  }
}

// For backward compatibility, create a proxy object that looks like a Pool
// but initializes it lazily on first use
const dbProxy: any = {
  query: async (...args: any[]) => {
    const currentPool = await getPool();
    return (currentPool.query as any)(...args);
  },
  connect: async () => {
    const currentPool = await getPool();
    return currentPool.connect();
  },
  end: async () => closePool(),
  on: (event: any, listener: any) => {
    // This will be set up once pool is initialized
    initializePool().then((p) => (p as any).on(event, listener));
  },
  get totalCount() {
    return pool?.totalCount || 0;
  },
  get idleCount() {
    return pool?.idleCount || 0;
  },
  get waitingCount() {
    return pool?.waitingCount || 0;
  },
};

export default dbProxy;
