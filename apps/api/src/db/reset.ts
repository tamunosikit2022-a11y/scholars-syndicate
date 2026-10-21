import type pg from 'pg';

/** Name of the database inside a connection string, e.g. "scholars_test". */
export function databaseName(connectionString: string): string {
  const name = new URL(connectionString).pathname.replace(/^\//, '');
  if (!name) throw new Error('DATABASE_URL has no database name');
  return name;
}

/** Tests wipe their database, so refuse anything that is not clearly a test database. */
export function assertTestDatabase(connectionString: string): void {
  const name = databaseName(connectionString);
  if (!name.endsWith('_test')) {
    throw new Error(`Refusing to wipe "${name}": a test database name must end in "_test".`);
  }
}

/**
 * Deletes EVERYTHING in the database (tables, data, migration history).
 * Callers must be sure — see assertTestDatabase and reset-cli.ts for the guards.
 */
export async function resetDatabase(pool: pg.Pool): Promise<void> {
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await pool.query('DROP SCHEMA IF EXISTS drizzle CASCADE');
  await pool.query('CREATE SCHEMA public');
}
