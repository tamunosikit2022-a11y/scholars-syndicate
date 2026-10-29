import { z } from 'zod';
import { LEVELS, type Level } from './accounts';

/**
 * The rules for the first onboarding screen ("essentials"). The website uses them for instant feedback and the
 * server uses the very same function as the final judge, so the two can never disagree.
 */

/** Bump this whenever the Terms or Privacy Policy text changes; everyone is asked to accept again. */
export const CURRENT_TERMS_VERSION = '2026-11-draft-1';

export const MIN_AGE = 10; // JSS1 students start around 10; to be confirmed during the legal review
export const MAX_AGE = 100;
export const ADULT_AGE = 18; // under this, a parent or guardian's permission is recorded

/** Names that could be mistaken for the team. Whole words only, so ordinary names are never blocked. */
const RESERVED_WORDS = [
  'admin',
  'administrator',
  'moderator',
  'support',
  'staff',
  'official',
  'scholarssyndicate',
];

/** Body of PUT /api/me/essentials. Shape only; the rules are in validateEssentials. */
export const essentialsRequestSchema = z.object({
  displayName: z.string().max(200),
  dateOfBirth: z.string().max(20),
  level: z.string().max(40),
  acceptTerms: z.boolean(),
  termsVersion: z.string().max(60),
  guardianConsent: z.boolean().optional(),
});
export type EssentialsRequest = z.infer<typeof essentialsRequestSchema>;

export type EssentialsFieldErrors = {
  displayName?: 'required' | 'too_short' | 'too_long' | 'invalid_characters' | 'reserved';
  dateOfBirth?: 'required' | 'invalid' | 'future' | 'too_young' | 'too_old';
  level?: 'required';
  terms?: 'required' | 'outdated';
  guardianConsent?: 'required';
};

export interface ValidEssentials {
  displayName: string;
  dateOfBirth: string; // YYYY-MM-DD
  level: Level;
  isMinor: boolean;
}

export type EssentialsResult =
  { ok: true; value: ValidEssentials } | { ok: false; errors: EssentialsFieldErrors };

export const DISPLAY_NAME_RULES = { min: 2, max: 30 } as const;

/** Trims and collapses repeated spaces: "  Ada   O.  " becomes "Ada O." */
export function normalizeDisplayName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/** Strict "YYYY-MM-DD" that must also be a real calendar date (no 31 February). */
export function parseDateOfBirth(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    return null;
  }
  return { y, m, d };
}

/** Completed years on the given day (uses the UTC calendar date). Null for an invalid date. */
export function ageOn(dateOfBirth: string, today: Date): number | null {
  const dob = parseDateOfBirth(dateOfBirth);
  if (!dob) return null;
  let age = today.getUTCFullYear() - dob.y;
  const beforeBirthday =
    today.getUTCMonth() + 1 < dob.m ||
    (today.getUTCMonth() + 1 === dob.m && today.getUTCDate() < dob.d);
  if (beforeBirthday) age -= 1;
  return age;
}

function checkDisplayName(raw: string): EssentialsFieldErrors['displayName'] | null {
  const name = normalizeDisplayName(raw);
  if (name.length === 0) return 'required';
  if (name.length < DISPLAY_NAME_RULES.min) return 'too_short';
  if (name.length > DISPLAY_NAME_RULES.max) return 'too_long';
  if (!/^[\p{L}\p{N} ._'-]+$/u.test(name)) return 'invalid_characters';
  const words = name
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  const compact = words.join('');
  if (words.some((w) => RESERVED_WORDS.includes(w)) || RESERVED_WORDS.includes(compact)) {
    return 'reserved';
  }
  return null;
}

export function validateEssentials(
  input: {
    displayName: string;
    dateOfBirth: string;
    level: string;
    acceptTerms: boolean;
    termsVersion: string;
    guardianConsent?: boolean | undefined;
  },
  today: Date,
): EssentialsResult {
  const errors: EssentialsFieldErrors = {};

  const nameProblem = checkDisplayName(input.displayName);
  if (nameProblem) errors.displayName = nameProblem;

  let age: number | null = null;
  if (input.dateOfBirth.trim() === '') {
    errors.dateOfBirth = 'required';
  } else {
    age = ageOn(input.dateOfBirth, today);
    if (age === null) errors.dateOfBirth = 'invalid';
    else if (age < 0) errors.dateOfBirth = 'future';
    else if (age < MIN_AGE) errors.dateOfBirth = 'too_young';
    else if (age > MAX_AGE) errors.dateOfBirth = 'too_old';
  }

  const level = (LEVELS as readonly string[]).includes(input.level) ? (input.level as Level) : null;
  if (!level) errors.level = 'required';

  if (!input.acceptTerms) errors.terms = 'required';
  else if (input.termsVersion !== CURRENT_TERMS_VERSION) errors.terms = 'outdated';

  const isMinor = age !== null && age >= 0 && age < ADULT_AGE;
  if (isMinor && input.guardianConsent !== true) errors.guardianConsent = 'required';

  if (Object.keys(errors).length > 0 || !level) return { ok: false, errors };
  return {
    ok: true,
    value: {
      displayName: normalizeDisplayName(input.displayName),
      dateOfBirth: input.dateOfBirth,
      level,
      isMinor,
    },
  };
}

/** What the server returns with a 422 when the input breaks a rule. */
export const validationFailedResponseSchema = z.object({
  error: z.literal('validation_failed'),
  fields: z.record(z.string(), z.string()),
});
