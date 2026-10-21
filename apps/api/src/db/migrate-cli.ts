import 'dotenv/config';
import { loadConfig } from '../config';
import { createDb } from './client';
import { runMigrations } from './migrate';

async function main() {
  const config = loadConfig();
  const { db, pool } = createDb(config.DATABASE_URL);
  try {
    await runMigrations(db);
    console.log('✅ Database is up to date.');
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error('❌ Migration failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
