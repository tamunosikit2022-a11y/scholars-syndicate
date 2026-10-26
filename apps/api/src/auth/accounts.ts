import { eq } from 'drizzle-orm';
import type { Role } from '@scholars/shared';
import type { Db } from '../db/client';
import { userRoles, users } from '../db/schema';
import type { UserRow } from './sessions';

/** What Google tells us about a person once their sign-in token is verified. */
export interface GoogleIdentity {
  sub: string; // Google's permanent id for this person
  email: string;
  emailVerified: boolean;
  name: string;
  picture: string | null;
}

export type SignInResult =
  | { kind: 'ok'; user: UserRow; roles: Role[]; isNewUser: boolean }
  | { kind: 'suspended' }
  | { kind: 'email_conflict' };

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === '23505' || e?.cause?.code === '23505';
}

async function rolesOf(db: Pick<Db, 'select'>, userId: string): Promise<Role[]> {
  const rows = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, userId));
  return rows.map((r) => r.role);
}

async function signInOnce(db: Db, identity: GoogleIdentity, now: Date): Promise<SignInResult> {
  const email = identity.email.trim().toLowerCase();

  return db.transaction(async (tx) => {
    const found = (
      await tx.select().from(users).where(eq(users.googleSub, identity.sub)).limit(1)
    )[0];

    if (found) {
      if (found.status !== 'active') return { kind: 'suspended' };

      // Keep the profile fresh. If Google now reports a different email that someone else already
      // uses, we keep the old one rather than fail the sign-in.
      let nextEmail = found.email;
      if (email !== found.email) {
        const taken = (
          await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
        )[0];
        if (!taken) nextEmail = email;
      }
      const [updated] = await tx
        .update(users)
        .set({
          email: nextEmail,
          emailVerified: identity.emailVerified,
          fullName: identity.name,
          avatarUrl: identity.picture,
          lastLoginAt: now,
        })
        .where(eq(users.id, found.id))
        .returning();
      return {
        kind: 'ok',
        user: updated ?? found,
        roles: await rolesOf(tx, found.id),
        isNewUser: false,
      };
    }

    const sameEmail = (
      await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
    )[0];
    if (sameEmail) return { kind: 'email_conflict' };

    const [created] = await tx
      .insert(users)
      .values({
        googleSub: identity.sub,
        email,
        emailVerified: identity.emailVerified,
        fullName: identity.name,
        avatarUrl: identity.picture,
        lastLoginAt: now,
      })
      .returning();
    if (!created) throw new Error('Could not create the user');
    await tx.insert(userRoles).values({ userId: created.id, role: 'student' });
    return { kind: 'ok', user: created, roles: ['student'], isNewUser: true };
  });
}

/**
 * Finds the account for a verified Google identity, or creates it (as a student) on first sign-in.
 * If two first sign-ins race, the loser retries once and finds the account the winner just made.
 */
export async function signInWithGoogle(
  db: Db,
  identity: GoogleIdentity,
  now: Date,
): Promise<SignInResult> {
  try {
    return await signInOnce(db, identity, now);
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    return signInOnce(db, identity, now);
  }
}
