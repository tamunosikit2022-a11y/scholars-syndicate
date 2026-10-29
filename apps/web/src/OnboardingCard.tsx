import { useState, type FormEvent, type ReactNode } from 'react';
import {
  ADULT_AGE,
  CURRENT_TERMS_VERSION,
  LEVELS,
  MAX_AGE,
  MIN_AGE,
  ageOn,
  validateEssentials,
  type EssentialsFieldErrors,
  type Level,
  type PublicUser,
} from '@scholars/shared';
import { ApiError, NetworkError, saveEssentials } from './api';
import { useAuth } from './auth';
import { LEGAL_DRAFT_NOTICE, LEGAL_SECTIONS } from './legal';
import { fieldMessage, messageForError } from './messages';

const LEVEL_LABELS: Record<Level, string> = {
  jss: 'JSS (junior secondary)',
  ss1: 'SS1',
  ss2: 'SS2',
  ss3: 'SS3',
  jamb_candidate: 'JAMB candidate',
  university_student: 'University student',
  other: 'Other',
};

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** The element to focus when a field is wrong, in the order people fill the form. */
const FIELD_ORDER: Array<[keyof EssentialsFieldErrors, string]> = [
  ['displayName', 'onb-displayName'],
  ['dateOfBirth', 'onb-day'],
  ['level', 'onb-level-first'],
  ['guardianConsent', 'onb-guardian'],
  ['terms', 'onb-terms'],
];

const pad = (value: string) => value.padStart(2, '0');

function suggestedName(user: PublicUser): string {
  return (user.displayName ?? user.fullName).trim().split(/\s+/)[0] ?? '';
}

function Field(props: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={props.id}>{props.label}</label>
      {props.hint && (
        <p className="hint" id={`${props.id}-hint`}>
          {props.hint}
        </p>
      )}
      {props.children}
      {props.error && (
        <p className="error-text" id={`${props.id}-error`} role="alert">
          {props.error}
        </p>
      )}
    </div>
  );
}

