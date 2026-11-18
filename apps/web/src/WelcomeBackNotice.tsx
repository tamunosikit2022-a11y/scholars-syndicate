import { useAuth } from './auth';

/**
 * Tells someone their account deletion was cancelled by signing in again. Shown on every signed-in
 * screen, because the person may land on any tab (the address can still end in #account from when
 * they asked to delete). Without it they could think the deletion is still going ahead.
 */
export function WelcomeBackNotice() {
  const { state, dismissNotice } = useAuth();
  if (state.kind !== 'signedIn' || state.notice !== 'deletion_cancelled') return null;
  return (
    <div className="notice" role="status">
      <p>
        <strong>Welcome back!</strong> Your account deletion has been cancelled. Nothing was lost.
      </p>
      <button type="button" className="btn-secondary" onClick={dismissNotice}>
        Got it
      </button>
    </div>
  );
}
