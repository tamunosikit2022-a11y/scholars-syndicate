import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CURRENT_TERMS_VERSION } from '@scholars/shared';
import App from './App';
import { ada, fakeServer, freshAda, health, json } from './testUtils';

vi.mock('./gsi', () => ({ loadGoogleIdentity: () => new Promise(() => {}) }));

const PUT = 'PUT /api/me/essentials';

beforeEach(() => {
  // A fixed "today" makes every age calculation exact: it is 10 November 2026.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-10T09:00:00.000Z'));
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.unstubAllGlobals();
});

const savedUser = {
  ...ada,
  displayName: 'Ada',
  level: 'jamb_candidate',
  onboardingStage: 1,
} as const;

function server(extra: Record<string, () => Response | Promise<Response>> = {}) {
  return fakeServer({
    'GET /api/auth/me': () => json({ user: freshAda }),
    'GET /api/health': () => json(health('up')),
    [PUT]: () => json({ user: savedUser }),
    ...extra,
  });
}

const pick = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

function chooseBirthday(day: string, month: string, year: string) {
  pick('Day', day);
  pick('Month', month);
  pick('Year', year);
}

async function openForm() {
  render(<App />);
  await screen.findByRole('heading', { name: 'Tell us about you' });
}

async function fillAdultForm() {
  await openForm();
  chooseBirthday('17', '5', '2000');
  fireEvent.click(screen.getByLabelText('JAMB candidate'));
  fireEvent.click(screen.getByLabelText(/I agree to the Terms/));
}

type Server = ReturnType<typeof server>;
const putCall = (fn: Server) =>
  fn.mock.calls.find(([url, init]) => url === '/api/me/essentials' && init?.method === 'PUT');
const putBody = (fn: Server) => JSON.parse(putCall(fn)?.[1]?.body as string);
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

describe('the essentials form', () => {
  it('appears for a brand-new student, with their first name suggested', async () => {
    server();
    await openForm();
    expect((screen.getByLabelText('Display name') as HTMLInputElement).value).toBe('Ada');
    expect(screen.queryByRole('heading', { name: /Welcome/ })).toBeNull();
  });

  it('does not appear for someone who already finished it', async () => {
    server({ 'GET /api/auth/me': () => json({ user: ada }) });
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Welcome, Ada' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Tell us about you' })).toBeNull();
  });

  it('shows no errors until the first Continue, then lists every problem and focuses the first', async () => {
    const fn = server();
    await openForm();
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: '' } });
    expect(screen.queryByRole('alert')).toBeNull();

    submit();
    expect(await screen.findByText('Enter a display name.')).toBeTruthy();
    expect(screen.getByText('Choose your day, month and year of birth.')).toBeTruthy();
    expect(screen.getByText('Choose where you are on your journey.')).toBeTruthy();
    expect(screen.getByText(/agree to the Terms and Privacy Policy to continue/)).toBeTruthy();
    expect(putCall(fn)).toBeUndefined(); // nothing was sent
    expect(document.activeElement?.id).toBe('onb-displayName');
  });

  it('clears an error as soon as the person fixes it', async () => {
    server();
    await openForm();
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: '' } });
    submit();
    await screen.findByText('Enter a display name.');
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Dee' } });
    expect(screen.queryByText('Enter a display name.')).toBeNull();
  });

  it('offers birth years from 10 years ago back to 100 years ago', async () => {
    server();
    await openForm();
    const options = Array.from((screen.getByLabelText('Year') as HTMLSelectElement).options).map(
      (o) => o.value,
    );
    expect(options[0]).toBe('');
    expect(options[1]).toBe('2016');
    expect(options.at(-1)).toBe('1926');
  });

  it('shows the draft Terms and Privacy Policy, clearly marked as a draft', async () => {
    server();
    await openForm();
    expect(screen.getByText(/DRAFT — this text has not been reviewed by a lawyer/)).toBeTruthy();
    expect(screen.getByText('If you are under 18')).toBeTruthy();
    expect(screen.getByText('Who can see it')).toBeTruthy();
  });
});

