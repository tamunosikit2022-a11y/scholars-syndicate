import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ACCOUNT_STATUSES, LEVELS, ROLES } from '@scholars/shared';
import { userRoles, users } from '../src/db/schema';
import { createTestDb } from './helpers';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await db.delete(users); // roles go with them (cascade)
});

/** Runs a database action that should fail and returns the PostgreSQL error code. */
async function failureCode(action: Promise<unknown>): Promise<string | undefined> {
  try {
    await action;
  } catch (err) {
    const e = err as { code?: string; cause?: { code?: string } };
    return e.cause?.code ?? e.code;
  }
  return undefined; // it did NOT fail
}
const UNIQUE = '23505';
const CHECK = '23514';
const INVALID_ENUM = '22P02';

let counter = 0;
function newUser(overrides: Partial<typeof users.$inferInsert> = {}): typeof users.$inferInsert {
  counter += 1;
  return {
    googleSub: `google-${counter}`,
    email: `student${counter}@example.com`,
    fullName: 'Ada Student',
    ...overrides,
  };
}

async function enumLabels(typeName: string): Promise<string[]> {
  const r = await pool.query(
    `select e.enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = $1 order by e.enumsortorder`,
    [typeName],
  );
  return r.rows.map((row: { enumlabel: string }) => row.enumlabel);
}

describe('database matches the shared account vocabulary', () => {
  it('has exactly the roles, levels and statuses defined in @scholars/shared', async () => {
    expect(await enumLabels('user_role')).toEqual([...ROLES]);
    expect(await enumLabels('user_level')).toEqual([...LEVELS]);
    expect(await enumLabels('account_status')).toEqual([...ACCOUNT_STATUSES]);
  });
});

