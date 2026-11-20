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
  const config = parsed.data;
  if (config.NODE_ENV === 'production') {
    const problems = productionProblems(env, config);
    if (problems.length > 0) {
      throw new Error(
        `Unsafe production configuration (the server refuses to start):\n${problems.map((p) => `  - ${p}`).join('\n')}`,
      );
    }
  }
  return config;
}

/** Settings that are fine on a laptop but unsafe once real students use the site. */
function productionProblems(env: NodeJS.ProcessEnv, config: Config): string[] {
  const problems: string[] = [];
  const origins = config.CORS_ORIGIN.split(',').map((o) => o.trim());
  if (!env.CORS_ORIGIN?.trim()) {
    problems.push(
      'CORS_ORIGIN must be set to your real website address (it defaults to localhost).',
    );
  } else {
    for (const origin of origins) {
      let url: URL | null = null;
      try {
        url = new URL(origin);
      } catch {
        /* reported below */
      }
      if (!url || url.protocol !== 'https:') {
        problems.push(`CORS_ORIGIN "${origin}" must be an https:// address.`);
      } else if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
        problems.push(`CORS_ORIGIN "${origin}" must not point at localhost in production.`);
      }
    }
  }
  if (env.TRUST_PROXY === undefined || env.TRUST_PROXY.trim() === '') {
    problems.push(
      'TRUST_PROXY must be set (1 when the host puts one proxy in front of the API, 0 if none). ' +
        'Without it, rate limits see the proxy instead of the visitor.',
    );
  }
  return problems;
}
