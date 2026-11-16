import { desc, eq, sql } from 'drizzle-orm';
import { Router } from 'express';
import {
  CURRENT_TERMS_VERSION,
  accountExportSchema,
  essentialsRequestSchema,
  journeyRequestSchema,
  journeyResponseSchema,
  validateEssentials,
  type MeResponse,
} from '@scholars/shared';
import { requireAuth, requireRole } from '../auth/middleware';
import type { Db } from '../db/client';
import { sessions, studentJourney, users } from '../db/schema';
import { toPublicUser } from './auth';

export interface MeRouterDeps {
  db: Db;
  clock: () => Date;
}

/** Everything about "me" that needs a signed-in person. */
export function meRouter(deps: MeRouterDeps) {
  const router = Router();

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.use(requireAuth);
  router.use('/essentials', requireRole('student'));
  router.use('/journey', requireRole('student'));

  /** A person's own copy of their account, journey preferences, and active-device metadata. */
  router.get('/export', async (req, res) => {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }

    const [journeyRows, deviceRows] = await Promise.all([
      deps.db.select().from(studentJourney).where(eq(studentJourney.userId, auth.user.id)).limit(1),
      deps.db
        .select({
          userAgent: sessions.userAgent,
          createdAt: sessions.createdAt,
          lastSeenAt: sessions.lastSeenAt,
          expiresAt: sessions.expiresAt,
          absoluteExpiresAt: sessions.absoluteExpiresAt,
        })
        .from(sessions)
        .where(eq(sessions.userId, auth.user.id))
        .orderBy(desc(sessions.lastSeenAt)),
    ]);
    const saved = journeyRows[0];
    const body = accountExportSchema.parse({
      schemaVersion: 1,
      exportedAt: deps.clock().toISOString(),
      account: {
        id: auth.user.id,
        email: auth.user.email,
        emailVerified: auth.user.emailVerified,
        fullName: auth.user.fullName,
        avatarUrl: auth.user.avatarUrl,
        displayName: auth.user.displayName,
        dateOfBirth: auth.user.dateOfBirth,
        level: auth.user.level,
        termsAcceptedAt: auth.user.termsAcceptedAt?.toISOString() ?? null,
        termsVersion: auth.user.termsVersion,
        guardianConsentAt: auth.user.guardianConsentAt?.toISOString() ?? null,
        onboardingStage: auth.user.onboardingStage,
        roles: auth.roles,
        status: auth.user.status,
        createdAt: auth.user.createdAt.toISOString(),
        updatedAt: auth.user.updatedAt.toISOString(),
        lastLoginAt: auth.user.lastLoginAt?.toISOString() ?? null,
      },
      journey: saved
        ? {
            state: saved.state,
            schoolName: saved.schoolName,
            exams: saved.exams,
            subjects: saved.subjects,
            courseInterest: saved.courseInterest,
            universityInterests: saved.universityInterests,
            dailyStudyGoalMinutes: saved.dailyStudyGoalMinutes,
            preferredStudyTime: saved.preferredStudyTime,
            qualityLevel: saved.qualityLevel,
            completedAt: saved.completedAt?.toISOString() ?? null,
          }
        : null,
      sessions: deviceRows.map((session) => ({
        userAgent: session.userAgent,
        createdAt: session.createdAt.toISOString(),
        lastSeenAt: session.lastSeenAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        absoluteExpiresAt: session.absoluteExpiresAt.toISOString(),
      })),
    });
    res.set('Content-Disposition', 'attachment; filename="scholars-syndicate-data.json"');
    res.json(body);
  });

  /** Onboarding Stage 1: display name, date of birth, level, terms (+ guardian consent for under-18s). */
  router.put('/essentials', async (req, res) => {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }

    const parsed = essentialsRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }

    const now = deps.clock();
    const result = validateEssentials(parsed.data, now);
    if (!result.ok) {
      res.status(422).json({ error: 'validation_failed', fields: result.errors });
      return;
    }

    const current = auth.user;
    // The date of birth decides the under-18 rules, so it can be set once. Changing it later needs support.
    if (current.dateOfBirth !== null && current.dateOfBirth !== result.value.dateOfBirth) {
      res.status(409).json({ error: 'date_of_birth_locked' });
      return;
    }

    const acceptedNewVersion = current.termsVersion !== CURRENT_TERMS_VERSION;
    const [updated] = await deps.db
      .update(users)
      .set({
        displayName: result.value.displayName,
        dateOfBirth: result.value.dateOfBirth,
        level: result.value.level,
        termsVersion: CURRENT_TERMS_VERSION,
        termsAcceptedAt:
          acceptedNewVersion || !current.termsAcceptedAt ? now : current.termsAcceptedAt,
        // Remember when guardian permission was first given; never erase that record.
        guardianConsentAt: result.value.isMinor
          ? (current.guardianConsentAt ?? now)
          : current.guardianConsentAt,
        onboardingStage: sql<number>`greatest(${users.onboardingStage}, 1)`,
      })
      .where(eq(users.id, current.id))
      .returning();
    if (!updated) throw new Error('Could not update the profile');

    const body: MeResponse = { user: toPublicUser(updated, auth.roles) };
    res.json(body);
  });

  /** Returns only the signed-in student's private Stage 2 preferences. */
  router.get('/journey', async (req, res) => {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    if (auth.user.onboardingStage < 1) {
      res.status(409).json({ error: 'onboarding_not_ready' });
      return;
    }

    const [saved] = await deps.db
      .select()
      .from(studentJourney)
      .where(eq(studentJourney.userId, auth.user.id))
      .limit(1);
    const body = journeyResponseSchema.parse({
      journey: {
        state: saved?.state ?? null,
        schoolName: saved?.schoolName ?? null,
        exams: saved?.exams ?? [],
        subjects: saved?.subjects ?? [],
        courseInterest: saved?.courseInterest ?? null,
        universityInterests: saved?.universityInterests ?? [],
        dailyStudyGoalMinutes: saved?.dailyStudyGoalMinutes ?? null,
        preferredStudyTime: saved?.preferredStudyTime ?? null,
        qualityLevel: saved?.qualityLevel ?? 'high',
        completedAt: saved?.completedAt?.toISOString() ?? null,
      },
    });
    res.json(body);
  });

  /** Partial, idempotent save so each Stage 2 screen can save independently. */
  router.put('/journey', async (req, res) => {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    if (auth.user.onboardingStage < 1) {
      res.status(409).json({ error: 'onboarding_not_ready' });
      return;
    }

    const parsed = journeyRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }

    const changes = Object.fromEntries(
      Object.entries(parsed.data).filter(([, value]) => value !== undefined),
    ) as Partial<typeof studentJourney.$inferInsert>;
    const now = deps.clock();
    const [saved] = await deps.db
      .insert(studentJourney)
      .values({ userId: auth.user.id, ...changes, updatedAt: now })
      .onConflictDoUpdate({
        target: studentJourney.userId,
        set: { ...changes, updatedAt: now },
      })
      .returning();
    if (!saved) throw new Error('Could not save student journey');

    const body = journeyResponseSchema.parse({
      journey: {
        state: saved.state,
        schoolName: saved.schoolName,
        exams: saved.exams,
        subjects: saved.subjects,
        courseInterest: saved.courseInterest,
        universityInterests: saved.universityInterests,
        dailyStudyGoalMinutes: saved.dailyStudyGoalMinutes,
        preferredStudyTime: saved.preferredStudyTime,
        qualityLevel: saved.qualityLevel,
        completedAt: saved.completedAt?.toISOString() ?? null,
      },
    });
    res.json(body);
  });

  /** Stage 2 is optional: calling this with no saved preferences records an explicit skip. */
  router.post('/journey/complete', async (req, res) => {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    if (auth.user.onboardingStage < 1) {
      res.status(409).json({ error: 'onboarding_not_ready' });
      return;
    }

    const now = deps.clock();
    const body = await deps.db.transaction(async (tx) => {
      const [saved] = await tx
        .insert(studentJourney)
        .values({ userId: auth.user.id, completedAt: now, updatedAt: now })
        .onConflictDoUpdate({
          target: studentJourney.userId,
          set: { completedAt: now, updatedAt: now },
        })
        .returning();
      await tx
        .update(users)
        .set({ onboardingStage: sql<number>`greatest(${users.onboardingStage}, 2)` })
        .where(eq(users.id, auth.user.id));
      if (!saved) throw new Error('Could not complete student journey');
      return journeyResponseSchema.parse({
        journey: {
          state: saved.state,
          schoolName: saved.schoolName,
          exams: saved.exams,
          subjects: saved.subjects,
          courseInterest: saved.courseInterest,
          universityInterests: saved.universityInterests,
          dailyStudyGoalMinutes: saved.dailyStudyGoalMinutes,
          preferredStudyTime: saved.preferredStudyTime,
          qualityLevel: saved.qualityLevel,
          completedAt: saved.completedAt?.toISOString() ?? null,
        },
      });
    });
    res.json(body);
  });

  return router;
}
