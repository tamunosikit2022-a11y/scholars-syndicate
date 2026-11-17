import { z } from 'zod';

/** The word a person can type to confirm deletion (their own email address works too). */
export const DELETION_CONFIRM_WORD = 'DELETE';

/** Body of POST /api/me/delete. */
export const deleteAccountRequestSchema = z.object({
  /** Either the word DELETE or the person's own email address. */
  confirmation: z.string().min(1).max(320),
});
export type DeleteAccountRequest = z.infer<typeof deleteAccountRequestSchema>;

/** Answer to POST /api/me/delete: the account is locked now and erased on `scheduledFor`. */
export const deleteAccountResponseSchema = z.object({
  requestedAt: z.string(),
  scheduledFor: z.string(),
});
export type DeleteAccountResponse = z.infer<typeof deleteAccountResponseSchema>;

/**
 * Errors specific to account deletion: { "error": "<one of these>" }. Kept apart from AUTH_ERROR_CODES
 * so the website only needs their plain-language messages when the account screen is built.
 * (Also possible: not_signed_in 401 and invalid_request 400, as everywhere else.)
 */
export const ACCOUNT_DELETION_ERROR_CODES = [
  'confirmation_incorrect',
  'recent_sign_in_required',
  'last_admin',
] as const;
export type AccountDeletionErrorCode = (typeof ACCOUNT_DELETION_ERROR_CODES)[number];
