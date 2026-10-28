import { AuthProvider, useAuth } from './auth';
import { SignInCard } from './SignInCard';
import { SystemStatus } from './SystemStatus';
import { WelcomeCard } from './WelcomeCard';
import { messageForError } from './messages';

function AuthGate() {
  const { state, recheck } = useAuth();

  switch (state.kind) {
    case 'loading':
      return (
        <section className="card" aria-busy="true">
          <p className="hint" role="status">
            Checking your sign-in…
          </p>
        </section>
      );
    case 'unreachable':
      return (
        <section className="card">
          <p className="alert" role="alert">
            {messageForError('network')}
          </p>
          <button type="button" onClick={recheck}>
            Try again
          </button>
        </section>
      );
    case 'signedOut':
      return <SignInCard />;
    case 'signedIn':
      return <WelcomeCard user={state.user} />;
  }
}

export default function App() {
  return (
    <AuthProvider>
      <main className="page">
        <header>
          <h1>Scholars Syndicate</h1>
          <p className="tagline">Your guide from secondary school to university.</p>
        </header>
        <AuthGate />
        <SystemStatus />
      </main>
    </AuthProvider>
  );
}
