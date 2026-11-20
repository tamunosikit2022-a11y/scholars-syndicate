import { z } from 'zod';

/**
 * In a browser, switch off zod's "just-in-time" speed-up. That speed-up first tests whether the page may
 * run `new Function(...)`, and a strict Content-Security-Policy (our recommended one, see docs/SECURITY.md)
 * reports every such test as a violation, even though the test is harmless. Validation is exactly the same
 * without it; only the server, which has no `document`, keeps the speed-up.
 *
 * This module must be the FIRST thing in index.ts: zod probes while schemas are created, so the switch has
 * to be flipped before any schema exists.
 */
if ('document' in globalThis) {
  z.config({ jitless: true });
}
