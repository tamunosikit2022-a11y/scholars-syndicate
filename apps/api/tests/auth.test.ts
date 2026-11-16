import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { authConfigResponseSchema, meResponseSchema, signInResponseSchema } from '@scholars/shared';
import { createApp } from '../src/app';
import type { GoogleIdentity } from '../src/auth/accounts';
import {
  GoogleTokenError,
  GoogleUnavailableError,
  type GoogleTokenVerifier,
} from '../src/auth/google';
import { hashSessionToken } from '../src/auth/tokens';
import { sessions, userRoles, users } from '../src/db/schema';
import { createTestDb } from './helpers';

const ORIGIN = 'http://localhost:5173';
const DAY = 24 * 60 * 60 * 1000;
const START = new Date('2026-11-01T10:00:00.000Z');

// A stand-in for Google: each fake token maps to a pretend Google identity.
const ADA_TOKEN = 'fake-google-token-for-ada-0001';
const identities: Record<string, GoogleIdentity> = {
  [ADA_TOKEN]: {
    sub: 'google-sub-ada',
    email: 'Ada.Student@Gmail.com', // mixed case on purpose
    emailVerified: true,
    name: 'Ada Student',
    picture: 'https://example.com/ada.png',
  },
  'fake-google-token-for-bola-0002': {
    sub: 'google-sub-bola',
    email: 'bola@gmail.com',
    emailVerified: true,
    name: 'Bola Scholar',
    picture: null,
  },
  'fake-google-token-unverified-3': {
    sub: 'google-sub-unverified',
    email: 'unverified@gmail.com',
    emailVerified: false,
    name: 'Not Verified',
    picture: null,
  },
};
const verify: GoogleTokenVerifier = async (idToken) => {
  if (idToken === 'fake-google-token-network-down') throw new GoogleUnavailableError('offline');
  const identity = identities[idToken];
  if (!identity) throw new GoogleTokenError('Google rejected the token');
  return identity;
};

let now = START;
const clock = () => now;
const { db, pool } = createTestDb();
const app = createApp({
  db,
  corsOrigin: ORIGIN,
  version: 'test',
  verifyGoogleToken: verify,
  clock,
  authRateLimit: { windowMs: 60_000, limit: 1000 },
});

beforeEach(async () => {
  now = START;
  await db.delete(users); // sessions and roles go with them
});
afterAll(async () => {
  await pool.end();
});

function setCookieOf(res: request.Response): string | undefined {
  const header = res.headers['set-cookie'];
  const list = Array.isArray(header) ? header : header ? [header] : [];
  return list[0];
}
function tokenFrom(res: request.Response, name = 'ss_session'): string {
  const cookie = setCookieOf(res);
  const match = cookie?.match(new RegExp(`^${name}=([^;]+)`));
  if (!match?.[1]) throw new Error('no session cookie in response');
  return decodeURIComponent(match[1]);
}
const signIn = (idToken: string, cookie?: string) => {
  const r = request(app).post('/api/auth/google').send({ idToken });
  return cookie ? r.set('Cookie', cookie) : r;
};
const me = (token: string) => request(app).get('/api/auth/me').set('Cookie', `ss_session=${token}`);

