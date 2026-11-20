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

describe('loadConfig in production', () => {
  const safe = {
    DATABASE_URL: 'postgres://u:p@db.example.com:5432/d',
    NODE_ENV: 'production',
    CORS_ORIGIN: 'https://app.scholars.example',
    TRUST_PROXY: '1',
  };

  it('accepts a safe production setup', () => {
    const c = loadConfig(safe);
    expect(c.NODE_ENV).toBe('production');
    expect(c.CORS_ORIGIN).toBe('https://app.scholars.example');
  });

  it('accepts several https website addresses', () => {
    expect(() =>
      loadConfig({ ...safe, CORS_ORIGIN: 'https://a.example.com, https://b.example.com' }),
    ).not.toThrow();
  });

  it('refuses to start without a real website address (no silent localhost default)', () => {
    const { CORS_ORIGIN: _omit, ...rest } = safe;
    void _omit;
    expect(() => loadConfig(rest)).toThrow(/CORS_ORIGIN must be set/);
    expect(() => loadConfig({ ...safe, CORS_ORIGIN: '   ' })).toThrow(/CORS_ORIGIN must be set/);
  });

  it('refuses plain http, localhost and nonsense addresses', () => {
    expect(() => loadConfig({ ...safe, CORS_ORIGIN: 'http://app.example.com' })).toThrow(/https/);
    expect(() => loadConfig({ ...safe, CORS_ORIGIN: 'https://localhost:5173' })).toThrow(
      /localhost/,
    );
    expect(() => loadConfig({ ...safe, CORS_ORIGIN: 'https://127.0.0.1' })).toThrow(/localhost/);
    expect(() => loadConfig({ ...safe, CORS_ORIGIN: 'not a url' })).toThrow(/https/);
    expect(() =>
      loadConfig({ ...safe, CORS_ORIGIN: 'https://ok.example.com,http://bad.example.com' }),
    ).toThrow(/bad\.example\.com/);
  });

  it('makes the person decide about TRUST_PROXY, because rate limits depend on it', () => {
    const { TRUST_PROXY: _omit, ...rest } = safe;
    void _omit;
    expect(() => loadConfig(rest)).toThrow(/TRUST_PROXY must be set/);
    expect(() => loadConfig({ ...safe, TRUST_PROXY: '' })).toThrow(/TRUST_PROXY must be set/);
    expect(() => loadConfig({ ...safe, TRUST_PROXY: '0' })).not.toThrow(); // "no proxy" is a valid, explicit answer
  });

  it('reports every problem at once, so they can be fixed in one go', () => {
    expect(() => loadConfig({ DATABASE_URL: 'x', NODE_ENV: 'production' })).toThrow(
      /CORS_ORIGIN[\s\S]*TRUST_PROXY/,
    );
  });

  it('does not bother developers on their laptop', () => {
    expect(() => loadConfig({ DATABASE_URL: 'x' })).not.toThrow();
    expect(() => loadConfig({ DATABASE_URL: 'x', NODE_ENV: 'test' })).not.toThrow();
  });
});
