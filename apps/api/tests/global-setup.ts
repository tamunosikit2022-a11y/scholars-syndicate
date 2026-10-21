import { runMigrations } from '../src/db/migrate';
import { resetDatabase } from '../src/db/reset';
import { createTestDb } from './helpers';

/** Runs once before all tests: wipe the test database and rebuild it from the migrations. */
export default async function setup() {
  const { db, pool } = createTestDb();
  try {
    await resetDatabase(pool);
    await runMigrations(db);
  } finally {
    await pool.end();
  }
}
