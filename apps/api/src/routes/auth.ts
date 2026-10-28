import { Router, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import {
  googleSignInRequestSchema,
  type AuthConfigResponse,
  type MeResponse,
  type PublicUser,
  type Role,
  type SignInResponse,
} from '@scholars/shared';
import { signInWithGoogle } from '../auth/accounts';
import { readSessionToken, sessionCookieName, sessionCookieOptions } from '../auth/cookies';
import { GoogleTokenError, GoogleUnavailableError, type GoogleTokenVerifier } from '../auth/google';
import { createSession, revokeSession, type UserRow } from '../auth/sessions';
import type { Db } from '../db/client';

export interface AuthRouterDeps {
  db: Db;
  clock: () => Date;
  isProduction: boolean;
  /** Missing until GOOGLE_CLIENT_ID is configured; sign-in then answers "not configured". */
  verifyGoogleToken: GoogleTokenVerifier | undefined;
  /** Shown to the website so it can render the Google button (not a secret). */
  googleClientId: string | undefined;
  rateLimit: { windowMs: number; limit: number };
}

/** The only shape of a person the website ever receives. No date of birth, no Google ids. */
export function toPublicUser(user: UserRow, roles: Role[]): PublicUser {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    fullName: user.fullName,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    level: user.level,
    onboardingStage: user.onboardingStage,
    roles,
  };
}

function clearSessionCookie(res: Response, isProduction: boolean) {
  res.clearCookie(sessionCookieName(isProduction), {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  });
}

export function authRouter(deps: AuthRouterDeps) {
  const router = Router();

  // Nothing about who is signed in may ever be cached by a browser or a proxy.
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  const signInLimiter = rateLimit({
    windowMs: deps.rateLimit.windowMs,
    limit: deps.rateLimit.limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ error: 'too_many_requests' });
    },
  });

  router.get('/config', (_req, res) => {
    const body: AuthConfigResponse = { googleClientId: deps.googleClientId ?? null };
    res.json(body);
  });

  router.post('/google', signInLimiter, async (req, res) => {
    const parsed = googleSignInRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    if (!deps.verifyGoogleToken) {
      res.status(503).json({ error: 'google_sign_in_not_configured' });
      return;
    }

    let identity;
    try {
      identity = await deps.verifyGoogleToken(parsed.data.idToken);
    } catch (err) {
      if (err instanceof GoogleTokenError) {
        res.status(401).json({ error: 'invalid_google_token' });
        return;
      }
      if (err instanceof GoogleUnavailableError) {
        res.status(503).json({ error: 'google_unreachable' });
        return;
      }
      throw err; // a genuine bug: let the error handler answer 500
    }

    if (!identity.emailVerified) {
      res.status(403).json({ error: 'email_not_verified' });
      return;
    }

    const now = deps.clock();
    const result = await signInWithGoogle(deps.db, identity, now);
    if (result.kind === 'suspended') {
      res.status(403).json({ error: 'account_suspended' });
      return;
    }
    if (result.kind === 'email_conflict') {
      res.status(409).json({ error: 'email_already_registered' });
      return;
    }

    // Signing in on a device that already had a session replaces it (no stale sessions pile up).
    const previous = readSessionToken(req, deps.isProduction);
    if (previous) await revokeSession(deps.db, previous);

    const { token, expiresAt } = await createSession(
      deps.db,
      result.user.id,
      req.get('user-agent') ?? null,
      now,
    );
    res.cookie(
      sessionCookieName(deps.isProduction),
      token,
      sessionCookieOptions(deps.isProduction, expiresAt),
    );
    const body: SignInResponse = {
      user: toPublicUser(result.user, result.roles),
      isNewUser: result.isNewUser,
    };
    res.json(body);
  });

  router.get('/me', (req, res) => {
    if (!req.auth) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    const body: MeResponse = { user: toPublicUser(req.auth.user, req.auth.roles) };
    res.json(body);
  });

  router.post('/logout', async (req, res) => {
    const token = readSessionToken(req, deps.isProduction);
    if (token) await revokeSession(deps.db, token);
    clearSessionCookie(res, deps.isProduction);
    res.status(204).end(); // always succeeds, even if they were not signed in
  });

  return router;
}
