import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../src/db/migrate';
import { assertTestDatabase, resetDatabase } from '../src/db/reset';
import { appInfo } from '../src/db/schema';
import { createTestDb } from './helpers';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

async function tableExists(name: string) {
  const r = await pool.query('select to_regclass($1) as t', [`public.${name}`]);
  return r.rows[0].t !== null;
}

describe('database is rebuildable from code', () => {
  it('builds from completely empty using only the migration files', async () => {
    await resetDatabase(pool);
    expect(await tableExists('app_info')).toBe(false); // truly empty
    await runMigrations(db);
    expect(await tableExists('app_info')).toBe(true);
  });

  it('can run migrations again without errors (idempotent)', async () => {
    await expect(runMigrations(db)).resolves.toBeUndefined();
    await expect(runMigrations(db)).resolves.toBeUndefined();
  });

  it('can write and read data', async () => {
    await db.insert(appInfo).values({ key: 'hello', value: 'world' });
    const rows = await db.select().from(appInfo).where(eq(appInfo.key, 'hello'));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe('world');
  });
});

describe('wipe safety guard', () => {
  it('accepts *_test databases', () => {
    expect(() => assertTestDatabase('postgres://u:p@localhost:5432/scholars_test')).not.toThrow();
  });

  it('refuses any database not named *_test', () => {
    expect(() => assertTestDatabase('postgres://u:p@localhost:5432/scholars_dev')).toThrow(
      /must end in "_test"/,
    );
    expect(() => assertTestDatabase('postgres://u:p@localhost:5432/production')).toThrow();
  });
});
