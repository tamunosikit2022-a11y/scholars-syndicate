import { z } from 'zod';
import { LEVELS, ROLES } from './accounts';

/** Signed in stays valid this long after the last use (renewed on use)… */
export const SESSION_IDLE_DAYS = 30;
/** …but never longer than this after the actual sign-in. */
export const SESSION_MAX_DAYS = 90;

/** Body of POST /api/auth/google — the "ID token" the Google button gives the website. */
export const googleSignInRequestSchema = z.object({
  idToken: z.string().min(20).max(4096),
});
export type GoogleSignInRequest = z.infer<typeof googleSignInRequestSchema>;

/** What the website may know about a signed-in person. Never includes date of birth or Google ids. */
export const publicUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  fullName: z.string(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  level: z.enum(LEVELS).nullable(),
  onboardingStage: z.number().int(),
  roles: z.array(z.enum(ROLES)),
});
export type PublicUser = z.infer<typeof publicUserSchema>;

export const signInResponseSchema = z.object({
  user: publicUserSchema,
  isNewUser: z.boolean(),
});
export type SignInResponse = z.infer<typeof signInResponseSchema>;

/** GET /api/auth/config — what the website needs to show the Google button. Public by design. */
export const authConfigResponseSchema = z.object({
  /** null while Google sign-in is not switched on. A client id is not a secret. */
  googleClientId: z.string().nullable(),
});
export type AuthConfigResponse = z.infer<typeof authConfigResponseSchema>;

export const meResponseSchema = z.object({ user: publicUserSchema });
export type MeResponse = z.infer<typeof meResponseSchema>;

/** Every error the auth endpoints can return: { "error": "<one of these>" }. */
export const AUTH_ERROR_CODES = [
  'invalid_request',
  'invalid_google_token',
  'email_not_verified',
  'account_suspended',
  'email_already_registered',
  'google_sign_in_not_configured',
  'google_unreachable',
  'not_signed_in',
  'forbidden_origin',
  'too_many_requests',
  'validation_failed',
  'date_of_birth_locked',
] as const;
export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];
