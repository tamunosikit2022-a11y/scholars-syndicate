import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  ACCOUNT_STATUSES,
  DISPLAY_NAME_MAX,
  DISPLAY_NAME_MIN,
  LEVELS,
  ONBOARDING_MAX_STAGE,
  EXAM_TYPES,
  QUALITY_LEVELS,
  ROLES,
  STUDY_TIMES,
  type ExamPlan,
} from '@scholars/shared';

/**
 * The database structure lives HERE, in code. Every change becomes a migration file in
 * apps/api/drizzle/, so the whole database can always be rebuilt from scratch.
 */

/** Small key/value table for app-level facts (proves migrations ran; handy later). */
export const appInfo = pgTable('app_info', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ───────────────────────── accounts (Feature 1) ─────────────────────────

export const userRole = pgEnum('user_role', ROLES);
export const userLevel = pgEnum('user_level', LEVELS);
export const accountStatus = pgEnum('account_status', ACCOUNT_STATUSES);
export const journeyExamType = pgEnum('journey_exam_type', EXAM_TYPES);
export const journeyStudyTime = pgEnum('journey_study_time', STUDY_TIMES);
export const journeyQualityLevel = pgEnum('journey_quality_level', QUALITY_LEVELS);

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

/** One row per person. Sign-in is with Google, so there is no password column to protect. */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // From Google
    googleSub: text('google_sub').notNull().unique(), // Google's permanent id for this person
    email: text('email').notNull().unique(), // always stored lower-case (see check below)
    emailVerified: boolean('email_verified').notNull().default(false),
    fullName: text('full_name').notNull(),
    avatarUrl: text('avatar_url'),

    // Stage 1 of onboarding
    displayName: text('display_name'), // shown publicly (leaderboards); the real name stays private
    dateOfBirth: date('date_of_birth', { mode: 'string' }), // never shown publicly
    level: userLevel('level'),
    termsAcceptedAt: timestamptz('terms_accepted_at'),
    termsVersion: text('terms_version'),
    // Set when an under-18 student confirmed that a parent or guardian knows and allows it.
    guardianConsentAt: timestamptz('guardian_consent_at'),

    onboardingStage: integer('onboarding_stage').notNull().default(0),
    status: accountStatus('status').notNull().default('active'),

    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    lastLoginAt: timestamptz('last_login_at'),
  },
  (t) => [
    check('users_email_lowercase', sql`${t.email} = lower(${t.email})`),
    check(
      'users_display_name_length',
      sql`${t.displayName} is null or char_length(${t.displayName}) between ${sql.raw(String(DISPLAY_NAME_MIN))} and ${sql.raw(String(DISPLAY_NAME_MAX))}`,
    ),
    check(
      'users_onboarding_stage_range',
      sql`${t.onboardingStage} between 0 and ${sql.raw(String(ONBOARDING_MAX_STAGE))}`,
    ),
    check(
      'users_date_of_birth_sane',
      sql`${t.dateOfBirth} is null or ${t.dateOfBirth} >= date '1900-01-01'`,
    ),
  ],
);

/** Which roles each person holds. One login can be a student AND a mentor, for example. */
export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: userRole('role').notNull(),
    grantedAt: timestamptz('granted_at').notNull().defaultNow(),
    // Who approved it (null = self-service, e.g. the student role at sign-up). Kept if that admin leaves.
    grantedBy: uuid('granted_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.role] }),
    index('user_roles_role_idx').on(t.role), // "list all teachers" stays fast
  ],
);

// ───────────────────────── sign-in sessions (Feature 1, step 2) ─────────────────────────

/**
 * One row per signed-in device. The browser holds a random code; we store only its SHA-256 scramble,
 * so a leaked database cannot be used to sign in as anyone. Deleting a row signs that device out.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    userAgent: text('user_agent'), // browser/device label only; we deliberately do not store IP addresses
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    lastSeenAt: timestamptz('last_seen_at').notNull().defaultNow(),
    expiresAt: timestamptz('expires_at').notNull(), // idle expiry: slides forward each time it is used
    absoluteExpiresAt: timestamptz('absolute_expires_at').notNull(), // hard limit: never moves
  },
  (t) => [
    index('sessions_user_id_idx').on(t.userId), // "sign out everywhere" stays fast
    index('sessions_expires_at_idx').on(t.expiresAt), // clean-up of expired sessions stays fast
    check('sessions_expiry_order', sql`${t.expiresAt} <= ${t.absoluteExpiresAt}`),
  ],
);

// ───────────────────────── student journey (Feature 1, step 4b) ─────────────────────────

/** Private learning preferences. This table is only read and written through the signed-in /me API. */
export const studentJourney = pgTable(
  'student_journey',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    state: text('state'),
    schoolName: text('school_name'),
    exams: jsonb('exams').$type<ExamPlan[]>().notNull().default([]),
    subjects: text('subjects').array().notNull().default([]),
    courseInterest: text('course_interest'),
    universityInterests: text('university_interests').array().notNull().default([]),
    dailyStudyGoalMinutes: smallint('daily_study_goal_minutes'),
    preferredStudyTime: journeyStudyTime('preferred_study_time'),
    qualityLevel: journeyQualityLevel('quality_level').notNull().default('high'),
    completedAt: timestamptz('completed_at'),
    updatedAt: timestamptz('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check('student_journey_state_length', sql`${t.state} is null or char_length(${t.state}) <= 50`),
    check(
      'student_journey_school_name_length',
      sql`${t.schoolName} is null or char_length(${t.schoolName}) <= 160`,
    ),
    check(
      'student_journey_course_interest_length',
      sql`${t.courseInterest} is null or char_length(${t.courseInterest}) <= 120`,
    ),
    check(
      'student_journey_daily_goal_range',
      sql`${t.dailyStudyGoalMinutes} is null or ${t.dailyStudyGoalMinutes} between 5 and 600`,
    ),
    check('student_journey_subject_count', sql`cardinality(${t.subjects}) <= 20`),
    check('student_journey_university_count', sql`cardinality(${t.universityInterests}) <= 3`),
  ],
);
