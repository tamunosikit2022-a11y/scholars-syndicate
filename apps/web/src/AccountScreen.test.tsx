import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { ada, fakeServer, freshAda, health, json, signedOutRoutes } from './testUtils';

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
  window.location.hash = '';
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.location.hash = '';
});

const noContent = () => new Response(null, { status: 204 });
const journey = {
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
};

/** A signed-in server, plus the sign-in screens we fall back to once signed out. */
function signedInServer(extra: Record<string, () => Response | Promise<Response>> = {}) {
  return fakeServer({
    ...signedOutRoutes(),
    'GET /api/auth/me': () => json({ user: ada }),
    'GET /api/me/journey': () => json({ journey }),
    'POST /api/auth/logout': noContent,
    ...extra,
  });
}

const callsTo = (server: ReturnType<typeof fakeServer>, key: string) =>
  server.mock.calls.filter(([url, init]) => `${init?.method ?? 'GET'} ${url}` === key);

async function openAccount() {
  render(<App />);
  await screen.findByRole('heading', { name: 'Welcome, Ada' });
  fireEvent.click(screen.getByRole('link', { name: 'Account' }));
  return screen.findByRole('heading', { name: 'Your account' });
}

async function openDeleteForm() {
  fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
  return screen.findByLabelText(/To confirm, type DELETE/);
}

const exportBody = {
  schemaVersion: 1,
  exportedAt: '2026-11-17T10:00:00.000Z',
  account: {
    id: '7d0e6a52-1c2b-4f6e-9d57-0a4b6f3a9c11',
    email: 'ada@gmail.com',
    emailVerified: true,
    fullName: 'Ada Student',
    avatarUrl: null,
    displayName: null,
    dateOfBirth: null,
    level: null,
    termsAcceptedAt: null,
    termsVersion: null,
    guardianConsentAt: null,
    onboardingStage: 2,
    roles: ['student'],
    status: 'active',
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    lastLoginAt: null,
  },
  journey: null,
  sessions: [],
};

describe('the tab bar', () => {
  it('offers Home and Account, with Home open to start with', async () => {
    signedInServer();
    render(<App />);
    await screen.findByRole('heading', { name: 'Welcome, Ada' });
    const nav = within(screen.getByRole('navigation', { name: 'Main' }));
    expect(nav.getByRole('link', { name: 'Home' }).getAttribute('aria-current')).toBe('page');
    expect(nav.getByRole('link', { name: 'Account' }).getAttribute('aria-current')).toBeNull();
  });

  it('switches to the Account screen and back, marking the open tab', async () => {
    signedInServer();
    await openAccount();
    const nav = within(screen.getByRole('navigation', { name: 'Main' }));
    expect(nav.getByRole('link', { name: 'Account' }).getAttribute('aria-current')).toBe('page');
    expect(nav.getByRole('link', { name: 'Home' }).getAttribute('aria-current')).toBeNull();

    fireEvent.click(nav.getByRole('link', { name: 'Home' }));
    expect(await screen.findByRole('heading', { name: 'Welcome, Ada' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Your account' })).toBeNull();
  });

  it('opens straight on the Account screen from a #account link', async () => {
    window.location.hash = '#account';
    signedInServer();
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Your account' })).toBeTruthy();
    expect(screen.getByText('Signed in as ada@gmail.com')).toBeTruthy();
  });

  it('moves focus to the new screen’s heading so screen-reader users know where they are', async () => {
    signedInServer();
    const heading = await openAccount();
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });

  it('keeps the system status panel on Home only', async () => {
    signedInServer();
    render(<App />);
    expect(await screen.findByText('Connected — everything is working.')).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'Account' }));
    await screen.findByRole('heading', { name: 'Your account' });
    expect(screen.queryByText('Connected — everything is working.')).toBeNull();
  });

  it('is not shown to a signed-out visitor, or to a student still onboarding', async () => {
    fakeServer(signedOutRoutes());
    const { unmount } = render(<App />);
    await screen.findByRole('heading', { name: 'Sign in' });
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
    unmount();

    fakeServer({ ...signedOutRoutes(), 'GET /api/auth/me': () => json({ user: freshAda }) });
    render(<App />);
    await screen.findByRole('heading', { name: 'Tell us about you' });
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
  });
});

