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

export default function App() {
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
    <main className="page">
      <header>
        <h1>Scholars Syndicate</h1>
        <p className="tagline">Your guide from secondary school to university.</p>
      </header>

      <section className="card" aria-labelledby="status-title">
        <h2 id="status-title">Foundation check</h2>
        <p className={`status status-${status.tone}`} role="status">
          {status.text}
        </p>
        {state.kind === 'ready' && <p className="meta">API version {state.health.version}</p>}
        {state.kind !== 'loading' && (
          <button type="button" onClick={retry}>
            Check again
          </button>
        )}
      </section>
    </main>
  );
}
