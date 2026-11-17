import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  NetworkError,
  completeJourney,
  exportMyData,
  getAuthConfig,
  getJourney,
  getMe,
  saveJourney,
  signOutEverywhere,
  signInWithGoogle,
  signOutOnServer,
} from './api';
import { ada, fakeServer, json } from './testUtils';

afterEach(() => vi.unstubAllGlobals());

describe('API client', () => {
  const emptyJourney = {
    journey: {
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
    },
  };

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

  it('signs out every device with a POST', async () => {
    const server = fakeServer({
      'POST /api/auth/logout-all': () => new Response(null, { status: 204 }),
    });
    await signOutEverywhere();
    expect(server).toHaveBeenCalledWith(
      '/api/auth/logout-all',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('loads and validates the account data export', async () => {
    const data = {
      schemaVersion: 1,
      exportedAt: '2026-11-16T09:00:00.000Z',
      account: {
        id: '9f2a2d2b-91fb-4d94-86b2-43a5b4bc04c3',
        email: 'ada@example.com',
        emailVerified: true,
        fullName: 'Ada Student',
        avatarUrl: null,
        displayName: 'Ada',
        dateOfBirth: '2000-05-17',
        level: 'jamb_candidate',
        termsAcceptedAt: '2026-11-01T09:00:00.000Z',
        termsVersion: '2026-11-draft-1',
        guardianConsentAt: null,
        onboardingStage: 1,
        roles: ['student'],
        status: 'active',
        createdAt: '2026-11-01T09:00:00.000Z',
        updatedAt: '2026-11-01T09:00:00.000Z',
        lastLoginAt: null,
      },
      journey: null,
      sessions: [],
    };
    const server = fakeServer({ 'GET /api/me/export': () => json(data) });
    expect(await exportMyData()).toEqual(data);
    expect(server).toHaveBeenCalledWith(
      '/api/me/export',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('loads the private Stage 2 preferences and validates the response shape', async () => {
    const server = fakeServer({ 'GET /api/me/journey': () => json(emptyJourney) });
    expect(await getJourney()).toEqual(emptyJourney);
    expect(server).toHaveBeenCalledWith(
      '/api/me/journey',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('partially saves journey preferences with PUT', async () => {
    const server = fakeServer({
      'PUT /api/me/journey': () =>
        json({
          journey: { ...emptyJourney.journey, state: 'Lagos' },
        }),
    });
    const input = { state: 'Lagos' };
    expect((await saveJourney(input)).journey.state).toBe('Lagos');
    expect(server).toHaveBeenCalledWith(
      '/api/me/journey',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify(input) }),
    );
  });

  it('completes or skips Stage 2 with POST', async () => {
    const server = fakeServer({
      'POST /api/me/journey/complete': () =>
        json({ journey: { ...emptyJourney.journey, completedAt: '2026-11-16T09:00:00.000Z' } }),
    });
    expect((await completeJourney()).journey.completedAt).toBe('2026-11-16T09:00:00.000Z');
    expect(server).toHaveBeenCalledWith(
      '/api/me/journey/complete',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
