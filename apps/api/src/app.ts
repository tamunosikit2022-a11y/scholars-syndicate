import cors from 'cors';
import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import helmet from 'helmet';
import type { Db } from './db/client';
import { healthRouter } from './routes/health';

export interface AppDeps {
  db: Db;
  corsOrigin: string;
  version: string;
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
  app.use(helmet());
  app.use(cors({ origin: deps.corsOrigin.split(',').map((o) => o.trim()) }));
  app.use(express.json({ limit: '100kb' }));

  app.use('/api/health', healthRouter({ db: deps.db, version: deps.version }));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