describe('users', () => {
  it('creates a user with safe defaults', async () => {
    const [u] = await db.insert(users).values(newUser()).returning();
    expect(u?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(u?.status).toBe('active');
    expect(u?.onboardingStage).toBe(0);
    expect(u?.emailVerified).toBe(false);
    expect(u?.createdAt).toBeInstanceOf(Date);
    expect(u?.displayName).toBeNull();
    expect(u?.dateOfBirth).toBeNull();
  });

  it('refuses two accounts for the same Google identity', async () => {
    await db.insert(users).values(newUser({ googleSub: 'same-person' }));
    expect(await failureCode(db.insert(users).values(newUser({ googleSub: 'same-person' })))).toBe(
      UNIQUE,
    );
  });

  it('refuses two accounts with the same email', async () => {
    await db.insert(users).values(newUser({ email: 'ada@example.com' }));
    expect(await failureCode(db.insert(users).values(newUser({ email: 'ada@example.com' })))).toBe(
      UNIQUE,
    );
  });

  it('refuses an email that is not lower-case (so Ada@x.com and ada@x.com can never be two people)', async () => {
    expect(await failureCode(db.insert(users).values(newUser({ email: 'Ada@Example.com' })))).toBe(
      CHECK,
    );
  });

  it('enforces display-name length (2 to 30 characters)', async () => {
    expect(await failureCode(db.insert(users).values(newUser({ displayName: 'A' })))).toBe(CHECK);
    expect(
      await failureCode(db.insert(users).values(newUser({ displayName: 'x'.repeat(31) }))),
    ).toBe(CHECK);
    expect(
      await failureCode(db.insert(users).values(newUser({ displayName: 'x'.repeat(30) }))),
    ).toBeUndefined();
    expect(
      await failureCode(db.insert(users).values(newUser({ displayName: 'Ab' }))),
    ).toBeUndefined();
  });

  it('keeps onboarding stage between 0 and 3', async () => {
    expect(await failureCode(db.insert(users).values(newUser({ onboardingStage: 4 })))).toBe(CHECK);
    expect(await failureCode(db.insert(users).values(newUser({ onboardingStage: -1 })))).toBe(
      CHECK,
    );
    expect(
      await failureCode(db.insert(users).values(newUser({ onboardingStage: 3 }))),
    ).toBeUndefined();
  });

  it('rejects an impossible date of birth', async () => {
    expect(await failureCode(db.insert(users).values(newUser({ dateOfBirth: '1850-01-01' })))).toBe(
      CHECK,
    );
    expect(
      await failureCode(db.insert(users).values(newUser({ dateOfBirth: '2008-05-17' }))),
    ).toBeUndefined();
  });

  it('only accepts known levels and statuses', async () => {
    await expect(
      pool.query(
        `insert into users (google_sub, email, full_name, level) values ('g','a@b.co','N','phd')`,
      ),
    ).rejects.toMatchObject({ code: INVALID_ENUM });
    await expect(
      pool.query(
        `insert into users (google_sub, email, full_name, status) values ('g2','c@d.co','N','banned')`,
      ),
    ).rejects.toMatchObject({ code: INVALID_ENUM });
  });

  it('refreshes updated_at when a row is changed through the app', async () => {
    const [u] = await db.insert(users).values(newUser()).returning();
    await new Promise((r) => setTimeout(r, 20));
    const [after] = await db
      .update(users)
      .set({ displayName: 'Ada' })
      .where(eq(users.id, u!.id))
      .returning();
    expect(after!.updatedAt.getTime()).toBeGreaterThan(u!.updatedAt.getTime());
  });
});

describe('user roles', () => {
  it('lets one person hold several roles', async () => {
    const [u] = await db.insert(users).values(newUser()).returning();
    await db.insert(userRoles).values([
      { userId: u!.id, role: 'student' },
      { userId: u!.id, role: 'mentor' },
    ]);
    const rows = await db.select().from(userRoles).where(eq(userRoles.userId, u!.id));
    expect(rows.map((r) => r.role).sort()).toEqual(['mentor', 'student']);
  });

  it('refuses the same role twice for one person', async () => {
    const [u] = await db.insert(users).values(newUser()).returning();
    await db.insert(userRoles).values({ userId: u!.id, role: 'student' });
    expect(await failureCode(db.insert(userRoles).values({ userId: u!.id, role: 'student' }))).toBe(
      UNIQUE,
    );
  });

  it('refuses an unknown role', async () => {
    const [u] = await db.insert(users).values(newUser()).returning();
    await expect(
      pool.query(`insert into user_roles (user_id, role) values ($1, 'superhero')`, [u!.id]),
    ).rejects.toMatchObject({ code: INVALID_ENUM });
  });

  it('refuses a role for a person who does not exist', async () => {
    const code = await failureCode(
      db
        .insert(userRoles)
        .values({ userId: '00000000-0000-4000-8000-000000000000', role: 'student' }),
    );
    expect(code).toBe('23503'); // foreign key violation
  });

  it('removes a person’s roles when the account is deleted', async () => {
    const [u] = await db.insert(users).values(newUser()).returning();
    await db.insert(userRoles).values({ userId: u!.id, role: 'student' });
    await db.delete(users).where(eq(users.id, u!.id));
    const left = await db.select().from(userRoles).where(eq(userRoles.userId, u!.id));
    expect(left).toHaveLength(0);
  });

  it('keeps the role but forgets the approver when the approving admin is deleted', async () => {
    const [admin] = await db.insert(users).values(newUser()).returning();
    const [teacher] = await db.insert(users).values(newUser()).returning();
    await db
      .insert(userRoles)
      .values({ userId: teacher!.id, role: 'teacher', grantedBy: admin!.id });
    await db.delete(users).where(eq(users.id, admin!.id));
    const [row] = await db
      .select()
      .from(userRoles)
      .where(and(eq(userRoles.userId, teacher!.id), eq(userRoles.role, 'teacher')));
    expect(row?.role).toBe('teacher');
    expect(row?.grantedBy).toBeNull();
  });
});
