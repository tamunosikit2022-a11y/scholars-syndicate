import { z } from 'zod';

/** Journey preferences collected during onboarding Stage 2. */
export const EXAM_TYPES = ['jamb', 'waec', 'neco', 'post_utme'] as const;
export const STUDY_TIMES = ['early_morning', 'morning', 'afternoon', 'evening', 'night'] as const;
export const QUALITY_LEVELS = ['high', 'standard', 'data_saver'] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value === '' ? null : value));

export const examPlanSchema = z.object({
  type: z.enum(EXAM_TYPES),
  date: z.string().date().nullable(),
});

export const journeyRequestSchema = z
  .object({
    state: optionalText(50),
    schoolName: optionalText(160),
    exams: z.array(examPlanSchema).max(EXAM_TYPES.length).optional(),
    subjects: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
    courseInterest: optionalText(120),
    universityInterests: z.array(z.string().trim().min(1).max(120)).max(3).optional(),
    dailyStudyGoalMinutes: z.number().int().min(5).max(600).nullable().optional(),
    preferredStudyTime: z.enum(STUDY_TIMES).nullable().optional(),
    qualityLevel: z.enum(QUALITY_LEVELS).optional(),
  })
  .strict()
  .superRefine((journey, context) => {
    const examTypes = journey.exams?.map(({ type }) => type) ?? [];
    if (new Set(examTypes).size !== examTypes.length) {
      context.addIssue({ code: 'custom', path: ['exams'], message: 'duplicate_exam' });
    }
    const subjects = journey.subjects?.map((subject) => subject.toLocaleLowerCase()) ?? [];
    if (new Set(subjects).size !== subjects.length) {
      context.addIssue({ code: 'custom', path: ['subjects'], message: 'duplicate_subject' });
    }
    const universities =
      journey.universityInterests?.map((university) => university.toLocaleLowerCase()) ?? [];
    if (new Set(universities).size !== universities.length) {
      context.addIssue({
        code: 'custom',
        path: ['universityInterests'],
        message: 'duplicate_university',
      });
    }
  });

export type ExamPlan = z.infer<typeof examPlanSchema>;
export type JourneyRequest = z.input<typeof journeyRequestSchema>;

export const journeyResponseSchema = z.object({
  journey: z.object({
    state: z.string().nullable(),
    schoolName: z.string().nullable(),
    exams: z.array(examPlanSchema),
    subjects: z.array(z.string()),
    courseInterest: z.string().nullable(),
    universityInterests: z.array(z.string()),
    dailyStudyGoalMinutes: z.number().int().nullable(),
    preferredStudyTime: z.enum(STUDY_TIMES).nullable(),
    qualityLevel: z.enum(QUALITY_LEVELS),
    completedAt: z.string().datetime().nullable(),
  }),
});
export type JourneyResponse = z.infer<typeof journeyResponseSchema>;
