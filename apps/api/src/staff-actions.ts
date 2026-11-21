import type { StaffAction, StaffTargetType } from '@scholars/shared';
import type { Db } from './db/client';
import { staffActions } from './db/schema';

/** Anything that can run an insert: the database itself, or a transaction. */
type Writer = Pick<Db, 'insert'>;

export interface StaffActionEntry {
  actorId: string;
  action: StaffAction;
  targetType: StaffTargetType;
  targetId: string;
  detail?: Record<string, string | number | null>;
  at: Date;
}

/**
 * Adds one line to the staff audit log. Always call it with the SAME transaction as the change
 * it records, so the action and its log line either both happen or neither does.
 */
export async function logStaffAction(writer: Writer, entry: StaffActionEntry): Promise<void> {
  await writer.insert(staffActions).values({
    actorId: entry.actorId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    detail: entry.detail ?? {},
    createdAt: entry.at,
  });
}
