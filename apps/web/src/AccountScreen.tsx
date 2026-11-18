import { useState, type FormEvent } from 'react';
import { DELETION_GRACE_DAYS, type PublicUser } from '@scholars/shared';
import { ApiError, NetworkError, exportMyData, requestAccountDeletion } from './api';
import { useAuth } from './auth';
import { saveJsonFile } from './download';
import { CapIcon, DevicesIcon, DownloadIcon, TrashIcon } from './icons';
import { messageForDeletionError, messageForError } from './messages';

type Status =
  { kind: 'idle' } | { kind: 'busy' } | { kind: 'done' } | { kind: 'error'; text: string };
const IDLE: Status = { kind: 'idle' };

function codeOf(err: unknown): string {
  if (err instanceof ApiError) return err.code;
  if (err instanceof NetworkError) return 'network';
  return 'unknown_error';
}

/** Account controls: download my data, sign out of every device, and delete my account. */
export function AccountScreen({ user }: { user: PublicUser }) {
  const { signOut, signOutEverywhere, accountDeleted } = useAuth();

  const [download, setDownload] = useState<Status>(IDLE);
  const [devices, setDevices] = useState<Status>(IDLE);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteCode, setDeleteCode] = useState<string | null>(null);

  async function handleDownload() {
    setDownload({ kind: 'busy' });
    try {
      const data = await exportMyData();
      saveJsonFile('scholars-syndicate-my-data.json', data);
      setDownload({ kind: 'done' });
    } catch (err) {
      setDownload({ kind: 'error', text: messageForError(codeOf(err)) });
    }
  }

  async function handleSignOutEverywhere() {
    setDevices({ kind: 'busy' });
    const ok = await signOutEverywhere();
    // On success the whole screen is replaced by the sign-in card, so only a failure needs showing.
    if (!ok) setDevices({ kind: 'error', text: messageForError('network') });
  }

  async function handleDelete(event: FormEvent) {
    event.preventDefault();
    if (deleting || confirmation.trim() === '') return;
    setDeleting(true);
    setDeleteCode(null);
    try {
      const result = await requestAccountDeletion(confirmation);
      accountDeleted(result.scheduledFor);
    } catch (err) {
      setDeleteCode(codeOf(err));
      setDeleting(false);
    }
  }

  function closeDelete() {
    setDeleteOpen(false);
    setConfirmation('');
    setDeleteCode(null);
  }

  const needsFreshSignIn =
    deleteCode === 'recent_sign_in_required' || deleteCode === 'not_signed_in';

  return (
    <section className="home account" aria-labelledby="account-title">
      <div className="hero hero-compact">
        <h1 className="hero-brand">
          <CapIcon size={20} />
          <span>Scholars Syndicate</span>
        </h1>
      </div>

      <div className="account-head">
        <h2 id="account-title" tabIndex={-1}>
          Your account
        </h2>
        <p className="meta">Signed in as {user.email}</p>
      </div>

      <section className="account-card" aria-labelledby="data-title">
        <span className="tile tone-blue">
          <DownloadIcon />
        </span>
        <h3 id="data-title">Your data</h3>
        <p>Download a copy of the information we keep about you, as a file on your own device.</p>
        <button
          type="button"
          className="btn-outline"
          onClick={handleDownload}
          disabled={download.kind === 'busy'}
        >
          {download.kind === 'busy' ? 'Preparing your file…' : 'Download my data'}
        </button>
        {download.kind === 'done' && (
          <p className="status-ok" role="status">
            Done. Your file was saved to your device.
          </p>
        )}
        {download.kind === 'error' && (
          <p className="alert" role="alert">
            {download.text}
          </p>
        )}
      </section>

      <section className="account-card" aria-labelledby="devices-title">
        <span className="tile tone-green">
          <DevicesIcon />
        </span>
        <h3 id="devices-title">Your devices</h3>
        <p>Signed in on a phone or computer you no longer use? Sign out of all of them at once.</p>
        <button
          type="button"
          className="btn-outline"
          onClick={handleSignOutEverywhere}
          disabled={devices.kind === 'busy'}
        >
          {devices.kind === 'busy' ? 'Signing out…' : 'Sign out of all devices'}
        </button>
        {devices.kind === 'error' && (
          <p className="alert" role="alert">
            {devices.text}
          </p>
        )}
      </section>

      <section className="account-card account-card-danger" aria-labelledby="delete-title">
        <span className="tile tone-red">
          <TrashIcon />
        </span>
        <h3 id="delete-title">Delete my account</h3>
        <p>
          We lock your account and sign you out everywhere. You then have {DELETION_GRACE_DAYS} days
          to change your mind: just sign in again and the deletion is cancelled. After that, your
          account and everything saved in it are erased for good.
        </p>

        {!deleteOpen && (
          <button type="button" className="btn-danger-outline" onClick={() => setDeleteOpen(true)}>
            Delete my account
          </button>
        )}

        {deleteOpen && (
          <form onSubmit={handleDelete} noValidate>
            <div className="field">
              <label htmlFor="delete-confirmation">
                To confirm, type DELETE or your email address
              </label>
              <input
                id="delete-confirmation"
                type="text"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={deleteCode === 'confirmation_incorrect' ? true : undefined}
                aria-describedby={deleteCode ? 'delete-error' : undefined}
              />
            </div>

            {deleteCode && (
              <div className="alert" role="alert" id="delete-error">
                <p>{messageForDeletionError(deleteCode)}</p>
                {needsFreshSignIn && (
                  <button type="button" onClick={() => void signOut()}>
                    Sign out and sign in again
                  </button>
                )}
              </div>
            )}

            <div className="button-row">
              <button
                type="submit"
                className="btn-danger"
                disabled={deleting || confirmation.trim() === ''}
              >
                {deleting ? 'Deleting…' : 'Delete my account'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={closeDelete}
                disabled={deleting}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>
    </section>
  );
}
