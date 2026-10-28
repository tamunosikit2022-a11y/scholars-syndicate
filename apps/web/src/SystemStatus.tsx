import { useCallback, useEffect, useState } from 'react';
import type { HealthResponse } from '@scholars/shared';
import { fetchHealth } from './api';

type State = { kind: 'loading' } | { kind: 'ready'; health: HealthResponse } | { kind: 'error' };

function describe(state: State): { tone: 'ok' | 'warn' | 'bad' | 'wait'; text: string } {
  if (state.kind === 'loading') return { tone: 'wait', text: 'Checking the connection…' };
  if (state.kind === 'error') return { tone: 'bad', text: 'Cannot reach the server.' };
  if (state.health.db === 'up') return { tone: 'ok', text: 'Connected — everything is working.' };
  return { tone: 'warn', text: 'Server reachable, but the database is down.' };
}

/** A small "is everything running?" panel, kept from the foundation step. */
export function SystemStatus() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchHealth(controller.signal)
      .then((health) => setState({ kind: 'ready', health }))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setState({ kind: 'error' });
      });
    return () => controller.abort();
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ kind: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  const status = describe(state);

  return (
    <section className="card card-quiet" aria-labelledby="status-title">
      <h2 id="status-title">System status</h2>
      <p className={`status status-${status.tone}`} role="status">
        {status.text}
      </p>
      {state.kind === 'ready' && <p className="meta">API version {state.health.version}</p>}
      {state.kind !== 'loading' && (
        <button type="button" className="btn-secondary" onClick={retry}>
          Check again
        </button>
      )}
    </section>
  );
}
