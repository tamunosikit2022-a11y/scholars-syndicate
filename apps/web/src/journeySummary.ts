import type { JourneyResponse } from '@scholars/shared';

export type JourneyData = JourneyResponse['journey'];

const EXAM_LABELS: Record<string, string> = {
  jamb: 'JAMB',
  waec: 'WAEC',
  neco: 'NECO',
  post_utme: 'Post-UTME',
};

const STUDY_TIME_LABELS: Record<string, string> = {
  early_morning: 'Early morning',
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  night: 'Night',
};

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC', // the saved date is a calendar day, so never shift it by the phone's time zone
});

function formatDate(isoDay: string): string {
  const parsed = new Date(`${isoDay}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? isoDay : dateFormat.format(parsed);
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min a day`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours} h${rest ? ` ${rest} min` : ''} a day`;
}

/** Shows at most `limit` items, then "+N more", so one card never grows without bound. */
function joinShort(items: string[], limit: number): string {
  if (items.length <= limit) return items.join(', ');
  return `${items.slice(0, limit).join(', ')} +${items.length - limit} more`;
}

/** The eight things Stage 2 asks about, each either filled in or not. */
function filledFlags(journey: JourneyData): boolean[] {
  return [
    Boolean(journey.state),
    Boolean(journey.schoolName),
    journey.exams.length > 0,
    journey.subjects.length > 0,
    Boolean(journey.courseInterest),
    journey.universityInterests.length > 0,
    journey.dailyStudyGoalMinutes !== null,
    journey.preferredStudyTime !== null,
  ];
}

export function journeyCompletion(journey: JourneyData): {
  done: number;
  total: number;
  percent: number;
} {
  const flags = filledFlags(journey);
  const done = flags.filter(Boolean).length;
  return { done, total: flags.length, percent: Math.round((done / flags.length) * 100) };
}

export type CardTone = 'blue' | 'pink' | 'orange' | 'green' | 'purple';
export type CardIcon = 'school' | 'calendar' | 'book' | 'cap' | 'clock';

export interface SummaryCard {
  key: string;
  title: string;
  /** null = the person has not added this yet. */
  value: string | null;
  tone: CardTone;
  icon: CardIcon;
}

/** One card per area of the journey, with a short plain-language value (or null when empty). */
export function summaryCards(journey: JourneyData): SummaryCard[] {
  const place = [journey.schoolName, journey.state].filter(Boolean).join(', ');
  const exams = journey.exams.map((exam) =>
    exam.date
      ? `${EXAM_LABELS[exam.type] ?? exam.type} · ${formatDate(exam.date)}`
      : (EXAM_LABELS[exam.type] ?? exam.type),
  );
  const course = [
    journey.courseInterest,
    journey.universityInterests.length ? joinShort(journey.universityInterests, 3) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const routine = [
    journey.dailyStudyGoalMinutes !== null ? formatMinutes(journey.dailyStudyGoalMinutes) : null,
    journey.preferredStudyTime ? STUDY_TIME_LABELS[journey.preferredStudyTime] : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return [
    { key: 'school', title: 'School', value: place || null, tone: 'blue', icon: 'school' },
    {
      key: 'exams',
      title: 'Exams',
      value: exams.length ? joinShort(exams, 3) : null,
      tone: 'pink',
      icon: 'calendar',
    },
    {
      key: 'subjects',
      title: 'Subjects',
      value: journey.subjects.length ? joinShort(journey.subjects, 4) : null,
      tone: 'orange',
      icon: 'book',
    },
    {
      key: 'course',
      title: 'Course and universities',
      value: course || null,
      tone: 'purple',
      icon: 'cap',
    },
    {
      key: 'routine',
      title: 'Study routine',
      value: routine || null,
      tone: 'green',
      icon: 'clock',
    },
  ];
}
