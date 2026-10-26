import { and, eq, gt, lte, or } from 'drizzle-orm';
import { SESSION_IDLE_DAYS, SESSION_MAX_DAYS, type Role } from '@scholars/shared';
import type { Db } from '../db/client';
import { sessions, userRoles, users } from '../db/schema';
import { generateSessionToken, hashSessionToken } from './tokens';

const DAY_MS = 24 * 60 * 60 * 1000;
/** To save database writes, a session's idle timer is only pushed forward if it was last pushed this long ago. */
const SLIDE_AFTER_MS = 60 * 60 * 1000;

export type UserRow = typeof users.$inferSelect;

export interface ActiveSession {
  sessionId: string;
  user: UserRow;
  roles: Role[];
  expiresAt: Date;
  /** True when the idle timer was just pushed forward (the cookie should be refreshed too). */
  refreshed: boolean;
}

export async function createSession(db: Db, userId: string, userAgent: string | null, now: Date) {
  const token = generateSessionToken();
  const expiresAt = new Date(now.getTime() + SESSION_IDLE_DAYS * DAY_MS);
  const absoluteExpiresAt = new Date(now.getTime() + SESSION_MAX_DAYS * DAY_MS);
  await db.insert(sessions).values({
    userId,
    tokenHash: hashSessionToken(token),
    userAgent: userAgent ? userAgent.slice(0, 200) : null,
    createdAt: now,
    lastSeenAt: now,
    expiresAt,
    absoluteExpiresAt,
  });
  return { token, expiresAt };
}

/**
 * Looks up the person behind a session code. Returns null when the code is unknown, expired (idle or
 * absolute limit) or the account is suspended. Slides the idle timer forward when appropriate.
 */
export async function findActiveSession(
  db: Db,
  token: string,
  now: Date,
): Promise<ActiveSession | null> {
  const rows = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, hashSessionToken(token)),
        gt(sessions.expiresAt, now),
        gt(sessions.absoluteExpiresAt, now),
        eq(users.status, 'active'),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const roleRows = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, row.user.id));

  let expiresAt = row.session.expiresAt;
  let refreshed = false;
  if (now.getTime() - row.session.lastSeenAt.getTime() > SLIDE_AFTER_MS) {
    expiresAt = new Date(
      Math.min(now.getTime() + SESSION_IDLE_DAYS * DAY_MS, row.session.absoluteExpiresAt.getTime()),
    );
    await db
      .update(sessions)
      .set({ lastSeenAt: now, expiresAt })
      .where(eq(sessions.id, row.session.id));
    refreshed = true;
  }

  return {
    sessionId: row.session.id,
    user: row.user,
    roles: roleRows.map((r) => r.role),
    expiresAt,
    refreshed,
  };
}

/** Signs one device out. Unknown codes are ignored (signing out twice is fine). */
export async function revokeSession(db: Db, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(token)));
}

/** Signs a person out of every device. */
export async function revokeAllSessions(db: Db, userId: string): Promise<number> {
  const gone = await db
    .delete(sessions)
    .where(eq(sessions.userId, userId))
    .returning({ id: sessions.id });
  return gone.length;
}

/** Housekeeping: removes sessions that can never be used again. Returns how many were removed. */
export async function deleteExpiredSessions(db: Db, now: Date): Promise<number> {
  const gone = await db
    .delete(sessions)
    .where(or(lte(sessions.expiresAt, now), lte(sessions.absoluteExpiresAt, now)))
    .returning({ id: sessions.id });
  return gone.length;
}