describe('POST /api/auth/google — first sign-in', () => {
  it('creates a student account and signs them in', async () => {
    const res = await signIn(ADA_TOKEN);
    expect(res.status).toBe(200);
    const body = signInResponseSchema.parse(res.body);
    expect(body.isNewUser).toBe(true);
    expect(body.user.roles).toEqual(['student']);
    expect(body.user.fullName).toBe('Ada Student');
    expect(body.user.onboardingStage).toBe(0);

    const [row] = await db.select().from(users);
    expect(row?.email).toBe('ada.student@gmail.com'); // stored lower-case
    expect(row?.lastLoginAt?.toISOString()).toBe(START.toISOString());
    expect(await db.select().from(userRoles)).toHaveLength(1);
  });

  it('never sends private fields to the website', async () => {
    const res = await signIn(ADA_TOKEN);
    const json = JSON.stringify(res.body);
    expect(json).not.toMatch(/google-sub-ada|dateOfBirth|googleSub|tokenHash/);
  });

  it('sets a safe cookie: hidden from scripts, same-site, with an expiry', async () => {
    const res = await signIn(ADA_TOKEN);
    const cookie = setCookieOf(res) ?? '';
    expect(cookie).toMatch(/^ss_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Expires=/i);
    expect(cookie).not.toMatch(/Secure/i); // only in production (tested below)
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('stores only a scrambled copy of the session code', async () => {
    const res = await signIn(ADA_TOKEN);
    const token = tokenFrom(res);
    const rows = await db.select().from(sessions);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).toBe(hashSessionToken(token));
    expect(rows[0]?.tokenHash).not.toBe(token);
    expect(JSON.stringify(rows)).not.toContain(token);
  });

  it('sets the idle limit to 30 days and the hard limit to 90 days', async () => {
    await signIn(ADA_TOKEN);
    const [row] = await db.select().from(sessions);
    expect(row?.expiresAt.getTime()).toBe(START.getTime() + 30 * DAY);
    expect(row?.absoluteExpiresAt.getTime()).toBe(START.getTime() + 90 * DAY);
  });
});

describe('POST /api/auth/google — returning and refused people', () => {
  it('recognises a returning person, refreshes their profile, and adds no duplicate', async () => {
    await signIn(ADA_TOKEN);
    const [first] = await db.select().from(users);

    now = new Date(START.getTime() + 2 * DAY);
    identities[ADA_TOKEN] = { ...identities[ADA_TOKEN]!, name: 'Ada Okafor', picture: null };
    const res = await signIn(ADA_TOKEN);
    expect(signInResponseSchema.parse(res.body).isNewUser).toBe(false);

    const all = await db.select().from(users);
    expect(all).toHaveLength(1);
    expect(all[0]?.id).toBe(first?.id);
    expect(all[0]?.fullName).toBe('Ada Okafor');
    expect(all[0]?.avatarUrl).toBeNull();
    expect(all[0]?.lastLoginAt?.getTime()).toBe(now.getTime());
    expect(await db.select().from(userRoles)).toHaveLength(1);
    identities[ADA_TOKEN] = { ...identities[ADA_TOKEN]!, name: 'Ada Student' };
  });

  it('keeps separate sessions for separate devices', async () => {
    await signIn(ADA_TOKEN);
    await signIn(ADA_TOKEN);
    expect(await db.select().from(sessions)).toHaveLength(2);
  });

  it('replaces the old session when signing in again on the same device', async () => {
    const first = await signIn(ADA_TOKEN);
    const oldToken = tokenFrom(first);
    const second = await signIn(ADA_TOKEN, `ss_session=${oldToken}`);
    expect(await db.select().from(sessions)).toHaveLength(1);
    expect((await me(oldToken)).status).toBe(401);
    expect((await me(tokenFrom(second))).status).toBe(200);
  });

  it('refuses an email Google has not verified', async () => {
    const res = await signIn('fake-google-token-unverified-3');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'email_not_verified' });
    expect(await db.select().from(users)).toHaveLength(0);
    expect(setCookieOf(res)).toBeUndefined();
  });

  it('refuses a token Google does not accept', async () => {
    const res = await signIn('this-is-a-forged-token-value');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'invalid_google_token' });
    expect(setCookieOf(res)).toBeUndefined();
    expect(await db.select().from(sessions)).toHaveLength(0);
  });

  it('says so (503) when Google cannot be reached', async () => {
    const res = await signIn('fake-google-token-network-down');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'google_unreachable' });
  });

  it('refuses a suspended account', async () => {
    await signIn(ADA_TOKEN);
    await db.update(users).set({ status: 'suspended' });
    await db.delete(sessions);
    const res = await signIn(ADA_TOKEN);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'account_suspended' });
    expect(await db.select().from(sessions)).toHaveLength(0);
  });

  it('refuses a new Google identity that uses an email already registered to someone else', async () => {
    await db
      .insert(users)
      .values({ googleSub: 'someone-else', email: 'ada.student@gmail.com', fullName: 'Other' });
    const res = await signIn(ADA_TOKEN);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'email_already_registered' });
    expect(await db.select().from(users)).toHaveLength(1);
    expect(await db.select().from(sessions)).toHaveLength(0);
  });

  it('rejects malformed requests', async () => {
    for (const body of [
      {},
      { idToken: 123 },
      { idToken: 'short' },
      { idToken: 'x'.repeat(5000) },
    ]) {
      const res = await request(app).post('/api/auth/google').send(body);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'invalid_request' });
    }
  });

  it('answers "not configured" (503) while Google sign-in has no client id', async () => {
    const unconfigured = createApp({ db, corsOrigin: ORIGIN, version: 'test', clock });
    const res = await request(unconfigured).post('/api/auth/google').send({ idToken: ADA_TOKEN });
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'google_sign_in_not_configured' });
  });
});

