import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicUser } from '@scholars/shared';
import App from './App';
import { ada, fakeServer, health, json } from './testUtils';

vi.mock('./gsi', () => ({ loadGoogleIdentity: () => Promise.reject(new Error('not needed')) }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const emptyJourney = {
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

const fullJourney = {
  state: 'Rivers',
  schoolName: 'Government College',
  exams: [{ type: 'jamb', date: '2027-03-14' }],
  subjects: ['English', 'Mathematics'],
  courseInterest: 'Medicine',
  universityInterests: ['UNIPORT'],
  dailyStudyGoalMinutes: 60,
  preferredStudyTime: 'evening',
  qualityLevel: 'high',
  completedAt: '2026-11-01T10:00:00.000Z',
};

function homeRoutes(
  user: PublicUser,
  journey: Response | (() => Response | Promise<Response>) | null,
) {
  return {
    'GET /api/auth/me': () => json({ user }),
    'GET /api/health': () => json(health('up')),
    ...(journey
      ? { 'GET /api/me/journey': typeof journey === 'function' ? journey : () => journey.clone() }
      : {}),
  };
}

const journeyOf = (journey: object) => () => json({ journey });

describe('home screen (signed in, onboarding finished)', () => {
  it('greets the person with their photo-or-initials, email, level and roles', async () => {
    fakeServer(homeRoutes({ ...ada, level: 'ss3' }, journeyOf(emptyJourney)));
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Welcome, Ada' })).toBeTruthy();
    expect(screen.getByText('ada@gmail.com')).toBeTruthy();
    const badges = within(screen.getByRole('list', { name: 'Your roles and level' }));
    expect(badges.getByText('SS3')).toBeTruthy();
    expect(badges.getByText('Student')).toBeTruthy();
  });

  it('shows the brand name once, as the page heading, and drops the plain header', async () => {
    fakeServer(homeRoutes(ada, journeyOf(emptyJourney)));
    render(<App />);
    await screen.findByRole('heading', { name: 'Welcome, Ada' });
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]?.textContent).toBe('Scholars Syndicate');
    expect(screen.queryByText(/Your guide from secondary school/)).toBeNull();
  });

  it('shows real progress and the filled-in journey cards', async () => {
    const partial = {
      ...emptyJourney,
      state: 'Rivers',
      subjects: ['English'],
      schoolName: 'Unity',
    };
    fakeServer(homeRoutes(ada, journeyOf(partial)));
    render(<App />);
    expect(await screen.findByText('Your journey is 38% set up')).toBeTruthy();
    const bar = screen.getByRole('progressbar', { name: 'Journey profile completion' });
    expect(bar.getAttribute('aria-valuenow')).toBe('38');

    const cards = within(screen.getByRole('list', { name: 'Your journey' }));
    expect(cards.getByText('Unity, Rivers')).toBeTruthy();
    expect(cards.getByText('English')).toBeTruthy();
    expect(cards.getAllByText('Not added yet')).toHaveLength(3); // exams, course, routine
  });

  it('says so, plainly, when everything is empty', async () => {
    fakeServer(homeRoutes(ada, journeyOf(emptyJourney)));
    render(<App />);
    expect(await screen.findByText('Your journey is 0% set up')).toBeTruthy();
    const cards = within(screen.getByRole('list', { name: 'Your journey' }));
    expect(cards.getAllByText('Not added yet')).toHaveLength(5);
  });

  it('celebrates a complete journey', async () => {
    fakeServer(homeRoutes(ada, journeyOf(fullJourney)));
    render(<App />);
    expect(await screen.findByText('Your journey profile is complete')).toBeTruthy();
    const cards = within(screen.getByRole('list', { name: 'Your journey' }));
    expect(cards.getByText('JAMB · 14 Mar 2027')).toBeTruthy();
    expect(cards.getByText('Medicine · UNIPORT')).toBeTruthy();
    expect(cards.getByText('1 h a day · Evening')).toBeTruthy();
    expect(screen.queryByText('Not added yet')).toBeNull();
  });

  it('shows a loading placeholder first, then the journey', async () => {
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => (finish = resolve));
    fakeServer(
      homeRoutes(ada, async () => {
        await gate;
        return json({ journey: emptyJourney });
      }),
    );
    render(<App />);
    await screen.findByRole('heading', { name: 'Welcome, Ada' });
    expect(screen.getByLabelText('Loading your journey').getAttribute('aria-busy')).toBe('true');
    finish();
    expect(await screen.findByText('Your journey is 0% set up')).toBeTruthy();
    expect(screen.queryByLabelText('Loading your journey')).toBeNull();
  });

  it('still works, with no error shown, when the journey cannot be loaded', async () => {
    fakeServer(homeRoutes(ada, null)); // the fake server answers 404 for the journey
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Welcome, Ada' })).toBeTruthy();
    await waitFor(() => expect(screen.queryByLabelText('Loading your journey')).toBeNull());
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
  });

  it('does not ask for a journey from someone who is not a student', async () => {
    const server = fakeServer(homeRoutes({ ...ada, roles: ['admin'] }, journeyOf(emptyJourney)));
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Welcome, Ada' })).toBeTruthy();
    expect(screen.getByText('Admin')).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(server.mock.calls.some(([url]) => String(url).includes('/api/me/journey'))).toBe(false);
  });

  it('keeps showing the system status panel', async () => {
    fakeServer(homeRoutes(ada, journeyOf(emptyJourney)));
    render(<App />);
    expect(await screen.findByText('Connected — everything is working.')).toBeTruthy();
  });
});

