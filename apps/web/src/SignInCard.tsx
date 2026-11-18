import { useCallback, useEffect, useState } from 'react';
import { getAuthConfig } from './api';
import { useAuth } from './auth';
import { GoogleButton } from './GoogleButton';
import { messageForError } from './messages';

type Config = { kind: 'loading' } | { kind: 'ready'; clientId: string | null } | { kind: 'error' };

const dayFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function formatDay(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : dayFormat.format(date);
}

export function SignInCard() {
  const { state, signIn } = useAuth();
  const [config, setConfig] = useState<Config>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getAuthConfig(controller.signal)
      .then((c) => setConfig({ kind: 'ready', clientId: c.googleClientId }))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setConfig({ kind: 'error' });
      });
    return () => controller.abort();
  }, [attempt]);

  const onCredential = useCallback(
    async (idToken: string) => {
      setError(null);
      setBusy(true);
      const outcome = await signIn(idToken);
      if (!outcome.ok) {
        setBusy(false);
        setError(messageForError(outcome.code));
      }
      // On success the whole screen is replaced by the signed-in view, so nothing else to do.
    },
    [signIn],
  );

  return (
    <section className="card" aria-labelledby="signin-title">
      {state.kind === 'signedOut' && state.notice?.kind === 'deletion_scheduled' && (
        <p className="notice" role="status">
          Your account is scheduled for deletion on {formatDay(state.notice.scheduledFor)}. Changed
          your mind? Sign in again before then and it will be cancelled.
        </p>
      )}
      <h2 id="signin-title">Sign in</h2>
      <p>Continue with your Google account. We never see your Google password.</p>

      {config.kind === 'loading' && <p className="hint">Getting ready…</p>}

      {config.kind === 'error' && (
        <div className="alert" role="alert">
          <p>{messageForError('network')}</p>
          <button
            type="button"
            onClick={() => {
              setConfig({ kind: 'loading' });
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </button>
        </div>
      )}

      {config.kind === 'ready' && config.clientId === null && (
        <p className="alert" role="alert">
          {messageForError('google_sign_in_not_configured')}
        </p>
      )}

      {config.kind === 'ready' && config.clientId !== null && (
        <>
          <GoogleButton clientId={config.clientId} onCredential={onCredential} />
          {busy && (
            <p className="hint" role="status">
              Signing you in…
            </p>
          )}
        </>
      )}

      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
