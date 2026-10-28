import cors from 'cors';
import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import helmet from 'helmet';
import { sameOriginGuard, sessionLoader } from './auth/middleware';
import type { GoogleTokenVerifier } from './auth/google';
import type { Db } from './db/client';
import { authRouter } from './routes/auth';
import { healthRouter } from './routes/health';

export interface AppDeps {
  db: Db;
  corsOrigin: string;
  version: string;
  /** Omit until Google sign-in is configured. */
  verifyGoogleToken?: GoogleTokenVerifier;
  /** Google client id handed to the website for the sign-in button. */
  googleClientId?: string;
  /** Injected in tests so time can be controlled. */
  clock?: () => Date;
  isProduction?: boolean;
  /** Number of proxies in front of the API (so rate limits see the real visitor IP). */
  trustProxy?: number;
  /** Sign-in attempts allowed per visitor IP. Generous, because a whole school can share one IP. */
  authRateLimit?: { windowMs: number; limit: number };
}

const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'not_found' });
};

const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, next) => {
  if (res.headersSent) return next(err);
  const type =
    typeof err === 'object' && err !== null ? (err as { type?: string }).type : undefined;
  if (type === 'entity.parse.failed') {
    res.status(400).json({ error: 'invalid_json' });
    return;
  }
  if (type === 'entity.too.large') {
    res.status(413).json({ error: 'payload_too_large' });
    return;
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'internal_error' }); // never leak details to clients
};

/** Builds the Express app. Takes its dependencies as arguments so tests can inject their own. */
export function createApp(deps: AppDeps) {
  const app = express();
  const origins = deps.corsOrigin.split(',').map((o) => o.trim());
  const clock = deps.clock ?? (() => new Date());
  const isProduction = deps.isProduction ?? false;

  app.set('trust proxy', deps.trustProxy ?? 0);
  app.use(helmet());
  app.use(cors({ origin: origins, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(sameOriginGuard(origins));
  app.use(sessionLoader({ db: deps.db, clock, isProduction }));

  app.use('/api/health', healthRouter({ db: deps.db, version: deps.version }));
  app.use(
    '/api/auth',
    authRouter({
      db: deps.db,
      clock,
      isProduction,
      verifyGoogleToken: deps.verifyGoogleToken,
      googleClientId: deps.googleClientId,
      rateLimit: deps.authRateLimit ?? { windowMs: 10 * 60 * 1000, limit: 100 },
    }),
  );

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
