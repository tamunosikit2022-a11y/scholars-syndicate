import { Router } from 'express';
import { sql } from 'drizzle-orm';
import type { HealthResponse } from '@scholars/shared';
import type { Db } from '../db/client';

const DB_CHECK_TIMEOUT_MS = 2000;

async function databaseIsUp(db: Db): Promise<boolean> {
  try {
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('database check timed out')),
          DB_CHECK_TIMEOUT_MS,
        ).unref(),
      ),
    ]);
    return true;
  } catch {
    return false;
  }
}

export function healthRouter(deps: { db: Db; version: string }) {
  const router = Router();

  router.get('/', async (_req, res) => {
    const up = await databaseIsUp(deps.db);
    const body: HealthResponse = {
      status: up ? 'ok' : 'degraded',
      db: up ? 'up' : 'down',
      version: deps.version,
      time: new Date().toISOString(),
    };
    res.status(up ? 200 : 503).json(body);
  });

  return router;
}
