import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  accountExportSchema,
  CURRENT_TERMS_VERSION,
  journeyResponseSchema,
  meResponseSchema,
} from '@scholars/shared';
import { createApp } from '../src/app';
import { createSession } from '../src/auth/sessions';
import { studentJourney, userRoles, users } from '../src/db/schema';
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
async function signedInWithRole(role: 'student' | 'parent', onboardingStage = 1) {
  n += 1;
  const [user] = await db
    .insert(users)
    .values({
      googleSub: `journey-${n}`,
      email: `journey${n}@example.com`,
      fullName: 'Ada Student',
      displayName: onboardingStage > 0 ? 'Ada Student' : null,
      dateOfBirth: onboardingStage > 0 ? '2000-05-17' : null,
      level: onboardingStage > 0 ? 'jamb_candidate' : null,
      termsAcceptedAt: onboardingStage > 0 ? NOW : null,
      termsVersion: onboardingStage > 0 ? CURRENT_TERMS_VERSION : null,
      onboardingStage,
    })
    .returning();
  await db.insert(userRoles).values({ userId: user!.id, role });
  const { token } = await createSession(db, user!.id, 'test', NOW);
  return { user: user!, cookie: `ss_session=${token}` };
}

const signedInStudent = (onboardingStage = 1) => signedInWithRole('student', onboardingStage);

const plan = {
  state: 'Lagos',
  schoolName: 'Unity Secondary School',
  exams: [
    { type: 'jamb', date: '2027-04-15' },
    { type: 'waec', date: null },
  ],
  subjects: ['English Language', 'Mathematics', 'Biology', 'Chemistry'],
  courseInterest: 'Medicine',
  universityInterests: ['University A', 'University B'],
  dailyStudyGoalMinutes: 90,
  preferredStudyTime: 'evening',
  qualityLevel: 'standard',
};