describe('under-18 students', () => {
  it('see the guardian checkbox only while their age is under 18', async () => {
    server();
    await openForm();
    expect(screen.queryByLabelText(/parent or guardian knows/)).toBeNull();
    chooseBirthday('17', '5', '2000'); // 26
    expect(screen.queryByLabelText(/parent or guardian knows/)).toBeNull();
    pick('Year', '2010'); // 16
    expect(screen.getByLabelText(/parent or guardian knows/)).toBeTruthy();
    pick('Year', '2000');
    expect(screen.queryByLabelText(/parent or guardian knows/)).toBeNull();
  });

  it('are treated as adults on the day they turn 18, but not the day before', async () => {
    server();
    await openForm();
    chooseBirthday('10', '11', '2008'); // turns 18 today (10 Nov 2026)
    expect(screen.queryByLabelText(/parent or guardian knows/)).toBeNull();
    pick('Day', '11'); // turns 18 tomorrow
    expect(screen.getByLabelText(/parent or guardian knows/)).toBeTruthy();
  });

  it('cannot continue without confirming, and the confirmation is sent when given', async () => {
    const fn = server();
    await openForm();
    chooseBirthday('17', '5', '2010');
    fireEvent.click(screen.getByLabelText('SS3'));
    fireEvent.click(screen.getByLabelText(/I agree to the Terms/));

    submit();
    expect(
      await screen.findByText(/confirm that a parent or guardian knows and allows it/),
    ).toBeTruthy();
    expect(putCall(fn)).toBeUndefined();
    expect(document.activeElement?.id).toBe('onb-guardian');

    fireEvent.click(screen.getByLabelText(/parent or guardian knows/));
    submit();
    await screen.findByRole('heading', { name: 'Welcome, Ada' });
    expect(putBody(fn)).toMatchObject({
      dateOfBirth: '2010-05-17',
      level: 'ss3',
      guardianConsent: true,
    });
  });

  it('are told if they are younger than the minimum age', async () => {
    const fn = server();
    await openForm();
    chooseBirthday('31', '12', '2016'); // 9 years old on 10 Nov 2026
    fireEvent.click(screen.getByLabelText('JSS (junior secondary)'));
    fireEvent.click(screen.getByLabelText(/I agree to the Terms/));
    submit();
    expect(
      await screen.findByText('Scholars Syndicate is for students aged 10 and over.'),
    ).toBeTruthy();
    expect(putCall(fn)).toBeUndefined();
  });
});

describe('saving', () => {
  it('sends the tidied answers and then shows the welcome screen', async () => {
    const fn = server();
    await fillAdultForm();
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: '  Ada    O. ' } });
    submit();

    expect(await screen.findByRole('heading', { name: 'Welcome, Ada' })).toBeTruthy();
    expect(screen.getByText('Level: JAMB candidate')).toBeTruthy();
    expect(putBody(fn)).toEqual({
      displayName: 'Ada O.',
      dateOfBirth: '2000-05-17',
      level: 'jamb_candidate',
      acceptTerms: true,
      termsVersion: CURRENT_TERMS_VERSION,
    });
    const init = putCall(fn)?.[1] as RequestInit;
    expect(init.credentials).toBe('same-origin');
  });

  it('shows "Saving…" and cannot be pressed twice while the request is in flight', async () => {
    let finish: (r: Response) => void = () => {};
    const fn = server({ [PUT]: () => new Promise<Response>((resolve) => (finish = resolve)) });
    await fillAdultForm();
    submit();
    const button = (await screen.findByRole('button', { name: 'Saving…' })) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    finish(json({ user: savedUser }));
    await screen.findByRole('heading', { name: 'Welcome, Ada' });
    expect(fn.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1);
  });

  it('puts the server’s field errors under the right fields', async () => {
    server({
      [PUT]: () => json({ error: 'validation_failed', fields: { displayName: 'reserved' } }, 422),
    });
    await fillAdultForm();
    submit();
    expect(
      await screen.findByText('Please choose a different name. This one is reserved.'),
    ).toBeTruthy();
    expect(screen.getByText(/Some answers need another look/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Tell us about you' })).toBeTruthy();
    expect(document.activeElement?.id).toBe('onb-displayName');
  });

  it('explains a date of birth that is already locked', async () => {
    server({ [PUT]: () => json({ error: 'date_of_birth_locked' }, 409) });
    await fillAdultForm();
    submit();
    expect((await screen.findByRole('alert')).textContent).toMatch(
      /already saved and cannot be changed/,
    );
  });

  it('keeps the answers and explains when the server cannot be reached', async () => {
    server({
      [PUT]: () => {
        throw new TypeError('offline');
      },
    });
    await fillAdultForm();
    submit();
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not reach the server/);
    expect((screen.getByLabelText('Day') as HTMLSelectElement).value).toBe('17');
    expect((screen.getByLabelText('JAMB candidate') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('goes back to the sign-in card if the session ended', async () => {
    let meCalls = 0;
    server({
      'GET /api/auth/me': () => {
        meCalls += 1;
        return meCalls === 1 ? json({ user: freshAda }) : json({ error: 'not_signed_in' }, 401);
      },
      'GET /api/auth/config': () => json({ googleClientId: 'cid.apps.googleusercontent.com' }),
      [PUT]: () => json({ error: 'not_signed_in' }, 401),
    });
    await fillAdultForm();
    submit();
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
  });
});
