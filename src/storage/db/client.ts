// TODO: PostgreSQL database client
// Using pg or drizzle-orm for database access
// Connection pooling, health checks, migrations

import pg from 'pg';
import { logger } from '../../observability/logger.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export interface DatabaseConfig {
  connectionString: string;
  ssl: boolean;
  poolMin?: number;
  poolMax?: number;
}

export function initDatabase(config: DatabaseConfig): void {
  const { connectionString, ssl, poolMin = 2, poolMax = 10 } = config;

  pool = new Pool({
    connectionString,
    ssl: ssl ? { rejectUnauthorized: true } : false,
    min: poolMin,
    max: poolMax,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });

  pool.on('error', (err) => {
    logger.error({ err }, 'Unexpected database error');
  });

  logger.info('Database pool initialized');
}

export function getDatabase(): pg.Pool {
  if (!pool) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return pool;
}

export async function healthCheck(): Promise<boolean> {
  if (!pool) return false;

  try {
    const result = await pool.query('SELECT 1 as health');
    return result.rows[0]?.health === 1;
  } catch (err) {
    logger.error({ err }, 'Database health check failed');
    return false;
  }
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database pool closed');
  }
}
