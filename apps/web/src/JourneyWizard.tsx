import { useEffect, useState, type FormEvent } from 'react';
import {
  EXAM_TYPES,
  STUDY_TIMES,
  journeyRequestSchema,
  type ExamPlan,
  type JourneyResponse,
} from '@scholars/shared';
import { ApiError, completeJourney, getJourney, saveJourney } from './api';
import { useAuth } from './auth';
import { messageForError } from './messages';

type Journey = JourneyResponse['journey'];
type ExamType = (typeof EXAM_TYPES)[number];
type StudyTime = NonNullable<Journey['preferredStudyTime']>;

const STEPS = ['Your location', 'Exams', 'Subjects', 'Your goals', 'Study routine'] as const;
const EXAM_LABELS: Record<ExamType, string> = {
  jamb: 'JAMB',
  waec: 'WAEC',
  neco: 'NECO',
  post_utme: 'Post-UTME',
};
const STUDY_TIME_LABELS: Record<StudyTime, string> = {
  early_morning: 'Early morning',
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  night: 'Night',
};

function emptyJourney(): Journey {
  return {
    state: null,
    schoolName: null,
    exams: [],
    subjects: [],
    courseInterest: null,
    universityInterests: [],
    dailyStudyGoalMinutes: null,
    preferredStudyTime: null,
    qualityLevel: 'high',
    completedAt: null,
  };
}

