import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CURRENT_TERMS_VERSION,
  meResponseSchema,
  validationFailedResponseSchema,
} from '@scholars/shared';
import { createApp } from '../src/app';
import { createSession } from '../src/auth/sessions';
import { userRoles, users } from '../src/db/schema';
import { createTestDb } from './helpers';

const ORIGIN = 'http://localhost:5173';
const NOW = new Date('2026-11-10T09:00:00.000Z');
const { db, pool } = createTestDb();
const app = createApp({ db, corsOrigin: ORIGIN, version: 'test', clock: () => NOW });

beforeEach(async () => {
  await db.delete(users);
});
afterAll(async () => {
  await pool.end();
});

let n = 0;
/** A signed-in student with a real session cookie, straight from the database (no Google needed). */
async function signedInStudent() {
  n += 1;
  const [user] = await db
    .insert(users)
    .values({ googleSub: `onb-${n}`, email: `onb${n}@example.com`, fullName: 'Ada Student' })
    .returning();
  await db.insert(userRoles).values({ userId: user!.id, role: 'student' });
  const { token } = await createSession(db, user!.id, 'test', NOW);
  const cookie = `ss_session=${token}`;
  const put = (body: unknown) =>
    request(app)
      .put('/api/me/essentials')
      .set('Cookie', cookie)
      .send(body as object);
  const row = async () => (await db.select().from(users).where(eq(users.id, user!.id)))[0]!;
  return { user: user!, cookie, put, row };
}

const adult = {
  displayName: ' Ada  O. ',
  dateOfBirth: '2000-05-17',
  level: 'jamb_candidate',
  acceptTerms: true,
  termsVersion: CURRENT_TERMS_VERSION,
};

