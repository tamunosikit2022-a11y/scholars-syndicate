import 'dotenv/config';
import { createApp } from './app';
import { loadConfig } from './config';
import { createDb } from './db/client';
import { VERSION } from './version';

const config = loadConfig();
const { db, pool } = createDb(config.DATABASE_URL);
const app = createApp({ db, corsOrigin: config.CORS_ORIGIN, version: VERSION });

const server = app.listen(config.PORT, () => {
  console.log(
    `🚀 API v${VERSION} listening on http://localhost:${config.PORT} (${config.NODE_ENV})`,
  );
});

function shutdown(signal: string) {
  console.log(`${signal} received — shutting down…`);
  server.close(() => {
    void pool.end().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref(); // do not hang forever
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
