import { eq } from 'drizzle-orm';
import { ROLES, type Role } from '@scholars/shared';
import type { Db } from '../db/client';
import { userRoles, users } from '../db/schema';

export type GrantRoleResult =
  { ok: true; alreadyHeld: boolean } | { ok: false; reason: 'user_not_found' };

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/** Gives an existing account a role. Only the command-line script calls this; no web route does. */
export async function grantRole(db: Db, email: string, role: Role): Promise<GrantRoleResult> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);
  if (!user) return { ok: false, reason: 'user_not_found' };

  const inserted = await db
    .insert(userRoles)
    .values({ userId: user.id, role })
    .onConflictDoNothing()
    .returning({ userId: userRoles.userId });
  return { ok: true, alreadyHeld: inserted.length === 0 };
}
