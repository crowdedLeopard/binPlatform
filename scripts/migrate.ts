// Database migration script
// Run with: npm run db:migrate

import { readFileSync } from 'fs';
import { join } from 'path';
import { getDatabase, initDatabase } from '../src/storage/db/client.js';
import { logger } from '../src/observability/logger.js';

async function runMigrations() {
  logger.info('Running database migrations...');

  initDatabase({
    connectionString: process.env.DATABASE_URL || 'postgresql://binday:binday_dev_password@localhost:5432/binday',
    ssl: process.env.DATABASE_SSL === 'true'
  });

  const db = getDatabase();

  // Create migrations tracking table
  await db.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Get executed migrations
  const { rows: executedMigrations } = await db.query(
    'SELECT name FROM migrations ORDER BY id'
  );
  const executedNames = new Set(executedMigrations.map(row => row.name));

  // Run pending migrations
  const migrationFiles = ['001_initial.sql']; // Add more as needed

  for (const file of migrationFiles) {
    if (executedNames.has(file)) {
      logger.info({ migration: file }, 'Already executed, skipping');
      continue;
    }

    logger.info({ migration: file }, 'Executing migration');

    try {
      const migrationPath = join(process.cwd(), 'src', 'storage', 'db', 'migrations', file);
      const sql = readFileSync(migrationPath, 'utf-8');

      await db.query('BEGIN');
      await db.query(sql);
      await db.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
      await db.query('COMMIT');

      logger.info({ migration: file }, 'Migration executed successfully');
    } catch (err) {
      await db.query('ROLLBACK');
      logger.error({ err, migration: file }, 'Migration failed');
      throw err;
    }
  }

  await db.end();
  logger.info('All migrations completed');
}

runMigrations().catch((err) => {
  logger.error({ err }, 'Migration process failed');
  process.exit(1);
});