describe('GET /api/auth/me — staying signed in', () => {
  it('returns the signed-in person', async () => {
    const token = tokenFrom(await signIn(ADA_TOKEN));
    const res = await me(token);
    expect(res.status).toBe(200);
    const body = meResponseSchema.parse(res.body);
    expect(body.user.email).toBe('ada.student@gmail.com');
    expect(body.user.roles).toEqual(['student']);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('says 401 with no cookie, an unknown cookie, or garbage', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await me('a-session-code-that-was-never-issued-1234')).status).toBe(401);
    const garbage = await request(app).get('/api/auth/me').set('Cookie', 'ss_session=%%%;;;');
    expect(garbage.status).toBe(401);
    expect(garbage.body).toEqual({ error: 'not_signed_in' });
  });

  it('signs out after 30 days without use', async () => {
    const token = tokenFrom(await signIn(ADA_TOKEN));
    now = new Date(START.getTime() + 29 * DAY);
    expect((await me(token)).status).toBe(200); // still fine at day 29 (and renews)
    now = new Date(START.getTime() + 29 * DAY + 31 * DAY);
    expect((await me(token)).status).toBe(401); // 31 days idle
  });

  it('does not touch the database or cookie when used again within the hour', async () => {
    const token = tokenFrom(await signIn(ADA_TOKEN));
    now = new Date(START.getTime() + 30 * 60 * 1000);
    const res = await me(token);
    expect(res.status).toBe(200);
    expect(setCookieOf(res)).toBeUndefined();
    const [row] = await db.select().from(sessions);
    expect(row?.expiresAt.getTime()).toBe(START.getTime() + 30 * DAY);
  });

  it('renews the 30 days each time the person uses the app, and refreshes the cookie', async () => {
    const token = tokenFrom(await signIn(ADA_TOKEN));
    now = new Date(START.getTime() + 10 * DAY);
    const res = await me(token);
    expect(res.status).toBe(200);
    expect(setCookieOf(res)).toMatch(/^ss_session=/); // cookie re-issued with the new expiry
    const [row] = await db.select().from(sessions);
    expect(row?.expiresAt.getTime()).toBe(now.getTime() + 30 * DAY);

    // Without renewal the original expiry (day 30) would have passed by day 35.
    now = new Date(START.getTime() + 35 * DAY);
    expect((await me(token)).status).toBe(200);
  });

  it('never lets a session outlive 90 days, however often it is used', async () => {
    const token = tokenFrom(await signIn(ADA_TOKEN));
    for (const day of [20, 40, 60, 80]) {
      now = new Date(START.getTime() + day * DAY);
      expect((await me(token)).status).toBe(200);
    }
    const [row] = await db.select().from(sessions);
    expect(row?.expiresAt.getTime()).toBe(START.getTime() + 90 * DAY); // capped at the hard limit

    now = new Date(START.getTime() + 91 * DAY); // used 11 days ago, but past the hard limit
    expect((await me(token)).status).toBe(401);
  });

  it('stops working the moment an account is suspended', async () => {
    const token = tokenFrom(await signIn(ADA_TOKEN));
    await db.update(users).set({ status: 'suspended' });
    expect((await me(token)).status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('signs this device out and clears the cookie', async () => {
    const token = tokenFrom(await signIn(ADA_TOKEN));
    const res = await request(app).post('/api/auth/logout').set('Cookie', `ss_session=${token}`);
    expect(res.status).toBe(204);
    expect(setCookieOf(res)).toMatch(/^ss_session=;/);
    expect(await db.select().from(sessions)).toHaveLength(0);
    expect((await me(token)).status).toBe(401);
  });

  it('only signs out that device, not the person’s other devices', async () => {
    const phone = tokenFrom(await signIn(ADA_TOKEN));
    const laptop = tokenFrom(await signIn(ADA_TOKEN));
    await request(app).post('/api/auth/logout').set('Cookie', `ss_session=${phone}`);
    expect((await me(phone)).status).toBe(401);
    expect((await me(laptop)).status).toBe(200);
  });

  it('is harmless when nobody is signed in', async () => {
    expect((await request(app).post('/api/auth/logout')).status).toBe(204);
  });
});

describe('POST /api/auth/logout-all', () => {
  it('revokes every device for this person and clears the current cookie', async () => {
    const phone = tokenFrom(await signIn(ADA_TOKEN));
    const laptop = tokenFrom(await signIn(ADA_TOKEN));
    const res = await request(app)
      .post('/api/auth/logout-all')
      .set('Cookie', `ss_session=${phone}`);
    expect(res.status).toBe(204);
    expect(setCookieOf(res)).toMatch(/^ss_session=;/);
    expect(await db.select().from(sessions)).toHaveLength(0);
    expect((await me(phone)).status).toBe(401);
    expect((await me(laptop)).status).toBe(401);
  });

  it('does not revoke another person’s sessions', async () => {
    const ada = tokenFrom(await signIn(ADA_TOKEN));
    const bola = tokenFrom(await signIn('fake-google-token-for-bola-0002'));
    const res = await request(app).post('/api/auth/logout-all').set('Cookie', `ss_session=${ada}`);
    expect(res.status).toBe(204);
    expect((await me(ada)).status).toBe(401);
    expect((await me(bola)).status).toBe(200);
  });

  it('requires a signed-in person', async () => {
    const res = await request(app).post('/api/auth/logout-all');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'not_signed_in' });
  });
});

