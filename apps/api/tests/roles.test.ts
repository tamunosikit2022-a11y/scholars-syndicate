import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Role } from '@scholars/shared';
import { createApp } from '../src/app';
import { grantRole } from '../src/auth/roles';
import { createSession } from '../src/auth/sessions';
import { userRoles, users } from '../src/db/schema';
import { createTestDb } from './helpers';

const ORIGIN = 'http://localhost:5173';
const NOW = new Date('2026-11-16T09:00:00.000Z');
const { db, pool } = createTestDb();
const app = createApp({ db, corsOrigin: ORIGIN, version: 'test', clock: () => NOW });

beforeEach(async () => {
  await db.delete(users);
});
afterAll(async () => {
  await pool.end();
});

let n = 0;
async function signedInAs(...roles: Role[]) {
  n += 1;
  const [user] = await db
    .insert(users)
    .values({
      googleSub: `roles-${n}`,
      email: `roles${n}@example.com`,
      fullName: 'Test Person',
      onboardingStage: 1,
    })
    .returning();
  if (roles.length > 0) {
    await db.insert(userRoles).values(roles.map((role) => ({ userId: user!.id, role })));
  }
  const { token } = await createSession(db, user!.id, 'test', NOW);
  return { user: user!, cookie: `ss_session=${token}` };
}

describe('teacher area', () => {
  it('turns away someone who is signed out', async () => {
    const res = await request(app).get('/api/teacher/ping');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'not_signed_in' });
  });

  it('turns away a student', async () => {
    const { cookie } = await signedInAs('student');
    const res = await request(app).get('/api/teacher/ping').set('Cookie', cookie);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'role_required' });
  });

  it('lets a teacher in', async () => {
    const { cookie } = await signedInAs('teacher');
    const res = await request(app).get('/api/teacher/ping').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, area: 'teacher' });
  });

  it('lets an admin in', async () => {
    const { cookie } = await signedInAs('admin');
    const res = await request(app).get('/api/teacher/ping').set('Cookie', cookie);
    expect(res.status).toBe(200);
  });
});

describe('admin area', () => {
  it('turns away someone who is signed out', async () => {
    const res = await request(app).get('/api/admin/ping');
    expect(res.status).toBe(401);
  });

  it('turns away a student', async () => {
    const { cookie } = await signedInAs('student');
    const res = await request(app).get('/api/admin/ping').set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('turns away a teacher', async () => {
    const { cookie } = await signedInAs('teacher');
    const res = await request(app).get('/api/admin/ping').set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('lets an admin in', async () => {
    const { cookie } = await signedInAs('admin');
    const res = await request(app).get('/api/admin/ping').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, area: 'admin' });
  });
});

describe('roles cannot be self-assigned', () => {
  it('ignores role fields sent to the signed-in student endpoints', async () => {
    const { user, cookie } = await signedInAs('student');
    await request(app)
      .put('/api/me/journey')
      .set('Cookie', cookie)
      .send({ roles: ['admin'], role: 'admin' });

    const rows = await db.select().from(userRoles).where(eq(userRoles.userId, user.id));
    expect(rows.map((row) => row.role)).toEqual(['student']);
    const res = await request(app).get('/api/admin/ping').set('Cookie', cookie);
    expect(res.status).toBe(403);
  });
});

describe('grantRole', () => {
  it('gives an existing account the role once', async () => {
    const { user } = await signedInAs('student');
    expect(await grantRole(db, user.email.toUpperCase(), 'teacher')).toEqual({
      ok: true,
      alreadyHeld: false,
    });
    expect(await grantRole(db, user.email, 'teacher')).toEqual({ ok: true, alreadyHeld: true });
    const rows = await db.select().from(userRoles).where(eq(userRoles.userId, user.id));
    expect(rows.map((row) => row.role).sort()).toEqual(['student', 'teacher']);
  });

  it('reports an email with no account', async () => {
    expect(await grantRole(db, 'nobody@example.com', 'teacher')).toEqual({
      ok: false,
      reason: 'user_not_found',
    });
  });
});
