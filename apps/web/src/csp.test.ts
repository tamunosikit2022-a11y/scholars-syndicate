import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import '@scholars/shared';

describe('strict Content-Security-Policy compatibility', () => {
  it('switches off zod’s eval probe in the browser, so a strict policy sees no violation', () => {
    // If this fails, loading the website under `script-src 'self'` logs a blocked-eval violation on every page.
    expect(z.config().jitless).toBe(true);
  });

  it('still validates exactly the same without the speed-up', () => {
    const schema = z.object({ name: z.string().min(2), age: z.number().int().optional() });
    expect(schema.safeParse({ name: 'Ada', age: 17 }).success).toBe(true);
    expect(schema.safeParse({ name: 'A' }).success).toBe(false);
    expect(schema.safeParse({ name: 'Ada', age: 1.5 }).success).toBe(false);
  });
});
