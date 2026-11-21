import { useEffect, useRef, useState } from 'react';
import { loadGoogleIdentity } from './gsi';

interface Props {
  clientId: string;
  /** Called with Google's signed ID token after the person picks their account. */
  onCredential: (idToken: string) => void;
}

/** Google's own "Sign in with Google" button, loaded only when this screen is shown. */
export function GoogleButton({ clientId, onCredential }: Props) {
  const holder = useRef<HTMLDivElement>(null);
  const latest = useRef(onCredential);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    latest.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    let cancelled = false;
    loadGoogleIdentity()
      .then((google) => {
        if (cancelled || !holder.current) return;
        google.initialize({
          client_id: clientId,
          callback: (response) => latest.current(response.credential),
          auto_select: false,
        });
        google.renderButton(holder.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'pill',
          logo_alignment: 'left',
          width: 280,
        });
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('failed');
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, attempt]);

  return (
    <div className="google-button">
      <div ref={holder} />
      {status === 'loading' && <p className="hint">Loading Google sign-in…</p>}
      {status === 'failed' && (
        <div className="alert" role="alert">
          <p>We could not load Google sign-in. Check your internet connection.</p>
          <button
            type="button"
            onClick={() => {
              setStatus('loading');
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
