import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1, 'is required (see apps/api/.env.example)'),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  // Google sign-in is switched off until this is set (see docs/ACCOUNTS.md for how to get one).
  GOOGLE_CLIENT_ID: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().min(1).optional(),
  ),
  // How many proxies sit in front of the API (0 = none). Needed so rate limits see the real visitor IP.
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
});

export type Config = z.infer<typeof schema>;

/** Reads and validates environment variables. Fails fast with a readable message. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return parsed.data;
}
