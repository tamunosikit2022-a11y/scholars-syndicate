import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export interface DbOptions {
  connectionTimeoutMillis?: number;
  max?: number;
}

export function createDb(connectionString: string, options: DbOptions = {}) {
  const pool = new pg.Pool({
    connectionString,
    max: options.max ?? 10,
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 5000,
  });
  // An idle client erroring must not crash the process.
  pool.on('error', (err) => console.error('Unexpected database pool error:', err.message));
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export type Db = ReturnType<typeof createDb>['db'];
