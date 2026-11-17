import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  DELETION_GRACE_DAYS,
  deleteAccountResponseSchema,
  signInResponseSchema,
} from '@scholars/shared';
import { createApp } from '../src/app';
import { hashGoogleSub, type GoogleIdentity } from '../src/auth/accounts';
import { ADMIN_DELETION_LOCK, purgeDueDeletions } from '../src/auth/deletion';
import { GoogleTokenError, type GoogleTokenVerifier } from '../src/auth/google';
import {
  blockedIdentities,
  questionPacks,
  questionRevisions,
  questions,
  sessions,
  studentJourney,
  userRoles,
  users,
} from '../src/db/schema';
import { createTestDb } from './helpers';

const ORIGIN = 'http://localhost:5173';
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const START = new Date('2026-11-01T10:00:00.000Z');

function person(name: string, sub = `google-sub-${name}`): GoogleIdentity {
  return {
    sub,
    email: `${name}@gmail.com`,
    emailVerified: true,
    name: `${name} Person`,
    picture: null,
  };
}
const ADA = 'fake-google-token-for-ada-0001';
const BOLA = 'fake-google-token-for-bola-0002';
const CHIDI = 'fake-google-token-for-chidi-003';
const identities: Record<string, GoogleIdentity> = {
  [ADA]: person('ada'),
  [BOLA]: person('bola'),
  [CHIDI]: person('chidi'),
};
const verify: GoogleTokenVerifier = async (idToken) => {
  const identity = identities[idToken];
  if (!identity) throw new GoogleTokenError('Google rejected the token');
  return identity;
};

let now = START;
const { db, pool } = createTestDb();
const app = createApp({
  db,
  corsOrigin: ORIGIN,
  version: 'test',
  verifyGoogleToken: verify,
  clock: () => now,
  authRateLimit: { windowMs: 60_000, limit: 1000 },
});

beforeEach(async () => {
  now = START;
  await db.delete(users);
  await db.delete(questionPacks);
  await db.delete(blockedIdentities);
});
afterAll(async () => {
  // The test database is shared with the other test files: leave nothing behind.
  await db.delete(users);
  await db.delete(blockedIdentities);
  await pool.end();
});

function tokenFrom(res: request.Response): string {
  const header = res.headers['set-cookie'];
  const list = Array.isArray(header) ? header : header ? [header] : [];
  const match = list[0]?.match(/^ss_session=([^;]+)/);
  if (!match?.[1]) throw new Error('no session cookie in response');
  return decodeURIComponent(match[1]);
}
const signIn = (idToken: string) => request(app).post('/api/auth/google').send({ idToken });
const signedIn = async (idToken: string) => tokenFrom(await signIn(idToken));
const asking = (token: string, body: unknown) =>
  request(app)
    .post('/api/me/delete')
    .set('Cookie', `ss_session=${token}`)
    .send(body as object);
const whoAmI = (token: string) =>
  request(app).get('/api/auth/me').set('Cookie', `ss_session=${token}`);
