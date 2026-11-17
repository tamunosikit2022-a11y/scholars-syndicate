import { describe, expect, it } from 'vitest';
import { journeyCompletion, summaryCards, type JourneyData } from './journeySummary';

const empty: JourneyData = {
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

const full: JourneyData = {
  state: 'Rivers',
  schoolName: 'Government College',
  exams: [
    { type: 'jamb', date: '2027-03-14' },
    { type: 'waec', date: null },
  ],
  subjects: ['English', 'Mathematics', 'Physics', 'Chemistry'],
  courseInterest: 'Medicine',
  universityInterests: ['UNIPORT', 'UNILAG'],
  dailyStudyGoalMinutes: 90,
  preferredStudyTime: 'evening',
  qualityLevel: 'standard',
  completedAt: '2026-11-01T10:00:00.000Z',
};

const valueOf = (journey: JourneyData, key: string) =>
  summaryCards(journey).find((card) => card.key === key)?.value;

describe('journeyCompletion', () => {
  it('is 0% when nothing has been added (the quality level always has a default)', () => {
    expect(journeyCompletion(empty)).toEqual({ done: 0, total: 8, percent: 0 });
  });

  it('is 100% when all eight answers are filled in', () => {
    expect(journeyCompletion(full)).toEqual({ done: 8, total: 8, percent: 100 });
  });

  it('counts each answer once and rounds the percentage', () => {
    const some = { ...empty, state: 'Lagos', subjects: ['English'], dailyStudyGoalMinutes: 30 };
    expect(journeyCompletion(some)).toEqual({ done: 3, total: 8, percent: 38 });
  });

  it('treats a saved 0-length list or blank text as not filled in', () => {
    expect(journeyCompletion({ ...empty, schoolName: '', exams: [], subjects: [] }).done).toBe(0);
  });
});

describe('summaryCards', () => {
  it('has one card per area, and every card is empty for a new journey', () => {
    const cards = summaryCards(empty);
    expect(cards.map((c) => c.key)).toEqual(['school', 'exams', 'subjects', 'course', 'routine']);
    expect(cards.every((c) => c.value === null)).toBe(true);
  });

  it('writes short plain-language values', () => {
    expect(valueOf(full, 'school')).toBe('Government College, Rivers');
    expect(valueOf(full, 'exams')).toBe('JAMB · 14 Mar 2027, WAEC');
    expect(valueOf(full, 'subjects')).toBe('English, Mathematics, Physics, Chemistry');
    expect(valueOf(full, 'course')).toBe('Medicine · UNIPORT, UNILAG');
    expect(valueOf(full, 'routine')).toBe('1 h 30 min a day · Evening');
  });

  it('shows what exists when only part of an area is filled in', () => {
    expect(valueOf({ ...empty, state: 'Rivers' }, 'school')).toBe('Rivers');
    expect(valueOf({ ...empty, schoolName: 'Unity' }, 'school')).toBe('Unity');
    expect(valueOf({ ...empty, universityInterests: ['UNIPORT'] }, 'course')).toBe('UNIPORT');
    expect(valueOf({ ...empty, preferredStudyTime: 'night' }, 'routine')).toBe('Night');
  });

  it('does not let a long list grow without bound', () => {
    const many = ['A', 'B', 'C', 'D', 'E', 'F'];
    expect(valueOf({ ...empty, subjects: many }, 'subjects')).toBe('A, B, C, D +2 more');
  });

  it('formats study time under an hour, and exact hours', () => {
    expect(valueOf({ ...empty, dailyStudyGoalMinutes: 45 }, 'routine')).toBe('45 min a day');
    expect(valueOf({ ...empty, dailyStudyGoalMinutes: 120 }, 'routine')).toBe('2 h a day');
  });

  it('keeps an exam calendar day as saved, whatever the phone time zone', () => {
    const exam = { ...empty, exams: [{ type: 'post_utme' as const, date: '2027-01-01' }] };
    expect(valueOf(exam, 'exams')).toBe('Post-UTME · 1 Jan 2027');
  });
});
