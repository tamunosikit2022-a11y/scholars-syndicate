import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { PublicUser } from '@scholars/shared';
import { ApiError, NetworkError, getMe, signInWithGoogle, signOutOnServer } from './api';

export type AuthState =
  | { kind: 'loading' }
  | { kind: 'signedOut' }
  | { kind: 'signedIn'; user: PublicUser }
  | { kind: 'unreachable' };

export type SignInOutcome = { ok: true; isNewUser: boolean } | { ok: false; code: string };

interface AuthContextValue {
  state: AuthState;
  /** Sends Google's token to our server. Never throws: failures come back as { ok: false, code }. */
  signIn(idToken: string): Promise<SignInOutcome>;
  /** Returns false when the server could not be reached (the person stays signed in). */
  signOut(): Promise<boolean>;
  /** Asks the server again who is signed in (used by "Try again"). */
  recheck(): void;
  /** Replaces the signed-in person's details after the server saved a change (e.g. onboarding). */
  updateUser(user: PublicUser): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getMe(controller.signal)
      .then((me) => setState(me ? { kind: 'signedIn', user: me.user } : { kind: 'signedOut' }))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setState({ kind: 'unreachable' });
      });
    return () => controller.abort();
  }, [attempt]);

  const signIn = useCallback(async (idToken: string): Promise<SignInOutcome> => {
    try {
      const result = await signInWithGoogle(idToken);
      setState({ kind: 'signedIn', user: result.user });
      return { ok: true, isNewUser: result.isNewUser };
    } catch (err) {
      if (err instanceof ApiError) return { ok: false, code: err.code };
      if (err instanceof NetworkError) return { ok: false, code: 'network' };
      return { ok: false, code: 'unknown_error' };
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await signOutOnServer();
      setState({ kind: 'signedOut' });
      return true;
    } catch {
      return false;
    }
  }, []);

  const recheck = useCallback(() => {
    setState({ kind: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  const updateUser = useCallback((user: PublicUser) => {
    setState({ kind: 'signedIn', user });
  }, []);

  const value = useMemo(
    () => ({ state, signIn, signOut, recheck, updateUser }),
    [state, signIn, signOut, recheck, updateUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
