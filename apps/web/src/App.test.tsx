import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { ada, fakeServer, health, json, signedOutRoutes } from './testUtils';

// A stand-in for Google's script, so tests never touch the real Google.
const gsi = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('./gsi', () => ({ loadGoogleIdentity: () => gsi.load() }));

const initialize = vi.fn();
const renderButton = vi.fn();

beforeEach(() => {
  initialize.mockReset();
  renderButton.mockReset();
  gsi.load.mockReset();
  gsi.load.mockResolvedValue({ initialize, renderButton, disableAutoSelect: vi.fn() });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Pretends the person picked their account in Google's popup. */
async function googleReturnsToken(token = 'google-id-token-0123456789') {
  await waitFor(() => expect(initialize).toHaveBeenCalled());
  const config = initialize.mock.calls.at(-1)?.[0] as {
    callback: (r: { credential: string }) => void;
  };
  await act(async () => {
    config.callback({ credential: token });
  });
}

const signInOk = (user = ada, isNewUser = true) => ({
  'POST /api/auth/google': () => json({ user, isNewUser }),
});

describe('signed out', () => {
  it('shows the sign-in card and renders Google’s button for our client id', async () => {
    fakeServer(signedOutRoutes());
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
    await waitFor(() => expect(renderButton).toHaveBeenCalled());
    expect(initialize.mock.calls[0]?.[0]).toMatchObject({
      client_id: 'cid.apps.googleusercontent.com',
      auto_select: false,
    });
    expect(renderButton.mock.calls[0]?.[0]).toBeInstanceOf(HTMLElement);
    expect(renderButton.mock.calls[0]?.[1]).toMatchObject({ text: 'signin_with' });
  });

  it('says so, and never loads Google, while sign-in is not switched on', async () => {
    fakeServer(signedOutRoutes(null));
    render(<App />);
    expect(await screen.findByText(/Sign-in is not switched on yet/)).toBeTruthy();
    expect(gsi.load).not.toHaveBeenCalled();
  });

  it('offers a retry when the Google script cannot be loaded', async () => {
    fakeServer(signedOutRoutes());
    gsi.load.mockRejectedValueOnce(new Error('offline'));
    render(<App />);
    expect(await screen.findByText(/could not load Google sign-in/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(renderButton).toHaveBeenCalled());
  });

  it('offers a retry when the sign-in settings cannot be fetched', async () => {
    let calls = 0;
    fakeServer({
      ...signedOutRoutes(),
      'GET /api/auth/config': () => {
        calls += 1;
        if (calls === 1) throw new TypeError('offline');
        return json({ googleClientId: 'cid.apps.googleusercontent.com' });
      },
    });
    render(<App />);
    expect(await screen.findByText(/could not reach the server/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(renderButton).toHaveBeenCalled());
  });

  it('asks again when the first "who is signed in?" call fails', async () => {
    let calls = 0;
    fakeServer({
      ...signedOutRoutes(),
      'GET /api/auth/me': () => {
        calls += 1;
        if (calls === 1) throw new TypeError('offline');
        return json({ error: 'not_signed_in' }, 401);
      },
    });
    render(<App />);
    expect(await screen.findByText(/could not reach the server/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
  });
});

describe('signing in', () => {
  it('sends Google’s token to our server and then shows the welcome screen', async () => {
    const server = fakeServer({ ...signedOutRoutes(), ...signInOk() });
    render(<App />);
    await screen.findByRole('heading', { name: 'Sign in' });

    await googleReturnsToken('google-id-token-0123456789');
    expect(await screen.findByRole('heading', { name: 'Welcome, Ada' })).toBeTruthy();

    const call = server.mock.calls.find(([url]) => url === '/api/auth/google');
    expect(call).toBeTruthy();
    const init = call?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    expect(JSON.parse(init.body as string)).toEqual({ idToken: 'google-id-token-0123456789' });
  });

  it.each([
    ['invalid_google_token', 401, /could not confirm your sign-in/i],
    ['email_not_verified', 403, /not verified/i],
    ['account_suspended', 403, /suspended/i],
    ['email_already_registered', 409, /already linked/i],
    ['google_unreachable', 503, /could not reach Google/i],
    ['too_many_requests', 429, /too many attempts/i],
    ['forbidden_origin', 403, /not allowed to sign in/i],
  ])(
    'explains "%s" in plain language and stays on the sign-in card',
    async (code, status, text) => {
      fakeServer({
        ...signedOutRoutes(),
        'POST /api/auth/google': () => json({ error: code }, status),
      });
      render(<App />);
      await screen.findByRole('heading', { name: 'Sign in' });
      await googleReturnsToken();
      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toMatch(text);
      expect(screen.getByRole('heading', { name: 'Sign in' })).toBeTruthy();
    },
  );

  it('explains a network failure while signing in', async () => {
    fakeServer({
      ...signedOutRoutes(),
      'POST /api/auth/google': () => {
        throw new TypeError('offline');
      },
    });
    render(<App />);
    await screen.findByRole('heading', { name: 'Sign in' });
    await googleReturnsToken();
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not reach the server/i);
  });

  it('clears an old error when the person tries again successfully', async () => {
    let attempts = 0;
    fakeServer({
      ...signedOutRoutes(),
      'POST /api/auth/google': () => {
        attempts += 1;
        return attempts === 1
          ? json({ error: 'google_unreachable' }, 503)
          : json({ user: ada, isNewUser: false });
      },
    });
    render(<App />);
    await screen.findByRole('heading', { name: 'Sign in' });
    await googleReturnsToken();
    await screen.findByRole('alert');
    await googleReturnsToken();
    expect(await screen.findByRole('heading', { name: 'Welcome, Ada' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('signed in', () => {
  const signedInRoutes = (user = ada) => ({
    'GET /api/auth/me': () => json({ user }),
    'GET /api/health': () => json(health('up')),
  });

  it('greets a returning person straight away (the cookie is still valid)', async () => {
    fakeServer(signedInRoutes());
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Welcome, Ada' })).toBeTruthy();
    expect(screen.getByText('ada@gmail.com')).toBeTruthy();
    expect(screen.getByText('Student')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Sign in' })).toBeNull();
  });

  it('prefers the display name, and shows every role', async () => {
    fakeServer(signedInRoutes({ ...ada, displayName: 'Dee', roles: ['student', 'mentor'] }));
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Welcome, Dee' })).toBeTruthy();
    expect(screen.getByText('Student')).toBeTruthy();
    expect(screen.getByText('Mentor')).toBeTruthy();
  });

  it('shows initials when there is no photo, and the photo when there is one', async () => {
    fakeServer(signedInRoutes());
    const { container, unmount } = render(<App />);
    await screen.findByRole('heading', { name: 'Welcome, Ada' });
    expect(container.querySelector('.avatar-fallback')?.textContent).toBe('AS');
    unmount();

    fakeServer(signedInRoutes({ ...ada, avatarUrl: 'https://example.com/ada.png' }));
    const second = render(<App />);
    await screen.findByRole('heading', { name: 'Welcome, Ada' });
    const img = second.container.querySelector('img.avatar');
    expect(img?.getAttribute('src')).toBe('https://example.com/ada.png');
    expect(img?.getAttribute('referrerpolicy')).toBe('no-referrer');
  });

  it('signs out and returns to the sign-in card', async () => {
    const server = fakeServer({
      ...signedInRoutes(),
      ...signedOutRoutes(),
      'GET /api/auth/me': () => json({ user: ada }),
      'POST /api/auth/logout': () => new Response(null, { status: 204 }),
    });
    render(<App />);
    await screen.findByRole('heading', { name: 'Welcome, Ada' });
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
    expect(
      server.mock.calls.some(
        ([url, init]) => url === '/api/auth/logout' && init?.method === 'POST',
      ),
    ).toBe(true);
  });

  it('stays signed in, and says why, when signing out cannot reach the server', async () => {
    fakeServer({
      ...signedInRoutes(),
      'POST /api/auth/logout': () => {
        throw new TypeError('offline');
      },
    });
    render(<App />);
    await screen.findByRole('heading', { name: 'Welcome, Ada' });
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not reach the server/i);
    expect(screen.getByRole('heading', { name: 'Welcome, Ada' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Sign out' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});
