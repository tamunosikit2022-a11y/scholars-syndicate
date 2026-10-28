import { describe, expect, it } from 'vitest';
import { AUTH_ERROR_CODES } from '@scholars/shared';
import { messageForError } from './messages';

describe('error messages', () => {
  const generic = messageForError('definitely-not-a-real-code');

  it('falls back to a safe generic message for unknown codes', () => {
    expect(generic).toMatch(/something went wrong/i);
  });

  it('has a specific, human message for every error the server can send', () => {
    // not_signed_in is normal (it just means "show the sign-in card"), so it has no message.
    for (const code of AUTH_ERROR_CODES.filter((c) => c !== 'not_signed_in')) {
      expect(messageForError(code), code).not.toBe(generic);
    }
  });

  it('never leaks internal codes to people', () => {
    for (const code of AUTH_ERROR_CODES) expect(messageForError(code)).not.toContain('_');
  });
});
