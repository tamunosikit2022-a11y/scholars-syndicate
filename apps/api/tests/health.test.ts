import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { healthResponseSchema } from '@scholars/shared';
import { createApp } from '../src/app';
import { createDb } from '../src/db/client';
import { createTestDb } from './helpers';

const ORIGIN = 'http://localhost:5173';
const { db, pool } = createTestDb();
const app = createApp({ db, corsOrigin: ORIGIN, version: 'test' });

afterAll(async () => {
  await pool.end();
});

describe('GET /api/health', () => {
  it('reports ok when the database is reachable', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    const body = healthResponseSchema.parse(res.body); // matches the shared contract
    expect(body.status).toBe('ok');
    expect(body.db).toBe('up');
    expect(body.version).toBe('test');
  });

  it('reports degraded (503) when the database is down', async () => {
    // Port 1 is closed, so connecting fails immediately.
    const dead = createDb('postgres://nobody:nobody@127.0.0.1:1/none', {
      connectionTimeoutMillis: 500,
      max: 1,
    });
    const deadApp = createApp({ db: dead.db, corsOrigin: ORIGIN, version: 'test' });
    const res = await request(deadApp).get('/api/health');
    await dead.pool.end();
    expect(res.status).toBe(503);
    const body = healthResponseSchema.parse(res.body);
    expect(body.status).toBe('degraded');
    expect(body.db).toBe('down');
  });
});

describe('app basics', () => {
  it('returns a JSON 404 for unknown routes', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  it('returns 400 invalid_json for a malformed JSON body (no stack trace leaked)', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_json' });
  });

  it('sends security headers and hides the framework', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('allows the configured web origin and no other', async () => {
    const allowed = await request(app).get('/api/health').set('Origin', ORIGIN);
    expect(allowed.headers['access-control-allow-origin']).toBe(ORIGIN);
    const blocked = await request(app).get('/api/health').set('Origin', 'https://evil.example');
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  });
});
