import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Db } from './client';

/** Folder with the generated .sql migrations. npm scripts run inside apps/api, so cwd works. */
export function migrationsFolder(): string {
  return process.env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), 'drizzle');
}

/** Applies every pending migration. Safe to run again and again. */
export async function runMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: migrationsFolder() });
}
