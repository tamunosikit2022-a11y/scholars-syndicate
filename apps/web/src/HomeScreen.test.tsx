import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