describe('PUT /api/me/essentials', () => {
  it('needs a signed-in person', async () => {
    const res = await request(app).put('/api/me/essentials').send(adult);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'not_signed_in' });
  });

  it('rejects a malformed body without touching anything', async () => {
    const s = await signedInStudent();
    for (const body of [{}, { displayName: 5 }, { ...adult, acceptTerms: 'yes' }, 'text']) {
      const res = await s.put(body);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'invalid_request' });
    }
    expect((await s.row()).onboardingStage).toBe(0);
  });

  it('saves an adult’s essentials and moves them to stage 1', async () => {
    const s = await signedInStudent();
    const res = await s.put(adult);
    expect(res.status).toBe(200);
    const body = meResponseSchema.parse(res.body);
    expect(body.user.displayName).toBe('Ada O.');
    expect(body.user.level).toBe('jamb_candidate');
    expect(body.user.onboardingStage).toBe(1);
    expect(JSON.stringify(res.body)).not.toMatch(/dateOfBirth|2000-05-17/); // never sent back

    const row = await s.row();
    expect(row.displayName).toBe('Ada O.');
    expect(row.dateOfBirth).toBe('2000-05-17');
    expect(row.termsVersion).toBe(CURRENT_TERMS_VERSION);
    expect(row.termsAcceptedAt?.toISOString()).toBe(NOW.toISOString());
    expect(row.guardianConsentAt).toBeNull();
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('shows the new stage afterwards on /api/auth/me', async () => {
    const s = await signedInStudent();
    await s.put(adult);
    const me = await request(app).get('/api/auth/me').set('Cookie', s.cookie);
    expect(meResponseSchema.parse(me.body).user.onboardingStage).toBe(1);
  });

  it('asks an under-18 student for guardian permission and records when it was given', async () => {
    const s = await signedInStudent();
    const minor = { ...adult, dateOfBirth: '2010-01-01' }; // 16

    const refused = await s.put(minor);
    expect(refused.status).toBe(422);
    expect(validationFailedResponseSchema.parse(refused.body).fields).toEqual({
      guardianConsent: 'required',
    });
    expect((await s.row()).onboardingStage).toBe(0); // nothing was saved

    const ok = await s.put({ ...minor, guardianConsent: true });
    expect(ok.status).toBe(200);
    expect((await s.row()).guardianConsentAt?.toISOString()).toBe(NOW.toISOString());
  });

  it('treats the 18th birthday exactly: adult today, minor the day before', async () => {
    const today = await signedInStudent();
    expect((await today.put({ ...adult, dateOfBirth: '2008-11-10' })).status).toBe(200);
    expect((await today.row()).guardianConsentAt).toBeNull();

    const eve = await signedInStudent();
    const res = await eve.put({ ...adult, dateOfBirth: '2008-11-11' });
    expect(res.status).toBe(422);
    expect(res.body.fields).toEqual({ guardianConsent: 'required' });
  });

  it('refuses impossible ages and dates, naming the field', async () => {
    const s = await signedInStudent();
    const cases: Array<[string, string]> = [
      ['2016-11-11', 'too_young'],
      ['1900-01-01', 'too_old'],
      ['2027-01-01', 'future'],
      ['2000-02-30', 'invalid'],
      ['', 'required'],
    ];
    for (const [dateOfBirth, code] of cases) {
      const res = await s.put({ ...adult, dateOfBirth });
      expect(res.status, dateOfBirth).toBe(422);
      expect(res.body.fields.dateOfBirth, dateOfBirth).toBe(code);
    }
  });

  it('refuses bad names, levels and terms, all at once', async () => {
    const s = await signedInStudent();
    const res = await s.put({
      displayName: 'Admin',
      dateOfBirth: '2000-05-17',
      level: 'wizard',
      acceptTerms: false,
      termsVersion: CURRENT_TERMS_VERSION,
    });
    expect(res.status).toBe(422);
    expect(res.body.fields).toEqual({
      displayName: 'reserved',
      level: 'required',
      terms: 'required',
    });
    const outdated = await s.put({ ...adult, termsVersion: 'an-old-version' });
    expect(outdated.body.fields).toEqual({ terms: 'outdated' });
  });

  it('locks the date of birth once it is set', async () => {
    const s = await signedInStudent();
    await s.put(adult);
    const sneaky = await s.put({ ...adult, dateOfBirth: '1990-01-01' });
    expect(sneaky.status).toBe(409);
    expect(sneaky.body).toEqual({ error: 'date_of_birth_locked' });
    expect((await s.row()).dateOfBirth).toBe('2000-05-17');
  });

  it('lets the same person edit their name and level later without losing history', async () => {
    const s = await signedInStudent();
    await s.put(adult);
    const before = await s.row();
    const res = await s.put({ ...adult, displayName: 'Dee', level: 'university_student' });
    expect(res.status).toBe(200);
    const after = await s.row();
    expect(after.displayName).toBe('Dee');
    expect(after.level).toBe('university_student');
    expect(after.onboardingStage).toBe(1); // never goes backwards
    expect(after.termsAcceptedAt?.toISOString()).toBe(before.termsAcceptedAt?.toISOString()); // not overwritten
  });

  it('does not lower onboarding progress when essentials are saved again', async () => {
    const s = await signedInStudent();
    await s.put(adult);
    await db.update(users).set({ onboardingStage: 3 }).where(eq(users.id, s.user.id));

    const res = await s.put({ ...adult, displayName: 'Ada Updated' });
    expect(res.status).toBe(200);
    expect(res.body.user.onboardingStage).toBe(3);
    expect((await s.row()).onboardingStage).toBe(3);
  });

  it('is refused when it comes from another website', async () => {
    const s = await signedInStudent();
    const res = await request(app)
      .put('/api/me/essentials')
      .set('Origin', 'https://evil.example')
      .set('Cookie', s.cookie)
      .send(adult);
    expect(res.status).toBe(403);
    expect((await s.row()).onboardingStage).toBe(0);
  });

  it('stops working when the account is suspended', async () => {
    const s = await signedInStudent();
    await db.update(users).set({ status: 'suspended' }).where(eq(users.id, s.user.id));
    expect((await s.put(adult)).status).toBe(401);
  });
});
