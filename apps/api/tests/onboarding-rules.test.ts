import { describe, expect, it } from 'vitest';
import {
  CURRENT_TERMS_VERSION,
  ageOn,
  normalizeDisplayName,
  parseDateOfBirth,
  validateEssentials,
} from '@scholars/shared';

const TODAY = new Date('2026-11-10T09:00:00.000Z');

const good = {
  displayName: 'Ada',
  dateOfBirth: '2000-05-17',
  level: 'jamb_candidate',
  acceptTerms: true,
  termsVersion: CURRENT_TERMS_VERSION,
};
const check = (patch: Partial<typeof good> & { guardianConsent?: boolean }) =>
  validateEssentials({ ...good, ...patch }, TODAY);
const errorsOf = (patch: Parameters<typeof check>[0]) => {
  const r = check(patch);
  return r.ok ? {} : r.errors;
};

describe('dates of birth', () => {
  it('accepts only real calendar dates in YYYY-MM-DD form', () => {
    expect(parseDateOfBirth('2000-02-29')).toEqual({ y: 2000, m: 2, d: 29 }); // leap year
    for (const bad of [
      '2001-02-29',
      '2000-02-30',
      '2000-13-01',
      '2000-5-17',
      '17-05-2000',
      '',
      'abc',
    ]) {
      expect(parseDateOfBirth(bad), bad).toBeNull();
    }
  });

  it('counts completed years exactly on and around the birthday', () => {
    expect(ageOn('2008-11-10', TODAY)).toBe(18); // turns 18 today
    expect(ageOn('2008-11-11', TODAY)).toBe(17); // turns 18 tomorrow
    expect(ageOn('2008-11-09', TODAY)).toBe(18);
    expect(ageOn('2008-02-29', new Date('2026-02-28T12:00:00Z'))).toBe(17); // leap-day birthday
    expect(ageOn('2008-02-29', new Date('2026-03-01T12:00:00Z'))).toBe(18);
    expect(ageOn('not-a-date', TODAY)).toBeNull();
  });
});

describe('display names', () => {
  it('tidies spaces', () => {
    expect(normalizeDisplayName('  Ada    O.  ')).toBe('Ada O.');
  });

  it('accepts ordinary names, including accents and apostrophes', () => {
    for (const name of [
      "Chidi O'Brien-Eze",
      'Zoë',
      'Ada_01',
      'Tunde A.',
      'Padmini',
      'Ab',
      'x'.repeat(30),
    ]) {
      expect(errorsOf({ displayName: name }).displayName, name).toBeUndefined();
    }
  });

  it('reports each kind of problem', () => {
    expect(errorsOf({ displayName: '   ' }).displayName).toBe('required');
    expect(errorsOf({ displayName: 'A' }).displayName).toBe('too_short');
    expect(errorsOf({ displayName: 'x'.repeat(31) }).displayName).toBe('too_long');
    for (const name of ['Ada<script>', '🔥Ada', 'Ada@home', 'Ada/Bola']) {
      expect(errorsOf({ displayName: name }).displayName, name).toBe('invalid_characters');
    }
  });

  it('blocks names that look like the team, but only as whole words', () => {
    for (const name of [
      'Admin',
      'admin tunde',
      'Official Support',
      'Scholars Syndicate',
      'ScholarsSyndicate',
      'MODERATOR',
    ]) {
      expect(errorsOf({ displayName: name }).displayName, name).toBe('reserved');
    }
    expect(errorsOf({ displayName: 'Padmini' }).displayName).toBeUndefined();
    expect(errorsOf({ displayName: 'Administrator' }).displayName).toBe('reserved');
  });
});

describe('the rest of the form', () => {
  it('accepts a complete adult submission and returns tidy values', () => {
    const r = check({ displayName: '  Ada   O. ' });
    expect(r).toEqual({
      ok: true,
      value: {
        displayName: 'Ada O.',
        dateOfBirth: '2000-05-17',
        level: 'jamb_candidate',
        isMinor: false,
      },
    });
  });

  it('enforces the minimum, maximum and future-date rules', () => {
    expect(errorsOf({ dateOfBirth: '2016-11-11' }).dateOfBirth).toBe('too_young'); // 9
    expect(
      errorsOf({ dateOfBirth: '2016-11-10', guardianConsent: true }).dateOfBirth,
    ).toBeUndefined(); // 10
    expect(errorsOf({ dateOfBirth: '1900-01-01' }).dateOfBirth).toBe('too_old');
    expect(errorsOf({ dateOfBirth: '2027-01-01' }).dateOfBirth).toBe('future');
    expect(errorsOf({ dateOfBirth: '2000-02-30' }).dateOfBirth).toBe('invalid');
    expect(errorsOf({ dateOfBirth: '' }).dateOfBirth).toBe('required');
  });

  it('asks for a guardian only when the student is under 18', () => {
    expect(errorsOf({ dateOfBirth: '2010-01-01' }).guardianConsent).toBe('required'); // 16
    expect(errorsOf({ dateOfBirth: '2010-01-01', guardianConsent: false }).guardianConsent).toBe(
      'required',
    );
    expect(
      errorsOf({ dateOfBirth: '2010-01-01', guardianConsent: true }).guardianConsent,
    ).toBeUndefined();
    expect(errorsOf({ dateOfBirth: '2008-11-10' }).guardianConsent).toBeUndefined(); // 18 today
    expect(errorsOf({ dateOfBirth: '2008-11-11' }).guardianConsent).toBe('required'); // 17
    const minor = check({ dateOfBirth: '2010-01-01', guardianConsent: true });
    expect(minor.ok && minor.value.isMinor).toBe(true);
  });

  it('requires a known level and the current terms', () => {
    expect(errorsOf({ level: 'wizard' }).level).toBe('required');
    expect(errorsOf({ level: '' }).level).toBe('required');
    expect(errorsOf({ acceptTerms: false }).terms).toBe('required');
    expect(errorsOf({ termsVersion: 'old-version' }).terms).toBe('outdated');
  });

  it('reports every problem at once, not one at a time', () => {
    const errs = errorsOf({ displayName: '', dateOfBirth: '', level: '', acceptTerms: false });
    expect(Object.keys(errs).sort()).toEqual(['dateOfBirth', 'displayName', 'level', 'terms']);
  });
});
