import 'dotenv/config';
import { loadConfig } from '../config';
import { createDb } from './client';
import { databaseName, resetDatabase } from './reset';
import { runMigrations } from './migrate';

/**
 * Development helper: wipes the database and rebuilds it from the migration files.
 *   npm run db:reset -- --yes
 * Refuses to run in production, and refuses without --yes.
 */
async function main() {
  const config = loadConfig();
  if (config.NODE_ENV === 'production') {
    throw new Error('db:reset is disabled when NODE_ENV=production.');
  }
  if (!process.argv.includes('--yes')) {
    throw new Error(
      `This DELETES everything in "${databaseName(config.DATABASE_URL)}".\nRun again with --yes if you are sure.`,
    );
  }
  const { db, pool } = createDb(config.DATABASE_URL);
  try {
    await resetDatabase(pool);
    await runMigrations(db);
    console.log(`✅ "${databaseName(config.DATABASE_URL)}" wiped and rebuilt from migrations.`);
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error('❌', err instanceof Error ? err.message : err);
  process.exit(1);
});
