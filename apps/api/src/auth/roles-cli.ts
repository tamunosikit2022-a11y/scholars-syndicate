import 'dotenv/config';
import { ROLES } from '@scholars/shared';
import { loadConfig } from '../config';
import { createDb } from '../db/client';
import { grantRole, isRole } from './roles';

/**
 * Gives someone a role (the person must have signed in once already):
 *   npm run roles:grant -- someone@example.com teacher --yes
 */
async function main() {
  const [email, role] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  if (!email || !role) {
    throw new Error('Usage: npm run roles:grant -- <email> <role> --yes');
  }
  if (!isRole(role)) {
    throw new Error(`Unknown role "${role}". Choose one of: ${ROLES.join(', ')}`);
  }
  if (!process.argv.includes('--yes')) {
    throw new Error(
      `This gives ${email} the "${role}" role.\nRun again with --yes if you are sure.`,
    );
  }

  const config = loadConfig();
  const { db, pool } = createDb(config.DATABASE_URL);
  try {
    const result = await grantRole(db, email, role);
    if (!result.ok) {
      throw new Error(`No account found for ${email}. They must sign in once first.`);
    }
    console.log(
      result.alreadyHeld
        ? `${email} already had the "${role}" role. Nothing changed.`
        : `Gave ${email} the "${role}" role.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error('Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
