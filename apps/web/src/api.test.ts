import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  NetworkError,
  getAuthConfig,
  getMe,
  signInWithGoogle,
  signOutOnServer,
} from './api';
import { ada, fakeServer, json } from './testUtils';

afterEach(() => vi.unstubAllGlobals());

describe('API client', () => {
  it('treats 401 from /me as "nobody is signed in", not as a failure', async () => {
    fakeServer({ 'GET /api/auth/me': () => json({ error: 'not_signed_in' }, 401) });
    expect(await getMe()).toBeNull();
  });

  it('returns the user from /me when signed in', async () => {
    fakeServer({ 'GET /api/auth/me': () => json({ user: ada }) });
    expect((await getMe())?.user.email).toBe('ada@gmail.com');
  });

  it('turns an error body into an ApiError carrying the server’s code', async () => {
    fakeServer({ 'POST /api/auth/google': () => json({ error: 'account_suspended' }, 403) });
    const failure = await signInWithGoogle('x'.repeat(30)).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ code: 'account_suspended', status: 403 });
  });

  it('copes with an error response that is not JSON', async () => {
    fakeServer({
      'POST /api/auth/google': () => new Response('<html>Bad gateway</html>', { status: 502 }),
    });
    const failure = await signInWithGoogle('x'.repeat(30)).catch((e: unknown) => e);
    expect(failure).toMatchObject({ code: 'unknown_error', status: 502 });
  });

  it('reports an unreachable server as NetworkError', async () => {
    fakeServer({
      'GET /api/auth/config': () => {
        throw new TypeError('Failed to fetch');
      },
    });
    await expect(getAuthConfig()).rejects.toBeInstanceOf(NetworkError);
  });

  it('refuses a response in an unexpected shape instead of trusting it', async () => {
    fakeServer({ 'GET /api/auth/config': () => json({ nope: true }) });
    await expect(getAuthConfig()).rejects.toThrow();
  });

  it('lets an aborted request stay an abort (so screens can ignore it)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError')));
    await expect(getMe()).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('signs out with a POST', async () => {
    const server = fakeServer({
      'POST /api/auth/logout': () => new Response(null, { status: 204 }),
    });
    await signOutOnServer();
    expect(server).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
