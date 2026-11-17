import { and, eq, isNotNull, lte, ne, sql } from 'drizzle-orm';
import { DELETION_GRACE_DAYS } from '@scholars/shared';
import type { Db } from '../db/client';
import { blockedIdentities, sessions, userRoles, users } from '../db/schema';
import { hashGoogleSub } from './accounts';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The moment an account requested for deletion at `requestedAt` will be erased. */
export function deletionScheduledFor(requestedAt: Date): Date {
  return new Date(requestedAt.getTime() + DELETION_GRACE_DAYS * DAY_MS);
}

export type RequestDeletionResult =
  { kind: 'requested'; requestedAt: Date; scheduledFor: Date } | { kind: 'last_admin' };

/**
 * Arbitrary fixed number identifying the "an admin is leaving" lock in PostgreSQL (advisory locks are
 * named by a number). Only requests from admins ever take it.
 */
export const ADMIN_DELETION_LOCK = 7_342_001;

/**
 * Locks the account and signs out every device. Nothing is erased yet: the purge job does that once the
 * grace period is over, and signing in again before then cancels it.
 *
 * The last remaining admin cannot delete themselves (that would lock the owner out of the platform).
 * Admin requests take turns through one database lock, so two admins asking at the same moment cannot
 * both see "someone else is still here" and leave together. The lock is released automatically when
 * the transaction ends.
 */
export async function requestAccountDeletion(
  db: Db,
  userId: string,
  isAdmin: boolean,
  now: Date,
): Promise<RequestDeletionResult> {
  return db.transaction(async (tx) => {
    if (isAdmin) {
      await tx.execute(sql`select pg_advisory_xact_lock(${ADMIN_DELETION_LOCK})`);
      const otherAdmins = await tx
        .select({ id: users.id })
        .from(userRoles)
        .innerJoin(users, eq(users.id, userRoles.userId))
        .where(
          and(
            eq(userRoles.role, 'admin'),
            ne(users.id, userId),
            eq(users.status, 'active'),
            sql`${users.deletionRequestedAt} is null`,
          ),
        );
      if (otherAdmins.length === 0) return { kind: 'last_admin' };
    }

    await tx.update(users).set({ deletionRequestedAt: now }).where(eq(users.id, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    return { kind: 'requested', requestedAt: now, scheduledFor: deletionScheduledFor(now) };
  });
}

/**
 * Housekeeping: permanently erases every account whose grace period is over. All of a person's data goes
 * with the account (sessions, roles, journey…) because those tables are linked with ON DELETE CASCADE.
 * A suspended account leaves behind only a scrambled Google id (see `blockedIdentities`).
 * Returns how many accounts were erased.
 */
export async function purgeDueDeletions(db: Db, now: Date, batchSize = 100): Promise<number> {
  const cutoff = new Date(now.getTime() - DELETION_GRACE_DAYS * DAY_MS);
  const due = await db
    .select({ id: users.id })
    .from(users)
    .where(and(isNotNull(users.deletionRequestedAt), lte(users.deletionRequestedAt, cutoff)))
    .limit(batchSize);

  let erased = 0;
  for (const { id } of due) {
    const done = await db.transaction(async (tx) => {
      // Re-check under a lock: the person may have signed in (cancelling) since the list was made.
      const [row] = await tx
        .select({ googleSub: users.googleSub, status: users.status })
        .from(users)
        .where(
          and(
            eq(users.id, id),
            isNotNull(users.deletionRequestedAt),
            lte(users.deletionRequestedAt, cutoff),
          ),
        )
        .for('update');
      if (!row) return false;
      if (row.status === 'suspended') {
        await tx
          .insert(blockedIdentities)
          .values({ googleSubHash: hashGoogleSub(row.googleSub), blockedAt: now })
          .onConflictDoNothing();
      }
      await tx.delete(users).where(eq(users.id, id));
      return true;
    });
    if (done) erased += 1;
  }
  return erased;
}
