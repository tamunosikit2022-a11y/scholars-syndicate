/**
 * Account vocabulary shared by the database, the API and the website.
 * Change a list here and the database migration is generated from it; a test fails if they ever drift apart.
 * See docs/ACCOUNTS.md for what each role means.
 */

/** Everything a person can be on the platform. One login can hold several roles. */
export const ROLES = [
  'student',
  'parent',
  'teacher',
  'school',
  'university',
  'mentor',
  'staff',
  'admin',
] as const;
export type Role = (typeof ROLES)[number];

/** Where a student is on the journey. */
export const LEVELS = [
  'jss',
  'ss1',
  'ss2',
  'ss3',
  'jamb_candidate',
  'university_student',
  'other',
] as const;
export type Level = (typeof LEVELS)[number];

/** Whether an account may sign in. (A deleted account is removed completely, after the grace period below.) */
export const ACCOUNT_STATUSES = ['active', 'suspended'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/** The display name rules, used by the database check and by the website's form. */
export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 30;

/** Onboarding stages: 0 = just signed in, 1 = essentials done, 2 = personalised, 3 = fully set up. */
export const ONBOARDING_MAX_STAGE = 3;

/**
 * Account deletion: a deletion request locks the account and signs out every device. Signing in again
 * within this many days cancels it; after that the account and all its data are erased for good.
 */
export const DELETION_GRACE_DAYS = 14;
/** Deleting an account needs a sign-in no older than this (a stolen old session is not enough). */
export const DELETION_RECENT_SIGN_IN_MINUTES = 10;