describe('protection against other websites and abuse', () => {
  it('blocks state-changing requests that come from another website', async () => {
    const token = tokenFrom(await signIn(ADA_TOKEN));
    const evil = await request(app)
      .post('/api/auth/logout')
      .set('Origin', 'https://evil.example')
      .set('Cookie', `ss_session=${token}`);
    expect(evil.status).toBe(403);
    expect(evil.body).toEqual({ error: 'forbidden_origin' });
    expect((await me(token)).status).toBe(200); // the evil request changed nothing

    const ok = await request(app)
      .post('/api/auth/logout')
      .set('Origin', ORIGIN)
      .set('Cookie', `ss_session=${token}`);
    expect(ok.status).toBe(204);
  });

  it('also blocks a sign-in attempt from another website', async () => {
    const res = await request(app)
      .post('/api/auth/google')
      .set('Origin', 'https://evil.example')
      .send({ idToken: ADA_TOKEN });
    expect(res.status).toBe(403);
    expect(await db.select().from(users)).toHaveLength(0);
  });

  it('lets our website send the sign-in cookie (CORS with credentials)', async () => {
    const res = await request(app).get('/api/auth/me').set('Origin', ORIGIN);
    expect(res.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('limits sign-in attempts per visitor (429)', async () => {
    const limited = createApp({
      db,
      corsOrigin: ORIGIN,
      version: 'test',
      verifyGoogleToken: verify,
      clock,
      authRateLimit: { windowMs: 60_000, limit: 3 },
    });
    const attempt = () => request(limited).post('/api/auth/google').send({});
    for (let i = 0; i < 3; i++) expect((await attempt()).status).toBe(400);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ error: 'too_many_requests' });
  });

  it('uses the stricter __Host- cookie with the Secure flag in production', async () => {
    const prod = createApp({
      db,
      corsOrigin: ORIGIN,
      version: 'test',
      verifyGoogleToken: verify,
      clock,
      isProduction: true,
      authRateLimit: { windowMs: 60_000, limit: 1000 },
    });
    const res = await request(prod).post('/api/auth/google').send({ idToken: ADA_TOKEN });
    const cookie = setCookieOf(res) ?? '';
    expect(cookie).toMatch(/^__Host-ss_session=/);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/HttpOnly/i);
    const token = tokenFrom(res, '__Host-ss_session');
    const meRes = await request(prod)
      .get('/api/auth/me')
      .set('Cookie', `__Host-ss_session=${token}`);
    expect(meRes.status).toBe(200);
  });
});

describe('deleting an account removes its sessions', () => {
  it('cascades from the user to their sessions', async () => {
    await signIn(ADA_TOKEN);
    await db.delete(users).where(eq(users.googleSub, 'google-sub-ada'));
    expect(await db.select().from(sessions)).toHaveLength(0);
  });
});

describe('GET /api/auth/config', () => {
  it('tells the website which Google client id to use', async () => {
    const configured = createApp({
      db,
      corsOrigin: ORIGIN,
      version: 'test',
      clock,
      googleClientId: 'abc.apps.googleusercontent.com',
    });
    const res = await request(configured).get('/api/auth/config');
    expect(res.status).toBe(200);
    expect(authConfigResponseSchema.parse(res.body).googleClientId).toBe(
      'abc.apps.googleusercontent.com',
    );
  });

  it('says null while Google sign-in is not switched on, and needs no sign-in', async () => {
    const res = await request(app).get('/api/auth/config');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ googleClientId: null });
  });
});