describe('download my data', () => {
  function captureDownload() {
    const createObjectURL = vi.fn(() => 'blob:fake');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this);
    });
    return { createObjectURL, clicked };
  }

  it('saves the file on the person’s own device and says so', async () => {
    const { createObjectURL, clicked } = captureDownload();
    const server = signedInServer({ 'GET /api/me/export': () => json(exportBody) });
    await openAccount();

    fireEvent.click(screen.getByRole('button', { name: 'Download my data' }));
    expect(await screen.findByText('Done. Your file was saved to your device.')).toBeTruthy();

    expect(callsTo(server, 'GET /api/me/export')).toHaveLength(1);
    expect(clicked).toHaveLength(1);
    expect(clicked[0]?.download).toBe('scholars-syndicate-my-data.json');
    const blob = (createObjectURL.mock.calls[0] as unknown as [Blob])[0];
    expect(blob.type).toBe('application/json');
    expect(JSON.parse(await blob.text()).account.email).toBe('ada@gmail.com');
  });

  it('shows a plain message when the server cannot be reached, and nothing is saved', async () => {
    const { clicked } = captureDownload();
    signedInServer({
      'GET /api/me/export': () => {
        throw new TypeError('offline');
      },
    });
    await openAccount();
    fireEvent.click(screen.getByRole('button', { name: 'Download my data' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/could not reach the server/i);
    expect(clicked).toHaveLength(0);
    expect(screen.queryByText(/Your file was saved/)).toBeNull();
  });

  it('refuses to save a file that does not look like an export', async () => {
    const { clicked } = captureDownload();
    signedInServer({ 'GET /api/me/export': () => json({ nonsense: true }) });
    await openAccount();
    fireEvent.click(screen.getByRole('button', { name: 'Download my data' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/something went wrong/i);
    expect(clicked).toHaveLength(0);
  });
});

describe('sign out of all devices', () => {
  it('signs out everywhere and returns to the sign-in card', async () => {
    const server = signedInServer({ 'POST /api/auth/logout-all': noContent });
    await openAccount();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out of all devices' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
    expect(callsTo(server, 'POST /api/auth/logout-all')).toHaveLength(1);
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
  });

  it('stays signed in and explains, when the server cannot be reached', async () => {
    signedInServer({
      'POST /api/auth/logout-all': () => {
        throw new TypeError('offline');
      },
    });
    await openAccount();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out of all devices' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not reach the server/i);
    expect(screen.getByRole('heading', { name: 'Your account' })).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Sign out of all devices' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
});

describe('delete my account', () => {
  const accepted = () =>
    json(
      { requestedAt: '2026-11-17T12:00:00.000Z', scheduledFor: '2026-12-01T12:00:00.000Z' },
      202,
    );

  it('starts closed: no confirmation box until the person asks for it', async () => {
    const server = signedInServer();
    await openAccount();
    expect(screen.queryByLabelText(/To confirm, type DELETE/)).toBeNull();
    expect(screen.getByText(/You then have 14 days to change your mind/)).toBeTruthy();
    expect(callsTo(server, 'POST /api/me/delete')).toHaveLength(0);
  });

  it('keeps the final button disabled until something is typed', async () => {
    signedInServer();
    await openAccount();
    const input = await openDeleteForm();
    const confirm = screen.getByRole('button', { name: 'Delete my account' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(input, { target: { value: '   ' } });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(input, { target: { value: 'DELETE' } });
    expect(confirm.disabled).toBe(false);
  });

  it('closes on Cancel without telling the server anything', async () => {
    const server = signedInServer();
    await openAccount();
    const input = await openDeleteForm();
    fireEvent.change(input, { target: { value: 'DELETE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText(/To confirm, type DELETE/)).toBeNull();
    expect(callsTo(server, 'POST /api/me/delete')).toHaveLength(0);
    // Opening it again starts empty.
    expect(((await openDeleteForm()) as HTMLInputElement).value).toBe('');
  });

  it('sends the confirmation, signs out, and says when the account will be erased', async () => {
    const server = signedInServer({ 'POST /api/me/delete': accepted });
    await openAccount();
    fireEvent.change(await openDeleteForm(), { target: { value: 'DELETE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
    const call = callsTo(server, 'POST /api/me/delete')[0];
    const init = call?.[1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ confirmation: 'DELETE' });
    expect(init.credentials).toBe('same-origin');

    const notice = screen.getByText(/scheduled for deletion on/);
    expect(notice.getAttribute('role')).toBe('status'); // announced to screen readers
    expect(notice.textContent).toMatch(/scheduled for deletion on 1 December 2026/);
    expect(notice.textContent).toMatch(/Sign in again before then and it will be cancelled/);
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
  });

  it('also accepts the person’s email address as the confirmation', async () => {
    const server = signedInServer({ 'POST /api/me/delete': accepted });
    await openAccount();
    fireEvent.change(await openDeleteForm(), { target: { value: 'ada@gmail.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    await screen.findByRole('heading', { name: 'Sign in' });
    const init = callsTo(server, 'POST /api/me/delete')[0]?.[1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ confirmation: 'ada@gmail.com' });
  });

  it('cannot be submitted twice while the first request is still running', async () => {
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => (finish = resolve));
    const server = signedInServer({
      'POST /api/me/delete': async () => {
        await gate;
        return accepted();
      },
    });
    await openAccount();
    fireEvent.change(await openDeleteForm(), { target: { value: 'DELETE' } });
    const confirm = screen.getByRole('button', { name: 'Delete my account' });
    fireEvent.click(confirm);
    const busy = (await screen.findByRole('button', { name: 'Deleting…' })) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    fireEvent.click(busy);
    finish();
    await screen.findByRole('heading', { name: 'Sign in' });
    expect(callsTo(server, 'POST /api/me/delete')).toHaveLength(1);
  });

  it('explains a wrong confirmation and keeps the form open, still signed in', async () => {
    signedInServer({
      'POST /api/me/delete': () => json({ error: 'confirmation_incorrect' }, 422),
    });
    await openAccount();
    const input = await openDeleteForm();
    fireEvent.change(input, { target: { value: 'delete' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/does not match/i);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('heading', { name: 'Your account' })).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Delete my account' }) as HTMLButtonElement).disabled,
    ).toBe(false); // they can correct it and try again
  });

  it('asks for a fresh sign-in when the old one is too old, and offers to start it', async () => {
    const server = signedInServer({
      'POST /api/me/delete': () => json({ error: 'recent_sign_in_required' }, 403),
    });
    await openAccount();
    fireEvent.change(await openDeleteForm(), { target: { value: 'DELETE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/needs a recent sign-in/i);
    expect(alert.textContent).not.toContain('_');

    fireEvent.click(within(alert).getByRole('button', { name: 'Sign out and sign in again' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
    expect(callsTo(server, 'POST /api/auth/logout')).toHaveLength(1);
  });

  it('tells the only administrator why they cannot delete yet', async () => {
    signedInServer({ 'POST /api/me/delete': () => json({ error: 'last_admin' }, 409) });
    await openAccount();
    fireEvent.change(await openDeleteForm(), { target: { value: 'DELETE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/only administrator/i);
    expect(screen.getByRole('heading', { name: 'Your account' })).toBeTruthy();
  });

  it('explains when the server cannot be reached, and nothing is deleted', async () => {
    signedInServer({
      'POST /api/me/delete': () => {
        throw new TypeError('offline');
      },
    });
    await openAccount();
    fireEvent.change(await openDeleteForm(), { target: { value: 'DELETE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not reach the server/i);
    expect(screen.getByRole('heading', { name: 'Your account' })).toBeTruthy();
  });
});

describe('welcome back after cancelling a deletion', () => {
  async function signInWithGoogle() {
    await screen.findByRole('heading', { name: 'Sign in' });
    await waitFor(() => expect(initialize).toHaveBeenCalled());
    const config = initialize.mock.calls.at(-1)?.[0] as {
      callback: (r: { credential: string }) => void;
    };
    await act(async () => {
      config.callback({ credential: 'google-id-token-0123456789' });
    });
  }

  it('says the deletion was cancelled, and the message can be dismissed', async () => {
    fakeServer({
      ...signedOutRoutes(),
      'POST /api/auth/google': () => json({ user: ada, isNewUser: false, deletionCancelled: true }),
      'GET /api/me/journey': () => json({ journey }),
    });
    render(<App />);
    await signInWithGoogle();

    const notice = await screen.findByText(/Your account deletion has been cancelled/);
    expect(notice.textContent).toMatch(/Nothing was lost/);
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByText(/Your account deletion has been cancelled/)).toBeNull();
    expect(screen.getByRole('heading', { name: 'Welcome, Ada' })).toBeTruthy();
  });

  it('says nothing about deletion on an ordinary sign-in', async () => {
    fakeServer({
      ...signedOutRoutes(),
      'POST /api/auth/google': () => json({ user: ada, isNewUser: false }),
      'GET /api/me/journey': () => json({ journey }),
    });
    render(<App />);
    await signInWithGoogle();
    await screen.findByRole('heading', { name: 'Welcome, Ada' });
    expect(screen.queryByText(/deletion/i)).toBeNull();
  });
});

describe('plain connection to the system status panel', () => {
  it('still reports health on Home after visiting Account and coming back', async () => {
    fakeServer({
      ...signedOutRoutes(),
      'GET /api/auth/me': () => json({ user: ada }),
      'GET /api/me/journey': () => json({ journey }),
      'GET /api/health': () => json(health('up')),
    });
    render(<App />);
    await screen.findByText('Connected — everything is working.');
    fireEvent.click(screen.getByRole('link', { name: 'Account' }));
    await screen.findByRole('heading', { name: 'Your account' });
    fireEvent.click(screen.getByRole('link', { name: 'Home' }));
    expect(await screen.findByText('Connected — everything is working.')).toBeTruthy();
  });
});
