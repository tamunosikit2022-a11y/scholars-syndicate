import { useState } from 'react';
import type { PublicUser } from '@scholars/shared';
import { useAuth } from './auth';
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
        className="avatar"
        src={user.avatarUrl}
        alt=""
        width={64}
        height={64}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <div className="avatar avatar-fallback" aria-hidden="true">
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

export function WelcomeCard({ user }: { user: PublicUser }) {
  const { signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <section className="card" aria-labelledby="welcome-title">
      <div className="profile-row">
        <Avatar user={user} />
        <div>
          <h2 id="welcome-title">Welcome, {firstName(user)}</h2>
          <p className="meta">{user.email}</p>
        </div>
      </div>

      <ul className="badges" aria-label="Your roles">
        {user.roles.map((role) => (
          <li key={role} className="badge">
            {ROLE_LABELS[role] ?? role}
          </li>
        ))}
      </ul>

      {user.level && <p className="meta">Level: {LEVEL_LABELS[user.level]}</p>}
      <p>Your learning profile is saved. More learning features are on the way.</p>

      <button type="button" className="btn-secondary" onClick={handleSignOut} disabled={busy}>
        {busy ? 'Signing out…' : 'Sign out'}
      </button>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
