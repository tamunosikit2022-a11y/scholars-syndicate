import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp, DEFAULT_RATE_LIMITS, type RateLimits } from '../src/app';
import type { GoogleIdentity } from '../src/auth/accounts';
import { GoogleTokenError, type GoogleTokenVerifier } from '../src/auth/google';
import { users } from '../src/db/schema';
import { createTestDb } from './helpers';

const ORIGIN = 'http://localhost:5173';
const { db, pool } = createTestDb();

const identities: Record<string, GoogleIdentity> = {};
for (const n of ['ada', 'bola']) {
  identities[`fake-google-token-for-${n}-0001`] = {
    sub: `google-sub-${n}`,
    email: `${n}@gmail.com`,
    emailVerified: true,
    name: `${n} Person`,
    picture: null,
  };
}
const verify: GoogleTokenVerifier = async (token) => {
  const id = identities[token];
  if (!id) throw new GoogleTokenError('rejected');
  return id;
};

/** A fresh app with tiny limits so a handful of requests is enough to hit them. */
function appWith(limits: Partial<RateLimits>) {
  return createApp({
    db,
    corsOrigin: ORIGIN,
    version: 'test',
    verifyGoogleToken: verify,
    rateLimits: limits,
    authRateLimit: { windowMs: 60_000, limit: 1000 },
  });
}
const tiny = (limit: number) => ({ windowMs: 60_000, limit });

beforeEach(async () => {
  await db.delete(users);
});
afterAll(async () => {
  await db.delete(users);
  await pool.end();
});

async function signIn(app: ReturnType<typeof appWith>, name: string) {
  const res = await request(app)
    .post('/api/auth/google')
    .set('Origin', ORIGIN)
    .send({ idToken: `fake-google-token-for-${name}-0001` });
  expect(res.status).toBe(200);
  const header = res.headers['set-cookie'];
  const first = (Array.isArray(header) ? header : [header])[0] ?? '';
  return first.split(';')[0] as string;
}

describe('the default limits are sensible', () => {
  it('are generous for a shared school connection, strict for expensive actions', () => {
    expect(DEFAULT_RATE_LIMITS.ip.limit).toBeGreaterThanOrEqual(5_000);
    expect(DEFAULT_RATE_LIMITS.user.limit).toBeGreaterThanOrEqual(500);
    expect(DEFAULT_RATE_LIMITS.sensitive.limit).toBeLessThanOrEqual(60);
    expect(DEFAULT_RATE_LIMITS.sensitive.limit).toBeLessThan(DEFAULT_RATE_LIMITS.user.limit);
    expect(DEFAULT_RATE_LIMITS.user.limit).toBeLessThan(DEFAULT_RATE_LIMITS.ip.limit);
  });
});

describe('the per-address limit (a flood from one place)', () => {
  it('stops a flood with a plain 429 the website can explain', async () => {
    const app = appWith({ ip: tiny(5) });
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) statuses.push((await request(app).get('/api/health')).status);
    expect(statuses.slice(0, 5).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(5)).toEqual([429, 429, 429]);

    const refused = await request(app).get('/api/health');
    expect(refused.body).toEqual({ error: 'too_many_requests' });
    expect(refused.headers['ratelimit']).toBeTruthy(); // tells well-behaved clients when to retry
  });

  it('applies before the database is touched: a stranger flooding with random cookies is stopped too', async () => {
    const app = appWith({ ip: tiny(3) });
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) {
      codes.push(
        (
          await request(app)
            .get('/api/auth/me')
            .set('Cookie', `ss_session=${'x'.repeat(40)}${i}`)
        ).status,
      );
    }
    expect(codes.filter((c) => c === 429).length).toBe(3);
  });
});

describe('the per-person limit (one account hammering the server)', () => {
  it('limits the person, wherever they connect from, without touching anyone else on the same connection', async () => {
    const app = appWith({ user: tiny(3) });
    const ada = await signIn(app, 'ada');
    const bola = await signIn(app, 'bola'); // same address (the test machine) as Ada

    const adas: number[] = [];
    for (let i = 0; i < 5; i++)
      adas.push((await request(app).get('/api/auth/me').set('Cookie', ada)).status);
    expect(adas).toEqual([200, 200, 200, 429, 429]);

    // Bola, on the very same address, is untouched, and so is a signed-out visitor.
    expect((await request(app).get('/api/auth/me').set('Cookie', bola)).status).toBe(200);
    expect((await request(app).get('/api/auth/config')).status).toBe(200);
  });
});

describe('expensive and destructive actions', () => {
  it('limits "export my data" per person', async () => {
    const app = appWith({ sensitive: tiny(2) });
    const ada = await signIn(app, 'ada');
    const bola = await signIn(app, 'bola');
    const codes: number[] = [];
    for (let i = 0; i < 4; i++)
      codes.push((await request(app).get('/api/me/export').set('Cookie', ada)).status);
    expect(codes).toEqual([200, 200, 429, 429]);
    expect((await request(app).get('/api/auth/me').set('Cookie', ada)).status).toBe(200); // everything else still works
    expect((await request(app).get('/api/me/export').set('Cookie', bola)).status).toBe(200); // other people too
  });

  it('stops anyone guessing the account-deletion confirmation over and over', async () => {
    const app = appWith({ sensitive: tiny(3) });
    const ada = await signIn(app, 'ada');
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) {
      codes.push(
        (
          await request(app)
            .post('/api/me/delete')
            .set('Cookie', ada)
            .set('Origin', ORIGIN)
            .send({ confirmation: `guess ${i}` })
        ).status,
      );
    }
    expect(codes.slice(0, 3).every((c) => c === 422 || c === 403)).toBe(true); // refused, but allowed to try
    expect(codes.slice(3)).toEqual([429, 429]);
  });

  it('limits "sign out of all devices" per person', async () => {
    const app = appWith({ sensitive: tiny(1) });
    const first = await signIn(app, 'ada');
    const ok = await request(app)
      .post('/api/auth/logout-all')
      .set('Cookie', first)
      .set('Origin', ORIGIN);
    expect(ok.status).toBe(204);
    const second = await signIn(app, 'ada');
    const refused = await request(app)
      .post('/api/auth/logout-all')
      .set('Cookie', second)
      .set('Origin', ORIGIN);
    expect(refused.status).toBe(429);
  });
});

describe('browser-labelled cross-site requests with no Origin', () => {
  it('are refused, and the sign-in survives the attempt', async () => {
    const app = appWith({});
    const ada = await signIn(app, 'ada');
    const forged = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', ada)
      .set('Sec-Fetch-Site', 'cross-site');
    expect(forged.status).toBe(403);
    expect(forged.body).toEqual({ error: 'forbidden_origin' });
    expect((await request(app).get('/api/auth/me').set('Cookie', ada)).status).toBe(200);
  });

  it('still allow our own website and plain non-browser tools', async () => {
    const app = appWith({});
    const a = await signIn(app, 'ada');
    expect(
      (
        await request(app)
          .post('/api/auth/logout')
          .set('Cookie', a)
          .set('Sec-Fetch-Site', 'same-origin')
      ).status,
    ).toBe(204);
    const b = await signIn(app, 'ada');
    expect((await request(app).post('/api/auth/logout').set('Cookie', b)).status).toBe(204); // no header at all
    const c = await signIn(app, 'ada');
    expect(
      (
        await request(app)
          .post('/api/auth/logout')
          .set('Cookie', c)
          .set('Origin', ORIGIN)
          .set('Sec-Fetch-Site', 'cross-site')
      ) // our own origin always wins
      .status,
    ).toBe(204);
  });
});