const rowOf = async (email: string) =>
  (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
async function makeAdmin(email: string) {
  const row = await rowOf(email);
  await db.insert(userRoles).values({ userId: row!.id, role: 'admin' });
}

describe('POST /api/me/delete — asking for deletion', () => {
  it('requires a signed-in person', async () => {
    const res = await request(app).post('/api/me/delete').send({ confirmation: 'DELETE' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'not_signed_in' });
  });

  it('rejects a malformed request', async () => {
    const token = await signedIn(ADA);
    for (const body of [
      {},
      { confirmation: '' },
      { confirmation: 5 },
      { confirmation: 'x'.repeat(400) },
    ]) {
      const res = await asking(token, body);
      expect(res.status, JSON.stringify(body).slice(0, 40)).toBe(400);
      expect(res.body).toEqual({ error: 'invalid_request' });
    }
    expect((await rowOf('ada@gmail.com'))?.deletionRequestedAt).toBeNull();
  });

  it('refuses a wrong confirmation and changes nothing', async () => {
    const token = await signedIn(ADA);
    for (const confirmation of ['delete', 'yes', 'bola@gmail.com', ' ']) {
      const res = await asking(token, { confirmation });
      expect(res.status, confirmation).toBe(422);
      expect(res.body).toEqual({ error: 'confirmation_incorrect' });
    }
    expect((await rowOf('ada@gmail.com'))?.deletionRequestedAt).toBeNull();
    expect((await whoAmI(token)).status).toBe(200); // still signed in
  });

  it('locks the account, signs out every device and clears the cookie', async () => {
    const phone = await signedIn(ADA);
    const laptop = await signedIn(ADA);
    const bola = await signedIn(BOLA);

    now = new Date(START.getTime() + 2 * MINUTE);
    const res = await asking(phone, { confirmation: 'DELETE' });
    expect(res.status).toBe(202);
    const body = deleteAccountResponseSchema.parse(res.body);
    expect(body.requestedAt).toBe(now.toISOString());
    expect(body.scheduledFor).toBe(
      new Date(now.getTime() + DELETION_GRACE_DAYS * DAY).toISOString(),
    );
    expect(String(res.headers['set-cookie'])).toMatch(/ss_session=;/);
    expect(res.headers['cache-control']).toBe('no-store');

    // Nothing is erased yet: the account waits out the grace period.
    expect((await rowOf('ada@gmail.com'))?.deletionRequestedAt?.toISOString()).toBe(
      now.toISOString(),
    );
    expect((await whoAmI(phone)).status).toBe(401);
    expect((await whoAmI(laptop)).status).toBe(401);
    expect((await whoAmI(bola)).status).toBe(200); // someone else is untouched
    expect((await rowOf('bola@gmail.com'))?.deletionRequestedAt).toBeNull();
  });

  it('accepts the person’s own email address (any capitals, extra spaces) as confirmation', async () => {
    const token = await signedIn(ADA);
    const res = await asking(token, { confirmation: '  ADA@Gmail.com ' });
    expect(res.status).toBe(202);
  });

  it('demands a recent sign-in: a session older than 10 minutes is refused', async () => {
    const token = await signedIn(ADA);

    now = new Date(START.getTime() + 11 * MINUTE);
    const refused = await asking(token, { confirmation: 'DELETE' });
    expect(refused.status).toBe(403);
    expect(refused.body).toEqual({ error: 'recent_sign_in_required' });
    expect((await rowOf('ada@gmail.com'))?.deletionRequestedAt).toBeNull();
    expect((await whoAmI(token)).status).toBe(200); // not signed out by the refusal

    // Signing in again (a new session) makes it possible.
    const fresh = await signedIn(ADA);
    expect((await asking(fresh, { confirmation: 'DELETE' })).status).toBe(202);
  });

  it('allows it right up to the 10-minute mark', async () => {
    const token = await signedIn(ADA);
    now = new Date(START.getTime() + 10 * MINUTE);
    expect((await asking(token, { confirmation: 'DELETE' })).status).toBe(202);
  });

  it('is refused when it comes from another website', async () => {
    const token = await signedIn(ADA);
    const res = await asking(token, { confirmation: 'DELETE' }).set(
      'Origin',
      'https://evil.example',
    );
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden_origin' });
    expect((await rowOf('ada@gmail.com'))?.deletionRequestedAt).toBeNull();
  });
});

describe('POST /api/me/delete — the last admin', () => {
  it('cannot delete themselves while no other admin exists', async () => {
    const token = await signedIn(ADA);
    await makeAdmin('ada@gmail.com');
    const res = await asking(token, { confirmation: 'DELETE' });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'last_admin' });
    expect((await rowOf('ada@gmail.com'))?.deletionRequestedAt).toBeNull();
    expect((await whoAmI(token)).status).toBe(200);
  });

  it('can delete once another active admin exists', async () => {
    const ada = await signedIn(ADA);
    await signedIn(BOLA);
    await makeAdmin('ada@gmail.com');
    await makeAdmin('bola@gmail.com');
    expect((await asking(ada, { confirmation: 'DELETE' })).status).toBe(202);
  });

  it('does not count a suspended admin, or one who is already leaving, as another admin', async () => {
    const ada = await signedIn(ADA);
    await signedIn(BOLA);
    await signedIn(CHIDI);
    await makeAdmin('ada@gmail.com');
    await makeAdmin('bola@gmail.com');
    await makeAdmin('chidi@gmail.com');
    await db.update(users).set({ status: 'suspended' }).where(eq(users.email, 'bola@gmail.com'));
    await db
      .update(users)
      .set({ deletionRequestedAt: START })
      .where(eq(users.email, 'chidi@gmail.com'));
    const res = await asking(ada, { confirmation: 'DELETE' });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'last_admin' });
  });

  it('lets only one of two admins leave when both ask at the same moment', async () => {
    const ada = await signedIn(ADA);
    const bola = await signedIn(BOLA);
    await makeAdmin('ada@gmail.com');
    await makeAdmin('bola@gmail.com');
    const [a, b] = await Promise.all([
      asking(ada, { confirmation: 'DELETE' }),
      asking(bola, { confirmation: 'DELETE' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([202, 409]);
    const pending = (await db.select().from(users)).filter((u) => u.deletionRequestedAt !== null);
    expect(pending).toHaveLength(1);
  });

  it('makes an admin wait their turn: nothing happens while another admin’s request holds the lock', async () => {
    const ada = await signedIn(ADA);
    await signedIn(BOLA);
    await makeAdmin('ada@gmail.com');
    await makeAdmin('bola@gmail.com');

    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let locked!: () => void;
    const hasLock = new Promise<void>((resolve) => (locked = resolve));
    const holder = db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${ADMIN_DELETION_LOCK})`);
      locked();
      await held;
    });
    await hasLock;

    const pending = asking(ada, { confirmation: 'DELETE' }).then((res) => res);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect((await rowOf('ada@gmail.com'))?.deletionRequestedAt).toBeNull(); // still waiting

    release();
    await holder;
    expect((await pending).status).toBe(202); // goes through once the lock is free
    expect((await rowOf('ada@gmail.com'))?.deletionRequestedAt).not.toBeNull();
  });

  it('does not affect people who are not admins', async () => {
    const ada = await signedIn(ADA);
    await signedIn(BOLA);
    await makeAdmin('bola@gmail.com');
    expect((await asking(ada, { confirmation: 'DELETE' })).status).toBe(202);
  });
});

describe('signing in again during the grace period', () => {
  it('cancels the deletion and says so', async () => {
    const first = await signedIn(ADA);
    await asking(first, { confirmation: 'DELETE' });

    now = new Date(START.getTime() + 5 * DAY);
    const res = await signIn(ADA);
    expect(res.status).toBe(200);
    const body = signInResponseSchema.parse(res.body);
    expect(body.deletionCancelled).toBe(true);
    expect(body.isNewUser).toBe(false);
    expect((await rowOf('ada@gmail.com'))?.deletionRequestedAt).toBeNull();
    expect((await whoAmI(tokenFrom(res))).status).toBe(200);
  });

  it('does not mention deletion on an ordinary sign-in', async () => {
    await signedIn(ADA);
    const res = await signIn(ADA);
    expect(res.body).not.toHaveProperty('deletionCancelled');
  });

  it('keeps the account’s data, so nothing is lost by changing their mind', async () => {
    const token = await signedIn(ADA);
    const row = (await rowOf('ada@gmail.com'))!;
    await db.insert(studentJourney).values({ userId: row.id, state: 'Rivers' });
    await asking(token, { confirmation: 'DELETE' });
    await signIn(ADA);
    const [journey] = await db.select().from(studentJourney);
    expect(journey?.state).toBe('Rivers');
  });

  it('does not let a suspended account escape: it stays suspended and stays scheduled', async () => {
    const token = await signedIn(ADA);
    await asking(token, { confirmation: 'DELETE' });
    await db.update(users).set({ status: 'suspended' }).where(eq(users.email, 'ada@gmail.com'));
    const res = await signIn(ADA);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'account_suspended' });
    expect((await rowOf('ada@gmail.com'))?.deletionRequestedAt).not.toBeNull();
  });
});

describe('the purge job (after the grace period)', () => {
  async function requestedDaysAgo(idToken: string, email: string, days: number) {
    await signedIn(idToken);
    await db
      .update(users)
      .set({ deletionRequestedAt: new Date(START.getTime() - days * DAY) })
      .where(eq(users.email, email));
  }

  it('erases accounts whose grace period is over, with everything linked to them', async () => {
    await requestedDaysAgo(ADA, 'ada@gmail.com', DELETION_GRACE_DAYS + 1);
    const row = (await rowOf('ada@gmail.com'))!;
    await db.insert(studentJourney).values({ userId: row.id, state: 'Rivers' });
    await db.insert(userRoles).values({ userId: row.id, role: 'mentor' });

    expect(await purgeDueDeletions(db, START)).toBe(1);
    expect(await db.select().from(users)).toHaveLength(0);
    expect(await db.select().from(sessions)).toHaveLength(0);
    expect(await db.select().from(userRoles)).toHaveLength(0);
    expect(await db.select().from(studentJourney)).toHaveLength(0);
  });

  it('erases at exactly the end of the grace period, not a moment before', async () => {
    await requestedDaysAgo(ADA, 'ada@gmail.com', DELETION_GRACE_DAYS);
    expect(await purgeDueDeletions(db, new Date(START.getTime() - 1))).toBe(0);
    expect(await purgeDueDeletions(db, START)).toBe(1);
  });

  it('leaves everyone else alone: still inside the grace period, or never asked', async () => {
    await requestedDaysAgo(ADA, 'ada@gmail.com', DELETION_GRACE_DAYS - 1);
    await signedIn(BOLA); // never asked
    expect(await purgeDueDeletions(db, START)).toBe(0);
    expect(await db.select().from(users)).toHaveLength(2);
  });

  it('does not erase an account whose owner cancelled by signing in', async () => {
    await requestedDaysAgo(ADA, 'ada@gmail.com', DELETION_GRACE_DAYS - 1);
    now = new Date(START.getTime() + 2 * DAY);
    await signIn(ADA); // cancels
    expect(await purgeDueDeletions(db, new Date(START.getTime() + 30 * DAY))).toBe(0);
    expect(await rowOf('ada@gmail.com')).toBeDefined();
  });

  it('works through a large backlog in batches', async () => {
    await requestedDaysAgo(ADA, 'ada@gmail.com', 20);
    await requestedDaysAgo(BOLA, 'bola@gmail.com', 20);
    await requestedDaysAgo(CHIDI, 'chidi@gmail.com', 20);
    expect(await purgeDueDeletions(db, START, 2)).toBe(2);
    expect(await purgeDueDeletions(db, START, 2)).toBe(1);
    expect(await db.select().from(users)).toHaveLength(0);
  });

  it('lets a normal person start fresh afterwards, with nothing remembered about them', async () => {
    await requestedDaysAgo(ADA, 'ada@gmail.com', 20);
    await purgeDueDeletions(db, START);
    expect(await db.select().from(blockedIdentities)).toHaveLength(0);

    const res = await signIn(ADA);
    expect(res.status).toBe(200);
    expect(signInResponseSchema.parse(res.body).isNewUser).toBe(true);
  });

  it('remembers only a scrambled Google id for a suspended account, so it cannot start over', async () => {
    await requestedDaysAgo(ADA, 'ada@gmail.com', 20);
    await db.update(users).set({ status: 'suspended' }).where(eq(users.email, 'ada@gmail.com'));
    expect(await purgeDueDeletions(db, START)).toBe(1);
    expect(await db.select().from(users)).toHaveLength(0);

    const blocked = await db.select().from(blockedIdentities);
    expect(blocked).toHaveLength(1);
    expect(blocked[0]?.googleSubHash).toBe(hashGoogleSub('google-sub-ada'));
    const stored = JSON.stringify(blocked);
    expect(stored).not.toContain('google-sub-ada');
    expect(stored).not.toContain('ada@gmail.com');

    const retry = await signIn(ADA);
    expect(retry.status).toBe(403);
    expect(retry.body).toEqual({ error: 'account_suspended' });
    expect(await db.select().from(users)).toHaveLength(0); // no clean account was created
  });

  it('erases a teacher who reviewed questions without losing the questions or their history', async () => {
    await requestedDaysAgo(ADA, 'ada@gmail.com', 20);
    const teacher = (await rowOf('ada@gmail.com'))!;
    const [pack] = await db
      .insert(questionPacks)
      .values({
        title: 'Past questions',
        sourceTitle: 'Class notes',
        rights: 'permission_granted',
        importedBy: teacher.id,
        rightsClearedBy: teacher.id,
        rightsClearedAt: START,
      })
      .returning();
    const [question] = await db
      .insert(questions)
      .values({
        packId: pack!.id,
        referenceId: 'q1',
        exam: 'jamb',
        origin: 'past_question',
        subject: 'Physics',
        stem: 'What is the unit of force?',
        options: [
          { label: 'A', text: 'Newton' },
          { label: 'B', text: 'Joule' },
        ],
        answer: 'A',
        explanation: 'Force is measured in newtons.',
        sourcePage: 1,
        status: 'approved',
        reviewedBy: teacher.id,
        reviewedAt: START,
      })
      .returning();
    await db.insert(questionRevisions).values({
      questionId: question!.id,
      version: 1,
      snapshot: {
        stem: 'Old wording',
        options: [],
        answer: 'A',
        explanation: 'Old',
        topic: null,
        difficulty: 3,
      },
      editedBy: teacher.id,
    });

    expect(await purgeDueDeletions(db, START)).toBe(1);
    expect(await db.select().from(users)).toHaveLength(0);

    const [keptPack] = await db.select().from(questionPacks);
    expect(keptPack?.importedBy).toBeNull();
    expect(keptPack?.rightsClearedBy).toBeNull();
    const [keptQuestion] = await db.select().from(questions);
    expect(keptQuestion?.stem).toBe('What is the unit of force?');
    expect(keptQuestion?.status).toBe('approved');
    expect(keptQuestion?.reviewedBy).toBeNull();
    const [keptRevision] = await db.select().from(questionRevisions);
    expect(keptRevision?.editedBy).toBeNull();
  });
});
