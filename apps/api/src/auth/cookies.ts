import { parse as parseCookies } from 'cookie';
import type { CookieOptions, Request, Response } from 'express';

export function sessionCookieName(isProduction: boolean): string {
  // "__Host-" makes browsers insist on Secure + no Domain + Path=/, which blocks cookie tricks.
  return isProduction ? '__Host-ss_session' : 'ss_session';
}

export function sessionCookieOptions(isProduction: boolean, expires: Date): CookieOptions {
  return {
    httpOnly: true, // invisible to scripts on the page
    secure: isProduction, // https only when live
    sameSite: 'lax', // not sent on cross-site requests, but fine when following a link to the site
    path: '/',
    expires,
  };
}

export function readSessionToken(req: Request, isProduction: boolean): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  const value = parseCookies(header)[sessionCookieName(isProduction)];
  return typeof value === 'string' && value.length >= 20 && value.length <= 200 ? value : null;
}

/** Tells the browser to forget the sign-in cookie. */
export function clearSessionCookie(res: Response, isProduction: boolean): void {
  res.clearCookie(sessionCookieName(isProduction), {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  });
}
