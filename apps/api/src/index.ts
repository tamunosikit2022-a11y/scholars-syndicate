import 'dotenv/config';
import { createApp } from './app';
import { createGoogleVerifier } from './auth/google';
import { deleteExpiredSessions } from './auth/sessions';
import { loadConfig } from './config';
import { createDb } from './db/client';
import { VERSION } from './version';

const config = loadConfig();
const { db, pool } = createDb(config.DATABASE_URL);
const verifyGoogleToken = config.GOOGLE_CLIENT_ID
  ? createGoogleVerifier(config.GOOGLE_CLIENT_ID)
  : undefined;
const app = createApp({
  db,
  corsOrigin: config.CORS_ORIGIN,
  version: VERSION,
  verifyGoogleToken,
  googleClientId: config.GOOGLE_CLIENT_ID,
  isProduction: config.NODE_ENV === 'production',
  trustProxy: config.TRUST_PROXY,
});

// Housekeeping: remove sessions that can never be used again (at start, then every 6 hours).
const SIX_HOURS = 6 * 60 * 60 * 1000;
function sweepSessions() {
  deleteExpiredSessions(db, new Date())
    .then((n) => {
      if (n > 0) console.log(`🧹 Removed ${n} expired session(s)`);
    })
    .catch((err: unknown) =>
      console.error('Session clean-up failed:', err instanceof Error ? err.message : err),
    );
}
sweepSessions();
setInterval(sweepSessions, SIX_HOURS).unref();

const server = app.listen(config.PORT, () => {
  console.log(
    `🚀 API v${VERSION} listening on http://localhost:${config.PORT} (${config.NODE_ENV})`,
  );
  console.log(
    verifyGoogleToken
      ? '🔐 Google sign-in: ON'
      : '🔐 Google sign-in: OFF (set GOOGLE_CLIENT_ID in apps/api/.env to switch it on)',
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
