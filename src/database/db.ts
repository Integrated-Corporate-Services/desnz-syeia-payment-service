// Database Connection Pool with Automatic Password Rotation
import { Pool, PoolClient } from 'pg';
import poolManager from './dbPoolManager';
import getLogger from '../utils/loggerHelper';

const logger = getLogger(module);

// Export async getter for pool
export async function getPool(): Promise<Pool> {
  return await poolManager.getPool();
}

/**
 * Gracefully close the database pool
 * Should be called during application shutdown
 */
export async function closePool(): Promise<void> {
  logger.info('Closing database pool');
  try {
    await poolManager.closePool();
    logger.info('Database pool closed successfully');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Error closing database pool', { error: errorMessage });
    throw error;
  }
}

export async function getClient(): Promise<PoolClient> {
  const currentPool = await getPool();
  return currentPool.connect();
}

export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');
    logger.debug('[DB] Transaction started');
    
    const result = await callback(client);
    
    await client.query('COMMIT');
    logger.debug('[DB] Transaction committed');
    
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('[DB] Transaction rolled back', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    client.release();
    logger.debug('[DB] Database client released');
  }
}

export async function withTransactionIsolation<T>(
  isolationLevel: 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE',
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');
    await client.query(`SET TRANSACTION ISOLATION LEVEL ${isolationLevel}`);
    logger.debug('[DB] Transaction started with isolation level', { isolationLevel });
    
    const result = await callback(client);
    
    await client.query('COMMIT');
    logger.debug('[DB] Transaction committed');
    
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('[DB] Transaction rolled back', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    client.release();
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
  getClient: async () => getClient(),
  withTransaction: <T>(callback: (client: PoolClient) => Promise<T>) => withTransaction(callback),
  withTransactionIsolation: <T>(
    isolationLevel: 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE',
    callback: (client: PoolClient) => Promise<T>
  ) => withTransactionIsolation(isolationLevel, callback),
  end: async () => closePool(),
  on: (event: any, listener: any) => {
    // This will be set up once pool is initialized
    getPool()
      .then((p) => (p as any).on(event, listener))
      .catch((error) => {
        logger.error('[DB] Failed to attach event listener', {
          event,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  },
  get totalCount() {
    // Pool stats require async access - return 0 for backward compatibility
    return 0;
  },
  get idleCount() {
    // Pool stats require async access - return 0 for backward compatibility
    return 0;
  },
  get waitingCount() {
    // Pool stats require async access - return 0 for backward compatibility
    return 0;
  },
};

export default dbProxy;
