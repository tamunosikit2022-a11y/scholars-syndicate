import { createHash, randomBytes } from 'node:crypto';

/** A random, unguessable code for the browser to hold (256 bits). */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/** What we store instead of the code itself. Same code → same scramble; the scramble cannot be reversed. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