describe('home cards open the matching step', () => {
  const putCalls = (server: ReturnType<typeof fakeServer>) =>
    server.mock.calls.filter(([url, init]) => url === '/api/me/journey' && init?.method === 'PUT');

  it('offers Add on an empty card and Edit on a filled one', async () => {
    fakeServer(homeRoutes(ada, journeyOf({ ...emptyJourney, subjects: ['English'] })));
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Add school' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit subjects' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Add / })).toHaveLength(4);
  });

  it('opens only the chosen step, saves it, returns home and updates the progress bar', async () => {
    const server = fakeServer({
      ...homeRoutes(ada, journeyOf(emptyJourney)),
      'PUT /api/me/journey': () =>
        json({ journey: { ...emptyJourney, exams: [{ type: 'jamb', date: null }] } }),
    });
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add exams' }));

    const heading = await screen.findByRole('heading', { name: 'Update: Exams' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    // Not the onboarding flow: no step counter, no Skip, no Back, never finishes onboarding.
    expect(screen.queryByText(/Step \d of 5/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Skip/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();

    fireEvent.click(screen.getByRole('checkbox', { name: 'JAMB' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Your journey is 13% set up')).toBeTruthy();
    const body = JSON.parse(String(putCalls(server)[0]?.[1]?.body));
    expect(body).toEqual({ exams: [{ type: 'jamb', date: null }] });
    expect(server.mock.calls.some(([url]) => String(url).includes('/complete'))).toBe(false);
    expect(screen.getByText('JAMB')).toBeTruthy();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Edit exams' })),
    );
  });

  it('Cancel changes nothing and saves nothing', async () => {
    const server = fakeServer(homeRoutes(ada, journeyOf(emptyJourney)));
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add subjects' }));
    await screen.findByRole('heading', { name: 'Update: Subjects' });
    fireEvent.change(screen.getByLabelText('Subjects'), { target: { value: 'Physics' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(await screen.findByText('Your journey is 0% set up')).toBeTruthy();
    expect(putCalls(server)).toHaveLength(0);
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add subjects' })),
    );
  });

  it('keeps the person on the step with a plain message when saving fails', async () => {
    fakeServer({
      ...homeRoutes(ada, journeyOf(emptyJourney)),
      'PUT /api/me/journey': () => json({ error: 'internal_error' }, 500),
    });
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add study routine' }));
    await screen.findByRole('heading', { name: 'Update: Study routine' });
    fireEvent.change(screen.getByLabelText('Daily study goal (minutes)'), {
      target: { value: '45' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Update: Study routine' })).toBeTruthy();
  });
});
