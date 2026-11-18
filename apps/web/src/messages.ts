import { MIN_AGE, type AccountDeletionErrorCode } from '@scholars/shared';

/** Plain-language messages for everything that can go wrong while signing in. */
const MESSAGES: Record<string, string> = {
  invalid_google_token: 'Google could not confirm your sign-in. Please try again.',
  email_not_verified:
    'Your Google email address is not verified yet. Verify it with Google, then try again.',
  account_suspended: 'This account has been suspended. Please contact support.',
  email_already_registered:
    'This email address is already linked to a different account. Please contact support.',
  google_sign_in_not_configured: 'Sign-in is not switched on yet. Please check back soon.',
  google_unreachable: 'We could not reach Google. Check your internet connection and try again.',
  too_many_requests: 'Too many attempts. Please wait a few minutes and try again.',
  forbidden_origin:
    'This website address is not allowed to sign in. Please open the site from its official address.',
  invalid_request: 'Something went wrong with the sign-in. Please try again.',
  network: 'We could not reach the server. Check your internet connection and try again.',
  validation_failed: 'Some answers need another look. Check the highlighted fields.',
  date_of_birth_locked:
    'Your date of birth is already saved and cannot be changed here. Please contact support if it is wrong.',
  onboarding_not_ready:
    'Please complete your account details before saving your learning preferences.',
  role_required: 'This part of your account is not available for your current role.',
  not_signed_in: 'Your sign-in has expired. Please sign in again.',
};

export function messageForError(code: string): string {
  return MESSAGES[code] ?? 'Something went wrong. Please try again.';
}

/** Plain-language messages for everything that can go wrong while deleting an account. */
const DELETION_MESSAGES: Record<AccountDeletionErrorCode, string> = {
  confirmation_incorrect:
    'That does not match. Type the word DELETE (in capital letters) or your own email address.',
  recent_sign_in_required:
    'For your safety, deleting an account needs a recent sign-in. Please sign in again, then try once more.',
  last_admin:
    'You are the only administrator, so this account cannot be deleted yet. Make another person an administrator first.',
};

export function messageForDeletionError(code: string): string {
  return code in DELETION_MESSAGES
    ? DELETION_MESSAGES[code as AccountDeletionErrorCode]
    : messageForError(code);
}

const FIELD_MESSAGES: Record<string, Record<string, string>> = {
  displayName: {
    required: 'Enter a display name.',
    too_short: 'Use at least 2 characters.',
    too_long: 'Use 30 characters or fewer.',
    invalid_characters: "Use only letters, numbers, spaces and . _ ' -",
    reserved: 'Please choose a different name. This one is reserved.',
  },
  dateOfBirth: {
    required: 'Choose your day, month and year of birth.',
    invalid: 'That date does not exist. Check the day and month.',
    future: 'Your date of birth cannot be in the future.',
    too_young: `Scholars Syndicate is for students aged ${MIN_AGE} and over.`,
    too_old: 'Please check your year of birth.',
  },
  level: { required: 'Choose where you are on your journey.' },
  terms: {
    required: 'Please agree to the Terms and Privacy Policy to continue.',
    outdated: 'The Terms have changed. Please reload the page and read them again.',
  },
  guardianConsent: {
    required: 'Please confirm that a parent or guardian knows and allows it.',
  },
};

/** Plain-language text for one rule failing on one form field. */
export function fieldMessage(field: string, code: string): string {
  return FIELD_MESSAGES[field]?.[code] ?? 'Please check this answer.';
}
