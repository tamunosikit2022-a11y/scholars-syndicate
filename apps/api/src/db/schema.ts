import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

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