export function OnboardingCard({ user }: { user: PublicUser }) {
  const { updateUser, recheck } = useAuth();
  const [displayName, setDisplayName] = useState(() => suggestedName(user));
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [level, setLevel] = useState('');
  const [guardian, setGuardian] = useState(false);
  const [terms, setTerms] = useState(false);
  const [tried, setTried] = useState(false);
  const [serverErrors, setServerErrors] = useState<EssentialsFieldErrors>({});
  const [topError, setTopError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const now = new Date();
  const dateOfBirth = day && month && year ? `${year}-${pad(month)}-${pad(day)}` : '';
  const age = dateOfBirth ? ageOn(dateOfBirth, now) : null;
  const isMinor = age !== null && age >= 0 && age < ADULT_AGE;

  const input = {
    displayName,
    dateOfBirth,
    level,
    acceptTerms: terms,
    termsVersion: CURRENT_TERMS_VERSION,
    guardianConsent: isMinor ? guardian : undefined,
  };
  const local = validateEssentials(input, now);
  // Show problems only after the first "Continue" press, then keep them up to date as the person fixes them.
  const errors: EssentialsFieldErrors = tried ? (local.ok ? serverErrors : local.errors) : {};

  /** Any edit clears errors that came from the server, which have not been re-checked yet. */
  function edited<T>(setter: (value: T) => void) {
    return (value: T) => {
      setServerErrors({});
      setTopError(null);
      setter(value);
    };
  }

  function focusFirst(problems: EssentialsFieldErrors) {
    for (const [field, id] of FIELD_ORDER) {
      if (problems[field]) {
        document.getElementById(id)?.focus();
        return;
      }
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    setTopError(null);
    const result = validateEssentials(input, new Date());
    if (!result.ok) {
      focusFirst(result.errors);
      return;
    }
    setBusy(true);
    try {
      const saved = await saveEssentials({
        ...input,
        displayName: result.value.displayName, // tidied: trimmed, single spaces
        guardianConsent: isMinor ? guardian : undefined,
      });
      updateUser(saved.user); // the screen is replaced by the welcome view, so no more state changes here
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError && err.code === 'validation_failed' && err.fields) {
        const fields = err.fields as EssentialsFieldErrors;
        setServerErrors(fields);
        setTopError(messageForError('validation_failed'));
        focusFirst(fields);
      } else if (err instanceof ApiError && err.code === 'not_signed_in') {
        recheck(); // the session ended: go back to the sign-in card
      } else if (err instanceof ApiError) {
        setTopError(messageForError(err.code));
      } else if (err instanceof NetworkError) {
        setTopError(messageForError('network'));
      } else {
        setTopError(messageForError('unknown_error'));
      }
    }
  }

  const thisYear = now.getUTCFullYear();
  const years: number[] = [];
  for (let y = thisYear - MIN_AGE; y >= thisYear - MAX_AGE; y--) years.push(y);
  const dobError = errors.dateOfBirth ? fieldMessage('dateOfBirth', errors.dateOfBirth) : undefined;

  return (
    <section className="card" aria-labelledby="onboarding-title">
      <h2 id="onboarding-title">Tell us about you</h2>
      <p>A few quick answers to set up your account. You can change your name and level later.</p>

      <form onSubmit={onSubmit} noValidate>
        <Field
          id="onb-displayName"
          label="Display name"
          hint="Shown on leaderboards. Your real name stays private."
          {...(errors.displayName && { error: fieldMessage('displayName', errors.displayName) })}
        >
          <input
            id="onb-displayName"
            type="text"
            value={displayName}
            autoComplete="nickname"
            maxLength={60}
            aria-invalid={Boolean(errors.displayName)}
            aria-describedby={`onb-displayName-hint${errors.displayName ? ' onb-displayName-error' : ''}`}
            onChange={(e) => edited(setDisplayName)(e.target.value)}
          />
        </Field>

        <fieldset className="field" aria-describedby={dobError ? 'onb-dob-error' : undefined}>
          <legend>Date of birth</legend>
          <p className="hint">Private. We use it to protect younger students.</p>
          <div className="date-row">
            <select
              id="onb-day"
              aria-label="Day"
              value={day}
              aria-invalid={Boolean(errors.dateOfBirth)}
              onChange={(e) => edited(setDay)(e.target.value)}
            >
              <option value="">Day</option>
              {Array.from({ length: 31 }, (_, i) => String(i + 1)).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select
              id="onb-month"
              aria-label="Month"
              value={month}
              aria-invalid={Boolean(errors.dateOfBirth)}
              onChange={(e) => edited(setMonth)(e.target.value)}
            >
              <option value="">Month</option>
              {MONTHS.map((name, i) => (
                <option key={name} value={String(i + 1)}>
                  {name}
                </option>
              ))}
            </select>
            <select
              id="onb-year"
              aria-label="Year"
              value={year}
              aria-invalid={Boolean(errors.dateOfBirth)}
              onChange={(e) => edited(setYear)(e.target.value)}
            >
              <option value="">Year</option>
              {years.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          {dobError && (
            <p className="error-text" id="onb-dob-error" role="alert">
              {dobError}
            </p>
          )}
        </fieldset>

        <fieldset className="field" aria-describedby={errors.level ? 'onb-level-error' : undefined}>
          <legend>Where are you on your journey?</legend>
          <div className="radio-list">
            {LEVELS.map((value, index) => (
              <label key={value} className="radio-option">
                <input
                  type="radio"
                  name="level"
                  value={value}
                  id={index === 0 ? 'onb-level-first' : undefined}
                  checked={level === value}
                  onChange={() => edited(setLevel)(value)}
                />
                <span>{LEVEL_LABELS[value]}</span>
              </label>
            ))}
          </div>
          {errors.level && (
            <p className="error-text" id="onb-level-error" role="alert">
              {fieldMessage('level', errors.level)}
            </p>
          )}
        </fieldset>

        {isMinor && (
          <div className="field">
            <label className="check-row">
              <input
                id="onb-guardian"
                type="checkbox"
                checked={guardian}
                aria-invalid={Boolean(errors.guardianConsent)}
                onChange={(e) => edited(setGuardian)(e.target.checked)}
              />
              <span>My parent or guardian knows I am using Scholars Syndicate and allows it.</span>
            </label>
            <p className="hint">We record the time you confirm this.</p>
            {errors.guardianConsent && (
              <p className="error-text" role="alert">
                {fieldMessage('guardianConsent', errors.guardianConsent)}
              </p>
            )}
          </div>
        )}

        <div className="field">
          <details className="legal">
            <summary>Read the Terms of Use and Privacy Policy</summary>
            <p className="alert-note">{LEGAL_DRAFT_NOTICE}</p>
            {LEGAL_SECTIONS.map((section) => (
              <div key={section.title}>
                <h3>{section.title}</h3>
                {section.paragraphs.map((text) => (
                  <p key={text}>{text}</p>
                ))}
              </div>
            ))}
          </details>
          <label className="check-row">
            <input
              id="onb-terms"
              type="checkbox"
              checked={terms}
              aria-invalid={Boolean(errors.terms)}
              onChange={(e) => edited(setTerms)(e.target.checked)}
            />
            <span>I agree to the Terms of Use and Privacy Policy.</span>
          </label>
          {errors.terms && (
            <p className="error-text" role="alert">
              {fieldMessage('terms', errors.terms)}
            </p>
          )}
        </div>

        {topError && (
          <p className="alert" role="alert">
            {topError}
          </p>
        )}

        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Continue'}
        </button>
      </form>
    </section>
  );
}
