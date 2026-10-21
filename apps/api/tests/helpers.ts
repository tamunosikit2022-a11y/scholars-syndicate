import { createDb } from '../src/db/client';
import { assertTestDatabase } from '../src/db/reset';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://scholars:scholars@127.0.0.1:5432/scholars_test';

/** A connection to the TEST database. Refuses to hand out anything not named *_test. */
export function createTestDb() {
  assertTestDatabase(TEST_DATABASE_URL);
  return createDb(TEST_DATABASE_URL, { max: 3 });
}
