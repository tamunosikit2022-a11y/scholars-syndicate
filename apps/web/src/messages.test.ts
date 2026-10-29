import { describe, expect, it } from 'vitest';
import { AUTH_ERROR_CODES } from '@scholars/shared';
import { fieldMessage, messageForError } from './messages';

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

describe('form field messages', () => {
  const GENERIC = 'Please check this answer.';
  const CODES: Record<string, string[]> = {
    displayName: ['required', 'too_short', 'too_long', 'invalid_characters', 'reserved'],
    dateOfBirth: ['required', 'invalid', 'future', 'too_young', 'too_old'],
    level: ['required'],
    terms: ['required', 'outdated'],
    guardianConsent: ['required'],
  };

  it('has a specific message for every rule on every field', () => {
    for (const [field, codes] of Object.entries(CODES)) {
      for (const code of codes)
        expect(fieldMessage(field, code), `${field}.${code}`).not.toBe(GENERIC);
    }
  });

  it('mentions the minimum age, and falls back safely for unknown codes', () => {
    expect(fieldMessage('dateOfBirth', 'too_young')).toContain('10');
    expect(fieldMessage('displayName', 'brand_new_rule')).toBe(GENERIC);
    expect(fieldMessage('nonsense', 'required')).toBe(GENERIC);
  });
});
