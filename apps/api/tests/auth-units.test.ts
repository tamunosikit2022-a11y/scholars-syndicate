import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { signInWithGoogle, type GoogleIdentity } from '../src/auth/accounts';
import {
  createGoogleVerifier,
  GoogleTokenError,
  GoogleUnavailableError,
  identityFromPayload,
} from '../src/auth/google';
import {
  createSession,
  deleteExpiredSessions,
  findActiveSession,
  revokeAllSessions,
} from '../src/auth/sessions';
import { generateSessionToken, hashSessionToken } from '../src/auth/tokens';
import { sessions, userRoles, users } from '../src/db/schema';
import { createTestDb } from './helpers';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-01T10:00:00.000Z');
const { db, pool } = createTestDb();

beforeEach(async () => {
  await db.delete(users);
});
afterAll(async () => {
  await pool.end();
});

let n = 0;
async function makeUser() {
  n += 1;
  const [u] = await db
    .insert(users)
    .values({ googleSub: `unit-${n}`, email: `unit${n}@example.com`, fullName: 'Unit User' })
    .returning();
  return u!;
}

describe('session codes', () => {
  it('are long, random and URL-safe', () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/); // 256 bits
    expect(a).not.toBe(b);
  });

  it('are scrambled the same way every time, differently for different codes', () => {
    expect(hashSessionToken('abc')).toBe(hashSessionToken('abc'));
    expect(hashSessionToken('abc')).not.toBe(hashSessionToken('abd'));
    expect(hashSessionToken('abc')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('session housekeeping', () => {
  it('removes only sessions that can never be used again', async () => {
    const u = await makeUser();
    const fresh = await createSession(db, u.id, 'phone', NOW);
    // idle-expired, and past its absolute limit (inserted directly to simulate old data)
    await db.insert(sessions).values([
      {
        userId: u.id,
        tokenHash: hashSessionToken('idle-expired'),
        createdAt: new Date(NOW.getTime() - 40 * DAY),
        lastSeenAt: new Date(NOW.getTime() - 35 * DAY),
        expiresAt: new Date(NOW.getTime() - 5 * DAY),
        absoluteExpiresAt: new Date(NOW.getTime() + 50 * DAY),
      },
      {
        userId: u.id,
        tokenHash: hashSessionToken('absolute-expired'),
        createdAt: new Date(NOW.getTime() - 100 * DAY),
        lastSeenAt: new Date(NOW.getTime() - 1 * DAY),
        expiresAt: new Date(NOW.getTime() - 10 * DAY),
        absoluteExpiresAt: new Date(NOW.getTime() - 10 * DAY),
      },
    ]);
    expect(await deleteExpiredSessions(db, NOW)).toBe(2);
    const left = await db.select().from(sessions);
    expect(left).toHaveLength(1);
    expect(left[0]?.tokenHash).toBe(hashSessionToken(fresh.token));
  });

  it('can sign a person out of every device without touching anyone else', async () => {
    const ada = await makeUser();
    const bola = await makeUser();
    await createSession(db, ada.id, 'phone', NOW);
    await createSession(db, ada.id, 'laptop', NOW);
    const bolaSession = await createSession(db, bola.id, 'phone', NOW);
    expect(await revokeAllSessions(db, ada.id)).toBe(2);
    expect(await findActiveSession(db, bolaSession.token, NOW)).not.toBeNull();
    expect(await db.select().from(sessions).where(eq(sessions.userId, ada.id))).toHaveLength(0);
  });

  it('trims very long device labels', async () => {
    const u = await makeUser();
    await createSession(db, u.id, 'x'.repeat(1000), NOW);
    const [row] = await db.select().from(sessions);
    expect(row?.userAgent).toHaveLength(200);
  });
});

describe('reading Google’s answer', () => {
  it('turns a token payload into an identity', () => {
    expect(
      identityFromPayload({
        sub: '123',
        email: 'a@b.co',
        email_verified: true,
        name: ' Ada ',
        picture: 'https://p',
      } as never),
    ).toEqual({
      sub: '123',
      email: 'a@b.co',
      emailVerified: true,
      name: 'Ada',
      picture: 'https://p',
    });
  });

  it('treats a missing verified flag as NOT verified, and falls back to the email name', () => {
    const id = identityFromPayload({ sub: '1', email: 'chidi@b.co' } as never);
    expect(id.emailVerified).toBe(false);
    expect(id.name).toBe('chidi');
    expect(id.picture).toBeNull();
  });

  it('rejects a payload with no id or no email', () => {
    expect(() => identityFromPayload(undefined)).toThrow(GoogleTokenError);
    expect(() => identityFromPayload({ email: 'a@b.co' } as never)).toThrow(GoogleTokenError);
    expect(() => identityFromPayload({ sub: '1' } as never)).toThrow(GoogleTokenError);
  });
});

describe('the Google verifier', () => {
  const payload = { sub: '9', email: 'ok@b.co', email_verified: true, name: 'Ok' };

  it('asks Google to check the token against OUR client id', async () => {
    let asked: { idToken: string; audience?: unknown } | undefined;
    const verify = createGoogleVerifier('our-client-id', {
      verifyIdToken: async (opts: never) => {
        asked = opts;
        return { getPayload: () => payload } as never;
      },
    });
    const identity = await verify('some-token');
    expect(asked).toEqual({ idToken: 'some-token', audience: 'our-client-id' });
    expect(identity.email).toBe('ok@b.co');
  });

  it('turns any rejection by Google into GoogleTokenError', async () => {
    const verify = createGoogleVerifier('id', {
      verifyIdToken: async () => {
        throw new Error('Wrong recipient, payload audience != requiredAudience');
      },
    });
    await expect(verify('t')).rejects.toBeInstanceOf(GoogleTokenError);
  });

  it('reports network trouble separately from a bad token', async () => {
    const verify = createGoogleVerifier('id', {
      verifyIdToken: async () => {
        throw Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
      },
    });
    await expect(verify('t')).rejects.toBeInstanceOf(GoogleUnavailableError);
  });

  it('also treats Google server errors and failed key downloads as "Google unreachable"', async () => {
    for (const failure of [
      Object.assign(new Error('Service Unavailable'), { status: 503 }),
      Object.assign(new Error('Too Many Requests'), { status: 429 }),
      new Error('Failed to retrieve verification certificates: request failed'),
    ]) {
      const verify = createGoogleVerifier('id', {
        verifyIdToken: async () => {
          throw failure;
        },
      });
      await expect(verify('t')).rejects.toBeInstanceOf(GoogleUnavailableError);
    }
  });

  it('does not mistake a client error (for example 400) for Google being down', async () => {
    const verify = createGoogleVerifier('id', {
      verifyIdToken: async () => {
        throw Object.assign(new Error('Bad Request'), { status: 400 });
      },
    });
    await expect(verify('t')).rejects.toBeInstanceOf(GoogleTokenError);
  });

  it('rejects a ticket that has no payload', async () => {
    const verify = createGoogleVerifier('id', {
      verifyIdToken: async () => ({ getPayload: () => undefined }) as never,
    });
    await expect(verify('t')).rejects.toBeInstanceOf(GoogleTokenError);
  });
});

describe('two first sign-ins at the same moment', () => {
  it('end up with exactly one account and one student role', async () => {
    const identity: GoogleIdentity = {
      sub: 'race-sub',
      email: 'race@example.com',
      emailVerified: true,
      name: 'Racer',
      picture: null,
    };
    const [a, b] = await Promise.all([
      signInWithGoogle(db, identity, NOW),
      signInWithGoogle(db, identity, NOW),
    ]);
    expect(a.kind).toBe('ok');
    expect(b.kind).toBe('ok');
    expect(await db.select().from(users)).toHaveLength(1);
    expect(await db.select().from(userRoles)).toHaveLength(1);
    const created = [a, b].filter((r) => r.kind === 'ok' && r.isNewUser);
    expect(created).toHaveLength(1);
  });
});
