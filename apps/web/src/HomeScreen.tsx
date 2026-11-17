import { useEffect, useState } from 'react';
import type { PublicUser } from '@scholars/shared';
import { getJourney } from './api';
import { useAuth } from './auth';
import { BookIcon, CalendarIcon, CapIcon, ClockIcon, MailIcon, SchoolIcon } from './icons';
import { journeyCompletion, summaryCards, type CardIcon, type JourneyData } from './journeySummary';
import { messageForError } from './messages';

function firstName(user: PublicUser): string {
  return (user.displayName ?? user.fullName).trim().split(/\s+/)[0] ?? 'there';
}

function initials(user: PublicUser): string {
  const parts = user.fullName.trim().split(/\s+/);
  return (
    (parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')
  ).toUpperCase();
}

function Avatar({ user }: { user: PublicUser }) {
  const [broken, setBroken] = useState(false);
  if (user.avatarUrl && !broken) {
    return (
      <img
        className="home-avatar"
        src={user.avatarUrl}
        alt=""
        width={92}
        height={92}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <div className="home-avatar home-avatar-fallback" aria-hidden="true">
      {initials(user)}
    </div>
  );
}

const LEVEL_LABELS: Record<string, string> = {
  jss: 'JSS',
  ss1: 'SS1',
  ss2: 'SS2',
  ss3: 'SS3',
  jamb_candidate: 'JAMB candidate',
  university_student: 'University student',
  other: 'Other',
};

const ROLE_LABELS: Record<string, string> = {
  student: 'Student',
  parent: 'Parent',
  teacher: 'Teacher',
  school: 'School',
  university: 'University',
  mentor: 'Mentor',
  staff: 'Staff',
  admin: 'Admin',
};

const ICONS: Record<CardIcon, () => React.JSX.Element> = {
  school: () => <SchoolIcon />,
  calendar: () => <CalendarIcon />,
  book: () => <BookIcon />,
  cap: () => <CapIcon />,
  clock: () => <ClockIcon />,
};

type JourneyState =
  { kind: 'loading' } | { kind: 'ready'; journey: JourneyData } | { kind: 'unavailable' };

/** Loads the student's own journey. Any failure just hides the journey section: the home screen still works. */
function useJourney(enabled: boolean): JourneyState {
  const [state, setState] = useState<JourneyState>(
    enabled ? { kind: 'loading' } : { kind: 'unavailable' },
  );
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    getJourney(controller.signal)
      .then((response) => setState({ kind: 'ready', journey: response.journey }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ kind: 'unavailable' });
      });
    return () => controller.abort();
  }, [enabled]);
  return state;
}

function JourneySection({ journey }: { journey: JourneyData }) {
  const { percent } = journeyCompletion(journey);
  const complete = percent === 100;
  return (
    <>
      <section className="home-progress" aria-labelledby="journey-progress-title">
        <h3 id="journey-progress-title">
          {complete ? 'Your journey profile is complete' : `Your journey is ${percent}% set up`}
        </h3>
        <p className="meta">
          {complete
            ? 'Nice work. We can guide you better with everything filled in.'
            : 'The more we know, the better we can guide you from here to university.'}
        </p>
        <div
          className="progress-track"
          role="progressbar"
          aria-label="Journey profile completion"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div className="progress-fill" style={{ width: `${percent}%` }} />
        </div>
      </section>

      <ul className="home-cards" aria-label="Your journey">
        {summaryCards(journey).map((card) => {
          const Draw = ICONS[card.icon];
          return (
            <li key={card.key} className="home-card">
              <span className={`tile tone-${card.tone}`}>
                <Draw />
              </span>
              <h4>{card.title}</h4>
              <p className={card.value ? 'card-value' : 'card-value card-value-empty'}>
                {card.value ?? 'Not added yet'}
              </p>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function HomeScreen({ user }: { user: PublicUser }) {
  const { signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isStudent = user.roles.includes('student');
  const journey = useJourney(isStudent);

  async function handleSignOut() {
    setBusy(true);
    setError(null);
    const ok = await signOut();
    if (!ok) {
      setBusy(false);
      setError(messageForError('network'));
    }
  }

  return (
    <section className="home" aria-labelledby="welcome-title">
      <div className="hero">
        <h1 className="hero-brand">
          <CapIcon size={20} />
          <span>Scholars Syndicate</span>
        </h1>
      </div>

      <div className="home-body">
        <Avatar user={user} />
        <h2 id="welcome-title">Welcome, {firstName(user)}</h2>
        <p className="home-email">
          <MailIcon size={16} />
          <span>{user.email}</span>
        </p>

        <ul className="badges" aria-label="Your roles and level">
          {user.level && <li className="badge badge-level">{LEVEL_LABELS[user.level]}</li>}
          {user.roles.map((role) => (
            <li key={role} className="badge">
              {ROLE_LABELS[role] ?? role}
            </li>
          ))}
        </ul>

        <button type="button" className="btn-outline" onClick={handleSignOut} disabled={busy}>
          {busy ? 'Signing out…' : 'Sign out'}
        </button>
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
      </div>

      {journey.kind === 'loading' && (
        <div className="home-skeleton" aria-busy="true" aria-label="Loading your journey" />
      )}
      {journey.kind === 'ready' && <JourneySection journey={journey.journey} />}

      <p className="home-note">More learning features are on the way.</p>
    </section>
  );
}
