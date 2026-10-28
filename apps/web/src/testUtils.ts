import { vi } from 'vitest';
import type { PublicUser } from '@scholars/shared';

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const health = (db: 'up' | 'down') => ({
  status: db === 'up' ? 'ok' : 'degraded',
  db,
  version: '9.9.9',
  time: '2026-01-01T00:00:00.000Z',
});

export const ada: PublicUser = {
  id: 'user-1',
  email: 'ada@gmail.com',
  emailVerified: true,
  fullName: 'Ada Student',
  displayName: null,
  avatarUrl: null,
  level: null,
  onboardingStage: 0,
  roles: ['student'],
};

type Handler = () => Response | Promise<Response>;

/** Replaces fetch with a tiny fake server. Keys look like "GET /api/auth/me". Unknown routes give 404. */
export function fakeServer(routes: Record<string, Handler>) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    const handler = routes[key];
    return handler ? handler() : json({ error: 'not_found' }, 404);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

export const signedOutRoutes = (clientId: string | null = 'cid.apps.googleusercontent.com') => ({
  'GET /api/auth/me': () => json({ error: 'not_signed_in' }, 401),
  'GET /api/auth/config': () => json({ googleClientId: clientId }),
  'GET /api/health': () => json(health('up')),
});
