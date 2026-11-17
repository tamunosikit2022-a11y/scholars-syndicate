import type { RequestHandler } from 'express';
import type { Role } from '@scholars/shared';
import type { Db } from '../db/client';
import { readSessionToken, sessionCookieName, sessionCookieOptions } from './cookies';
import { findActiveSession, type UserRow } from './sessions';

export interface AuthContext {
  sessionId: string;
  user: UserRow;
  roles: Role[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set when the request carries a valid sign-in cookie. */
      auth?: AuthContext;
    }
  }
}

/** Looks at the sign-in cookie, fills in `req.auth` when valid, and keeps the cookie fresh. */
export function sessionLoader(deps: {
  db: Db;
  clock: () => Date;
  isProduction: boolean;
}): RequestHandler {
  return async (req, res, next) => {
    const token = readSessionToken(req, deps.isProduction);
    if (!token) return next();
    const active = await findActiveSession(deps.db, token, deps.clock());
    if (active) {
      req.auth = { sessionId: active.sessionId, user: active.user, roles: active.roles };
      if (active.refreshed) {
        res.cookie(
          sessionCookieName(deps.isProduction),
          token,
          sessionCookieOptions(deps.isProduction, active.expiresAt),
        );
      }
    }
    next();
  };
}

/** Refuses the request unless someone is signed in. */
export const requireAuth: RequestHandler = (req, res, next) => {
  if (!req.auth) {
    res.status(401).json({ error: 'not_signed_in' });
    return;
  }
  next();
};

/** Refuses access unless the signed-in person holds at least one of the listed roles. */
export function requireRole(...allowedRoles: [Role, ...Role[]]): RequestHandler {
  return (req, res, next) => {
    if (!req.auth) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    if (!req.auth.roles.some((role) => allowedRoles.includes(role))) {
      res.status(403).json({ error: 'role_required' });
      return;
    }
    next();
  };
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Extra protection against other websites making a signed-in browser send requests: any request that
 * changes data must either come from our own website or carry no Origin header at all (non-browser tools).
 */
export function sameOriginGuard(allowedOrigins: string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);
  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const origin = req.get('origin');
    if (origin && !allowed.has(origin)) {
      res.status(403).json({ error: 'forbidden_origin' });
      return;
    }
    next();
  };
}
