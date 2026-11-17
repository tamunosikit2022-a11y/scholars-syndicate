import { z } from 'zod';

export const QUESTION_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

const optionLabel = z.enum(['A', 'B', 'C', 'D', 'E', 'F']);

/** A teacher's full replacement of the wording. expectedVersion must match what they were looking at. */
export const editQuestionRequestSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    stem: z.string().trim().min(5).max(5000),
    options: z
      .array(z.object({ label: optionLabel, text: z.string().trim().min(1).max(2000) }).strict())
      .min(2)
      .max(6),
    answer: optionLabel,
    explanation: z.string().trim().min(5).max(5000),
    topic: z.string().trim().min(1).max(120).nullable(),
    difficulty: z.number().int().min(1).max(5),
    note: z.string().trim().max(300).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const labels = value.options.map(({ label }) => label);
    if (new Set(labels).size !== labels.length) {
      context.addIssue({ code: 'custom', path: ['options'], message: 'duplicate_option_label' });
    }
    if (!labels.includes(value.answer)) {
      context.addIssue({ code: 'custom', path: ['answer'], message: 'answer_not_in_options' });
    }
  });
export type EditQuestionRequest = z.infer<typeof editQuestionRequestSchema>;

export const reviewQuestionRequestSchema = z
  .object({ expectedVersion: z.number().int().min(1) })
  .strict();

export const rejectQuestionRequestSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

/** An admin records where permission to use a pack's material came from. */
export const clearRightsRequestSchema = z
  .object({
    rights: z.enum(['owned', 'permission_granted', 'licensed', 'public_domain']),
    evidence: z.string().trim().min(2).max(500),
  })
  .strict();
