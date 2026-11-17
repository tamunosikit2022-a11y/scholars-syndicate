import { z } from 'zod';

export const QUESTION_PACK_SCHEMA_VERSION = 1 as const;
export const QUESTION_EXAMS = ['jamb', 'waec', 'neco', 'post_utme'] as const;
export const QUESTION_ORIGINS = [
  'past_question',
  'teacher_authored',
  'generated_from_pdf',
] as const;
export const QUESTION_RIGHTS = [
  'owned',
  'permission_granted',
  'licensed',
  'public_domain',
  'unknown',
] as const;
export const QUESTION_REVIEW_STATES = ['pending', 'verified'] as const;

const optionLabel = z.enum(['A', 'B', 'C', 'D', 'E', 'F']);

export const questionBankQuestionSchema = z
  .object({
    referenceId: z.string().trim().min(1).max(80),
    exam: z.enum(QUESTION_EXAMS),
    origin: z.enum(QUESTION_ORIGINS),
    year: z.number().int().min(1950).max(2100).nullable().default(null),
    subject: z.string().trim().min(2).max(80),
    topic: z.string().trim().min(1).max(120).nullable().default(null),
    stem: z.string().trim().min(5).max(5000),
    options: z
      .array(
        z
          .object({
            label: optionLabel,
            text: z.string().trim().min(1).max(2000),
          })
          .strict(),
      )
      .min(2)
      .max(6),
    answer: optionLabel,
    explanation: z.string().trim().min(5).max(5000),
    difficulty: z.number().int().min(1).max(5).default(3),
    sourcePage: z.number().int().min(1),
    reviewStatus: z.enum(QUESTION_REVIEW_STATES).default('pending'),
    reviewedBy: z.string().trim().min(2).max(120).optional(),
    reviewedAt: z.string().datetime().optional(),
  })
  .strict()
  .superRefine((question, context) => {
    const labels = question.options.map(({ label }) => label);
    if (new Set(labels).size !== labels.length) {
      context.addIssue({ code: 'custom', path: ['options'], message: 'duplicate_option_label' });
    }
    if (!labels.includes(question.answer)) {
      context.addIssue({ code: 'custom', path: ['answer'], message: 'answer_not_in_options' });
    }
    if (question.origin === 'past_question' && question.year === null) {
      context.addIssue({ code: 'custom', path: ['year'], message: 'past_question_year_required' });
    }
    if (question.reviewStatus === 'verified' && (!question.reviewedBy || !question.reviewedAt)) {
      context.addIssue({
        code: 'custom',
        path: ['reviewStatus'],
        message: 'verified_question_needs_reviewer_and_time',
      });
    }
  });

export const questionBankPackSchema = z
  .object({
    schemaVersion: z.literal(QUESTION_PACK_SCHEMA_VERSION),
    title: z.string().trim().min(2).max(160),
    sourceDocument: z
      .object({
        title: z.string().trim().min(2).max(200),
        rights: z.enum(QUESTION_RIGHTS),
        rightsEvidence: z.string().trim().min(2).max(500).optional(),
      })
      .strict(),
    questions: z.array(questionBankQuestionSchema).min(1).max(1000),
  })
  .strict()
  .superRefine((pack, context) => {
    if (pack.sourceDocument.rights !== 'unknown' && !pack.sourceDocument.rightsEvidence) {
      context.addIssue({
        code: 'custom',
        path: ['sourceDocument', 'rightsEvidence'],
        message: 'rights_evidence_required',
      });
    }

    const ids = new Set<string>();
    const stems = new Set<string>();
    pack.questions.forEach((question, index) => {
      if (ids.has(question.referenceId)) {
        context.addIssue({
          code: 'custom',
          path: ['questions', index, 'referenceId'],
          message: 'duplicate_reference_id',
        });
      }
      ids.add(question.referenceId);

      const normalizedStem = question.stem.toLocaleLowerCase().replace(/\s+/g, ' ');
      if (stems.has(normalizedStem)) {
        context.addIssue({
          code: 'custom',
          path: ['questions', index, 'stem'],
          message: 'duplicate_question_stem',
        });
      }
      stems.add(normalizedStem);
    });
  });

export type QuestionBankQuestion = z.infer<typeof questionBankQuestionSchema>;
export type QuestionBankPack = z.infer<typeof questionBankPackSchema>;
