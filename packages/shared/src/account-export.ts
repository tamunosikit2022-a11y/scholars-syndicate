import { z } from 'zod';
import { ACCOUNT_STATUSES, LEVELS, ROLES } from './accounts';
import { journeyResponseSchema } from './journey';

/** The self-service export deliberately omits Google subject IDs and session token hashes. */
export const accountExportSchema = z.object({
  schemaVersion: z.literal(1),
  exportedAt: z.string().datetime(),
  account: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    emailVerified: z.boolean(),
    fullName: z.string(),
    avatarUrl: z.string().nullable(),
    displayName: z.string().nullable(),
    dateOfBirth: z.string().date().nullable(),
    level: z.enum(LEVELS).nullable(),
    termsAcceptedAt: z.string().datetime().nullable(),
    termsVersion: z.string().nullable(),
    guardianConsentAt: z.string().datetime().nullable(),
    onboardingStage: z.number().int(),
    roles: z.array(z.enum(ROLES)),
    status: z.enum(ACCOUNT_STATUSES),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    lastLoginAt: z.string().datetime().nullable(),
  }),
  journey: journeyResponseSchema.shape.journey.nullable(),
  sessions: z.array(
    z.object({
      userAgent: z.string().nullable(),
      createdAt: z.string().datetime(),
      lastSeenAt: z.string().datetime(),
      expiresAt: z.string().datetime(),
      absoluteExpiresAt: z.string().datetime(),
    }),
  ),
});
export type AccountExport = z.infer<typeof accountExportSchema>;
