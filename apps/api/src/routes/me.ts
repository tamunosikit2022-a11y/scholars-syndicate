import { eq } from 'drizzle-orm';
import { Router } from 'express';
import {
  CURRENT_TERMS_VERSION,
  essentialsRequestSchema,
  validateEssentials,
  type MeResponse,
} from '@scholars/shared';
import { requireAuth } from '../auth/middleware';
import type { Db } from '../db/client';
import { users } from '../db/schema';
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
        onboardingStage: Math.max(current.onboardingStage, 1),
      })
      .where(eq(users.id, current.id))
      .returning();
    if (!updated) throw new Error('Could not update the profile');

    const body: MeResponse = { user: toPublicUser(updated, auth.roles) };
    res.json(body);
  });

  return router;
}
