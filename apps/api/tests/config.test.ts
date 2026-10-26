import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';

describe('loadConfig', () => {
  it('reads valid settings and applies defaults', () => {
    const c = loadConfig({ DATABASE_URL: 'postgres://u:p@h:5432/d' });
    expect(c.PORT).toBe(4000);
    expect(c.NODE_ENV).toBe('development');
    expect(c.CORS_ORIGIN).toBe('http://localhost:5173');
  });

  it('turns PORT into a number', () => {
    expect(loadConfig({ DATABASE_URL: 'x', PORT: '8080' }).PORT).toBe(8080);
  });

  it('fails with a readable message when DATABASE_URL is missing', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });

  it('rejects an invalid PORT', () => {
    expect(() => loadConfig({ DATABASE_URL: 'x', PORT: 'abc' })).toThrow(/PORT/);
    expect(() => loadConfig({ DATABASE_URL: 'x', PORT: '99999' })).toThrow(/PORT/);
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => loadConfig({ DATABASE_URL: 'x', NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('keeps Google sign-in off until a client id is given', () => {
    expect(loadConfig({ DATABASE_URL: 'x' }).GOOGLE_CLIENT_ID).toBeUndefined();
    expect(
      loadConfig({ DATABASE_URL: 'x', GOOGLE_CLIENT_ID: '' }).GOOGLE_CLIENT_ID,
    ).toBeUndefined();
    expect(
      loadConfig({ DATABASE_URL: 'x', GOOGLE_CLIENT_ID: '  abc.apps.googleusercontent.com ' })
        .GOOGLE_CLIENT_ID,
    ).toBe('abc.apps.googleusercontent.com');
  });

  it('reads how many proxies sit in front of the API', () => {
    expect(loadConfig({ DATABASE_URL: 'x' }).TRUST_PROXY).toBe(0);
    expect(loadConfig({ DATABASE_URL: 'x', TRUST_PROXY: '1' }).TRUST_PROXY).toBe(1);
    expect(() => loadConfig({ DATABASE_URL: 'x', TRUST_PROXY: '-1' })).toThrow(/TRUST_PROXY/);
  });
});