describe('/api/me/journey', () => {
  it('refuses authenticated non-students from student onboarding endpoints', async () => {
    const parent = await signedInWithRole('parent');
    const responses = await Promise.all([
      request(app).get('/api/me/journey').set('Cookie', parent.cookie),
      request(app).put('/api/me/journey').set('Cookie', parent.cookie).send(plan),
      request(app).post('/api/me/journey/complete').set('Cookie', parent.cookie),
      request(app).put('/api/me/essentials').set('Cookie', parent.cookie).send({}),
    ]);
    for (const res of responses) {
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'role_required' });
    }
  });

  it('requires a signed-in student who completed Stage 1', async () => {
    expect((await request(app).get('/api/me/journey')).status).toBe(401);
    const fresh = await signedInStudent(0);
    const res = await request(app).put('/api/me/journey').set('Cookie', fresh.cookie).send(plan);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'onboarding_not_ready' });
  });

  it('returns private defaults without creating a profile row', async () => {
    const student = await signedInStudent();
    const res = await request(app).get('/api/me/journey').set('Cookie', student.cookie);
    expect(res.status).toBe(200);
    expect(journeyResponseSchema.parse(res.body).journey).toEqual({
      state: null,
      schoolName: null,
      exams: [],
      subjects: [],
      courseInterest: null,
      universityInterests: [],
      dailyStudyGoalMinutes: null,
      preferredStudyTime: null,
      qualityLevel: 'high',
      completedAt: null,
    });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(await db.select().from(studentJourney)).toHaveLength(0);
  });

  it('saves preferences and merges later screen saves without overwriting earlier answers', async () => {
    const student = await signedInStudent();
    const first = await request(app)
      .put('/api/me/journey')
      .set('Cookie', student.cookie)
      .send({ state: plan.state, schoolName: plan.schoolName, exams: plan.exams });
    expect(first.status).toBe(200);

    const second = await request(app)
      .put('/api/me/journey')
      .set('Cookie', student.cookie)
      .send({ subjects: plan.subjects, qualityLevel: plan.qualityLevel });
    expect(second.status).toBe(200);
    const saved = journeyResponseSchema.parse(second.body).journey;
    expect(saved.state).toBe(plan.state);
    expect(saved.schoolName).toBe(plan.schoolName);
    expect(saved.exams).toEqual(plan.exams);
    expect(saved.subjects).toEqual(plan.subjects);
    expect(saved.qualityLevel).toBe('standard');
    expect(saved.courseInterest).toBeNull();
  });

  it('trims free text, allows clearing optional fields, and rejects unsafe values', async () => {
    const student = await signedInStudent();
    const trimmed = await request(app)
      .put('/api/me/journey')
      .set('Cookie', student.cookie)
      .send({ state: '  Lagos  ', courseInterest: '  Medicine  ' });
    expect(trimmed.body.journey.state).toBe('Lagos');
    expect(trimmed.body.journey.courseInterest).toBe('Medicine');

    const cleared = await request(app)
      .put('/api/me/journey')
      .set('Cookie', student.cookie)
      .send({ state: '', courseInterest: null });
    expect(cleared.body.journey.state).toBeNull();
    expect(cleared.body.journey.courseInterest).toBeNull();

    for (const invalid of [
      { exams: [{ type: 'sat', date: null }] },
      { exams: [{ type: 'jamb', date: '2027-02-30' }] },
      {
        exams: [
          { type: 'jamb', date: null },
          { type: 'jamb', date: null },
        ],
      },
      { subjects: ['Mathematics', ' mathematics '] },
      { universityInterests: ['University A', 'university a'] },
      { universityInterests: ['A', 'B', 'C', 'D'] },
      { dailyStudyGoalMinutes: 0 },
      { qualityLevel: 'unlimited' },
      { unexpected: true },
    ]) {
      const res = await request(app)
        .put('/api/me/journey')
        .set('Cookie', student.cookie)
        .send(invalid);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'invalid_request' });
    }
    expect((await db.select().from(studentJourney)).length).toBe(1);
  });

  it('keeps each student’s preferences isolated', async () => {
    const first = await signedInStudent();
    const second = await signedInStudent();
    await request(app)
      .put('/api/me/journey')
      .set('Cookie', first.cookie)
      .send({ schoolName: plan.schoolName });

    const res = await request(app).get('/api/me/journey').set('Cookie', second.cookie);
    expect(res.body.journey.schoolName).toBeNull();
    expect(
      await db.select().from(studentJourney).where(eq(studentJourney.userId, second.user.id)),
    ).toHaveLength(0);
  });

  it('allows Stage 2 to be skipped and advances onboarding without changing essentials', async () => {
    const student = await signedInStudent();
    const res = await request(app).post('/api/me/journey/complete').set('Cookie', student.cookie);
    expect(res.status).toBe(200);
    expect(res.body.journey.completedAt).toBe(NOW.toISOString());
    expect(res.body.journey.qualityLevel).toBe('high');

    const refreshed = await request(app).get('/api/auth/me').set('Cookie', student.cookie);
    expect(meResponseSchema.parse(refreshed.body).user.onboardingStage).toBe(2);
    const [user] = await db.select().from(users).where(eq(users.id, student.user.id));
    expect(user?.dateOfBirth).toBe('2000-05-17');
    expect(user?.termsVersion).toBe(CURRENT_TERMS_VERSION);
  });

  it('does not lower onboarding progress when Stage 2 is completed again', async () => {
    const student = await signedInStudent();
    await db.update(users).set({ onboardingStage: 3 }).where(eq(users.id, student.user.id));

    const res = await request(app).post('/api/me/journey/complete').set('Cookie', student.cookie);
    expect(res.status).toBe(200);
    const [user] = await db.select().from(users).where(eq(users.id, student.user.id));
    expect(user?.onboardingStage).toBe(3);
  });

  it('refuses requests from another website', async () => {
    const student = await signedInStudent();
    const res = await request(app)
      .put('/api/me/journey')
      .set('Origin', 'https://evil.example')
      .set('Cookie', student.cookie)
      .send(plan);
    expect(res.status).toBe(403);
    expect(await db.select().from(studentJourney)).toHaveLength(0);
  });
});

describe('GET /api/me/export', () => {
  it('requires sign-in and exports the signed-in person’s data without auth secrets', async () => {
    const res = await request(app).get('/api/me/export');
    expect(res.status).toBe(401);

    const student = await signedInStudent();
    await request(app)
      .put('/api/me/journey')
      .set('Cookie', student.cookie)
      .send({ state: 'Lagos', courseInterest: 'Medicine' });
    const exported = await request(app).get('/api/me/export').set('Cookie', student.cookie);
    expect(exported.status).toBe(200);
    expect(exported.headers['cache-control']).toBe('no-store');
    expect(exported.headers['content-disposition']).toBe(
      'attachment; filename="scholars-syndicate-data.json"',
    );
    const body = accountExportSchema.parse(exported.body);
    expect(body.account.id).toBe(student.user.id);
    expect(body.account.dateOfBirth).toBe('2000-05-17');
    expect(body.account.termsVersion).toBe(CURRENT_TERMS_VERSION);
    expect(body.journey?.state).toBe('Lagos');
    expect(body.journey?.courseInterest).toBe('Medicine');
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0]?.userAgent).toBe('test');
    expect(JSON.stringify(exported.body)).not.toMatch(/googleSub|tokenHash|token_hash|sessionId/);
  });

  it('lets a parent export their own account data without exposing student data', async () => {
    const parent = await signedInWithRole('parent');
    const res = await request(app).get('/api/me/export').set('Cookie', parent.cookie);
    expect(res.status).toBe(200);
    const body = accountExportSchema.parse(res.body);
    expect(body.account.roles).toEqual(['parent']);
    expect(body.journey).toBeNull();
  });
});
