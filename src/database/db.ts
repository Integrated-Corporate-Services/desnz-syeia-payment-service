// Database Connection Pool Setup (aligned with backend patterns)
import { Pool, PoolConfig, PoolClient } from 'pg';
import { dbConfig } from '../config/config';
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
function createPoolConfig(): PoolConfig {
  const poolConfig: PoolConfig = {
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
    password: dbConfig.password,
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

const pool = new Pool(createPoolConfig());

// Health status tracking
interface PoolWithHealth extends Pool {
  _isHealthy?: boolean;
}

const poolWithHealth = pool as PoolWithHealth;
poolWithHealth._isHealthy = true;

// Handle pool errors
pool.on('error', (err: Error, client: PoolClient) => {
  logger.error('Unexpected error on idle database client', {
    error: err.message,
    code: (err as any).code,
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

// Handle pool removal
pool.on('remove', (client: PoolClient) => {
  logger.debug('Database client removed from pool', {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing database pool');
  try {
    await pool.end();
    logger.info('Database pool closed successfully');
  } catch (error: any) {
    logger.error('Error closing database pool', { error: error.message });
  }
});

export default pool;