function StepFields(props: {
  step: number;
  journey: Journey;
  update(patch: Partial<Journey>): void;
  pendingSubject: string;
  setPendingSubject(value: string): void;
  addSubject(): void;
  removeSubject(value: string): void;
  pendingUniversity: string;
  setPendingUniversity(value: string): void;
  addUniversity(): void;
  removeUniversity(value: string): void;
  setError(value: string | null): void;
}) {
  const { step, journey, update } = props;

  if (step === 0) {
    return (
      <>
        <div className="field">
          <label htmlFor="journey-state">State</label>
          <p className="hint" id="journey-state-hint">
            Optional. Helps us tailor school and exam information to your area.
          </p>
          <input
            id="journey-state"
            type="text"
            autoComplete="address-level1"
            maxLength={50}
            value={journey.state ?? ''}
            aria-describedby="journey-state-hint"
            onChange={(event) => update({ state: event.target.value || null })}
          />
        </div>
        <div className="field">
          <label htmlFor="journey-school">School</label>
          <p className="hint" id="journey-school-hint">
            Optional. This stays private to your account.
          </p>
          <input
            id="journey-school"
            type="text"
            autoComplete="organization"
            maxLength={160}
            value={journey.schoolName ?? ''}
            aria-describedby="journey-school-hint"
            onChange={(event) => update({ schoolName: event.target.value || null })}
          />
        </div>
      </>
    );
  }

  if (step === 1) {
    return (
      <fieldset className="field">
        <legend>Which exams are you preparing for?</legend>
        <p className="hint">Choose any that apply. Exam dates are optional.</p>
        <div className="choice-list">
          {EXAM_TYPES.map((type) => {
            const plan = journey.exams.find((exam) => exam.type === type);
            return (
              <div className="choice-card" key={type}>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={Boolean(plan)}
                    onChange={(event) => {
                      const exams = event.target.checked
                        ? [...journey.exams, { type, date: null }]
                        : journey.exams.filter((exam) => exam.type !== type);
                      update({ exams });
                    }}
                  />
                  <span>{EXAM_LABELS[type]}</span>
                </label>
                {plan && (
                  <div className="choice-detail">
                    <label htmlFor={`journey-exam-${type}`}>Exam date (optional)</label>
                    <input
                      id={`journey-exam-${type}`}
                      type="date"
                      value={plan.date ?? ''}
                      onChange={(event) => {
                        const exams: ExamPlan[] = journey.exams.map((exam) =>
                          exam.type === type ? { ...exam, date: event.target.value || null } : exam,
                        );
                        update({ exams });
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </fieldset>
    );
  }

  if (step === 2) {
    return (
      <div className="field">
        <label htmlFor="journey-subject">Subjects</label>
        <p className="hint" id="journey-subject-hint">
          Add the subjects you want to study. If you are preparing for JAMB, include Use of English
          and the three other subjects for your course.
        </p>
        <div className="add-row">
          <input
            id="journey-subject"
            type="text"
            maxLength={80}
            value={props.pendingSubject}
            aria-describedby="journey-subject-hint"
            onChange={(event) => {
              props.setError(null);
              props.setPendingSubject(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                props.addSubject();
              }
            }}
          />
          <button className="btn-secondary" type="button" onClick={props.addSubject}>
            Add
          </button>
        </div>
        {journey.subjects.length > 0 && (
          <ul className="chip-list" aria-label="Chosen subjects">
            {journey.subjects.map((subject) => (
              <li className="chip" key={subject}>
                <span>{subject}</span>
                <button
                  className="chip-remove"
                  type="button"
                  aria-label={`Remove ${subject}`}
                  onClick={() => props.removeSubject(subject)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="hint">You can add up to 20 subjects and change them later.</p>
      </div>
    );
  }

  if (step === 3) {
    return (
      <>
        <div className="field">
          <label htmlFor="journey-course">Course you are interested in</label>
          <p className="hint" id="journey-course-hint">
            Optional. You can change this as your plans develop.
          </p>
          <input
            id="journey-course"
            type="text"
            maxLength={120}
            value={journey.courseInterest ?? ''}
            aria-describedby="journey-course-hint"
            onChange={(event) => update({ courseInterest: event.target.value || null })}
          />
        </div>
        <div className="field">
          <label htmlFor="journey-university">Universities you are considering</label>
          <p className="hint" id="journey-university-hint">
            Optional. Add up to three. These choices stay private to your account.
          </p>
          <div className="add-row">
            <input
              id="journey-university"
              type="text"
              maxLength={120}
              value={props.pendingUniversity}
              aria-describedby="journey-university-hint"
              onChange={(event) => {
                props.setError(null);
                props.setPendingUniversity(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  props.addUniversity();
                }
              }}
            />
            <button
              className="btn-secondary"
              type="button"
              onClick={props.addUniversity}
              disabled={journey.universityInterests.length >= 3}
            >
              Add
            </button>
          </div>
          {journey.universityInterests.length > 0 && (
            <ul className="chip-list" aria-label="Chosen universities">
              {journey.universityInterests.map((university) => (
                <li className="chip" key={university}>
                  <span>{university}</span>
                  <button
                    className="chip-remove"
                    type="button"
                    aria-label={`Remove ${university}`}
                    onClick={() => props.removeUniversity(university)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="field">
        <label htmlFor="journey-study-goal">Daily study goal (minutes)</label>
        <p className="hint" id="journey-study-goal-hint">
          Optional. Choose a goal that feels manageable.
        </p>
        <input
          id="journey-study-goal"
          type="number"
          inputMode="numeric"
          min={5}
          max={600}
          step={5}
          value={journey.dailyStudyGoalMinutes ?? ''}
          aria-describedby="journey-study-goal-hint"
          onChange={(event) =>
            update({
              dailyStudyGoalMinutes: event.target.value === '' ? null : Number(event.target.value),
            })
          }
        />
      </div>
      <div className="field">
        <label htmlFor="journey-study-time">When do you prefer to study?</label>
        <select
          id="journey-study-time"
          value={journey.preferredStudyTime ?? ''}
          onChange={(event) =>
            update({ preferredStudyTime: (event.target.value || null) as StudyTime | null })
          }
        >
          <option value="">Choose a time (optional)</option>
          {STUDY_TIMES.map((time) => (
            <option key={time} value={time}>
              {STUDY_TIME_LABELS[time]}
            </option>
          ))}
        </select>
      </div>
      <fieldset className="field">
        <legend>Image and data quality</legend>
        <p className="hint">You can change this later in settings.</p>
        <div className="radio-list">
          {[
            ['high', 'High quality', 'Richer images and media.'],
            ['standard', 'Standard', 'A balance of detail and data use.'],
            ['data_saver', 'Data saver', 'Use less data on a limited connection.'],
          ].map(([value, label, description]) => (
            <label className="radio-option radio-option-copy" key={value}>
              <input
                type="radio"
                name="journey-quality"
                value={value}
                checked={journey.qualityLevel === value}
                onChange={() => update({ qualityLevel: value as Journey['qualityLevel'] })}
              />
              <span>
                <strong>{label}</strong>
                <small>{description}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}

/** The wizard step that edits each home card. */
export const STEP_TITLES = STEPS;

/**
 * Two ways to use the wizard. With no props it is the Stage 2 flow (five steps, skippable, finishing
 * onboarding). With `onlyStep` it edits that one step from the home screen: Save returns to home,
 * Cancel leaves everything as it was, and onboarding is never touched.
 */
export function JourneyWizard({
  onlyStep,
  onSaved,
  onCancel,
}: {
  onlyStep?: number;
  onSaved?: (journey: Journey) => void;
  onCancel?: () => void;
} = {}) {
  const { recheck } = useAuth();
  const editing = onlyStep !== undefined;
  const [journey, setJourney] = useState<Journey>(emptyJourney);
  const [step, setStep] = useState(onlyStep ?? 0);
  const [pendingSubject, setPendingSubject] = useState('');
  const [pendingUniversity, setPendingUniversity] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getJourney(controller.signal)
      .then(({ journey: saved }) => {
        setJourney(saved);
        setLoaded(true);
        setLoadError(null);
        setError(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (err instanceof ApiError && err.code === 'not_signed_in') {
          recheck();
          return;
        }
        setLoaded(true);
        setLoadError(
          err instanceof ApiError ? messageForError(err.code) : messageForError('network'),
        );
      });
    return () => controller.abort();
  }, [loadAttempt, recheck]);

  // Opened from the home screen: move focus to the heading so the change is announced and visible.
  useEffect(() => {
    if (!editing || !loaded) return;
    const heading = document.getElementById('journey-title');
    heading?.focus();
    heading?.scrollIntoView?.({ block: 'start' });
  }, [editing, loaded]);

  function update(patch: Partial<Journey>) {
    setError(null);
    setJourney((current) => ({ ...current, ...patch }));
  }

  function addSubject() {
    const value = pendingSubject.trim();
    if (!value) return;
    if (
      journey.subjects.some((subject) => subject.toLocaleLowerCase() === value.toLocaleLowerCase())
    ) {
      setError('That subject is already on your list.');
      return;
    }
    if (journey.subjects.length >= 20) {
      setError('You can add up to 20 subjects.');
      return;
    }
    update({ subjects: [...journey.subjects, value] });
    setPendingSubject('');
  }

  function addUniversity() {
    const value = pendingUniversity.trim();
    if (!value) return;
    if (
      journey.universityInterests.some(
        (university) => university.toLocaleLowerCase() === value.toLocaleLowerCase(),
      )
    ) {
      setError('That university is already on your list.');
      return;
    }
    if (journey.universityInterests.length >= 3) {
      setError('You can add up to three universities.');
      return;
    }
    update({ universityInterests: [...journey.universityInterests, value] });
    setPendingUniversity('');
  }

  function stepPayload() {
    switch (step) {
      case 0:
        return { state: journey.state, schoolName: journey.schoolName };
      case 1:
        return { exams: journey.exams };
      case 2:
        return { subjects: journey.subjects };
      case 3:
        return {
          courseInterest: journey.courseInterest,
          universityInterests: journey.universityInterests,
        };
      default:
        return {
          dailyStudyGoalMinutes: journey.dailyStudyGoalMinutes,
          preferredStudyTime: journey.preferredStudyTime,
          qualityLevel: journey.qualityLevel,
        };
    }
  }

  async function onContinue(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const parsed = journeyRequestSchema.safeParse(stepPayload());
    if (!parsed.success) {
      setError('Please check your answers and try again.');
      return;
    }

    setBusy(true);
    try {
      const saved = await saveJourney(parsed.data);
      setJourney(saved.journey);
      if (editing) {
        onSaved?.(saved.journey);
        return;
      }
      if (step === STEPS.length - 1) {
        await completeJourney();
        recheck();
      } else {
        setStep((current) => current + 1);
        setBusy(false);
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'not_signed_in') {
        recheck();
      } else {
        setBusy(false);
        setError(err instanceof ApiError ? messageForError(err.code) : messageForError('network'));
      }
    }
  }

  async function skip() {
    setError(null);
    setBusy(true);
    if (step < STEPS.length - 1) {
      setStep((current) => current + 1);
      setBusy(false);
      return;
    }
    try {
      await completeJourney();
      recheck();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'not_signed_in') {
        recheck();
      } else {
        setBusy(false);
        setError(err instanceof ApiError ? messageForError(err.code) : messageForError('network'));
      }
    }
  }

  if (!loaded) {
    return (
      <section className="card" aria-busy="true">
        <p className="hint" role="status">
          Loading your learning preferences…
        </p>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="card" aria-labelledby="journey-title">
        <h2 id="journey-title" tabIndex={-1}>
          {editing ? `Update: ${STEPS[step]}` : 'Personalise your journey'}
        </h2>
        <p className="alert" role="alert">
          {loadError}
        </p>
        {editing && (
          <button className="btn-secondary" type="button" onClick={onCancel}>
            Back to home
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setLoaded(false);
            setLoadError(null);
            setLoadAttempt((attempt) => attempt + 1);
          }}
        >
          Try again
        </button>
      </section>
    );
  }

  return (
    <section className="card" aria-labelledby="journey-title">
      <p className="eyebrow">{editing ? 'Your journey' : 'Stage 2 of 3'}</p>
      <h2 id="journey-title" tabIndex={-1}>
        {editing ? `Update: ${STEPS[step]}` : 'Personalise your journey'}
      </h2>
      {!editing && (
        <p>Optional details help us shape useful study guidance for you. You can skip any step.</p>
      )}

      {!editing && (
        <div className="journey-progress">
          <div className="step-label">
            <span>
              Step {step + 1} of {STEPS.length}
            </span>
            <span>{STEPS[step]}</span>
          </div>
          <progress
            value={step + 1}
            max={STEPS.length}
            aria-label={`Step ${step + 1} of ${STEPS.length}`}
          />
        </div>
      )}

      <form onSubmit={onContinue} noValidate>
        <StepFields
          step={step}
          journey={journey}
          update={update}
          pendingSubject={pendingSubject}
          setPendingSubject={setPendingSubject}
          addSubject={addSubject}
          removeSubject={(subject) =>
            update({ subjects: journey.subjects.filter((item) => item !== subject) })
          }
          pendingUniversity={pendingUniversity}
          setPendingUniversity={setPendingUniversity}
          addUniversity={addUniversity}
          removeUniversity={(university) =>
            update({
              universityInterests: journey.universityInterests.filter(
                (item) => item !== university,
              ),
            })
          }
          setError={setError}
        />

        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}

        <div className="journey-actions">
          {editing && (
            <button className="btn-secondary" type="button" disabled={busy} onClick={onCancel}>
              Cancel
            </button>
          )}
          {!editing && step > 0 && (
            <button
              className="btn-secondary"
              type="button"
              disabled={busy}
              onClick={() => setStep((current) => current - 1)}
            >
              Back
            </button>
          )}
          {!editing && (
            <button className="btn-secondary" type="button" disabled={busy} onClick={skip}>
              {busy ? 'Saving…' : step === STEPS.length - 1 ? 'Finish for now' : 'Skip this step'}
            </button>
          )}
          <button type="submit" disabled={busy}>
            {busy
              ? 'Saving…'
              : editing
                ? 'Save'
                : step === STEPS.length - 1
                  ? 'Save and finish'
                  : 'Continue'}
          </button>
        </div>
      </form>
    </section>
  );
}
