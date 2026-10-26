import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import type { GoogleIdentity } from './accounts';

/** Google said no: the token is forged, expired, for another app, or malformed. */
export class GoogleTokenError extends Error {}
/** We could not reach Google to check (network trouble). Not the visitor's fault. */
export class GoogleUnavailableError extends Error {}

export type GoogleTokenVerifier = (idToken: string) => Promise<GoogleIdentity>;

export function identityFromPayload(payload: TokenPayload | undefined): GoogleIdentity {
  if (!payload?.sub || !payload.email) {
    throw new GoogleTokenError('Google token has no id or email');
  }
  const name = payload.name?.trim() || payload.email.split('@')[0] || 'Student';
  return {
    sub: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified === true,
    name,
    picture: payload.picture ?? null,
  };
}

/**
 * Problems reaching Google (rather than a bad token): network failures (ENOTFOUND, ETIMEDOUT, …),
 * Google answering with a server error or "slow down", or the library failing to download Google's keys.
 */
function looksLikeUpstreamFailure(err: unknown): boolean {
  const e = err as { code?: unknown; status?: unknown; message?: unknown } | null;
  if (typeof e?.code === 'string' && /^E[A-Z]+$/.test(e.code)) return true;
  if (typeof e?.status === 'number' && (e.status >= 500 || e.status === 429)) return true;
  return (
    typeof e?.message === 'string' &&
    e.message.startsWith('Failed to retrieve verification certificates')
  );
}

/**
 * Real verification, done by Google's own library: checks Google's signature, that the token was issued
 * for OUR app (audience), that it has not expired, and that it came from Google (issuer).
 */
export function createGoogleVerifier(
  clientId: string,
  client: Pick<OAuth2Client, 'verifyIdToken'> = new OAuth2Client(),
): GoogleTokenVerifier {
  return async (idToken) => {
    try {
      const ticket = await client.verifyIdToken({ idToken, audience: clientId });
      return identityFromPayload(ticket.getPayload());
    } catch (err) {
      if (err instanceof GoogleTokenError) throw err;
      if (looksLikeUpstreamFailure(err)) throw new GoogleUnavailableError('Could not reach Google');
      throw new GoogleTokenError('Google rejected the token');
    }
  };
}
