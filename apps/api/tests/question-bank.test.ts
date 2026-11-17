import { describe, expect, it } from 'vitest';
import { questionBankPackSchema } from '@scholars/shared';

const question = {
  referenceId: 'page-2-question-1',
  exam: 'jamb',
  origin: 'generated_from_pdf',
  year: null,
  subject: 'Biology',
  topic: 'Cells',
  stem: 'Which structure controls the activities of a cell?',
  options: [
    { label: 'A', text: 'Cell wall' },
    { label: 'B', text: 'Nucleus' },
    { label: 'C', text: 'Cytoplasm' },
    { label: 'D', text: 'Vacuole' },
  ],
  answer: 'B',
  explanation: 'The nucleus contains genetic material and controls cell activities.',
  sourcePage: 2,
};

const pack = {
  schemaVersion: 1,
  title: 'Biology practice draft',
  sourceDocument: {
    title: 'Biology class notes',
    rights: 'unknown',
  },
  questions: [question],
};

describe('question bank JSON contract', () => {
  it('accepts a traceable draft and defaults it to pending teacher review', () => {
    const result = questionBankPackSchema.parse(pack);
    expect(result.questions[0]).toMatchObject({
      reviewStatus: 'pending',
      difficulty: 3,
      year: null,
    });
  });

  it('rejects an answer key that is not one of the listed options', () => {
    const result = questionBankPackSchema.safeParse({
      ...pack,
      questions: [{ ...question, answer: 'E' }],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map((issue) => issue.message)).toContain('answer_not_in_options');
  });

  it('rejects duplicate option labels, question references and repeated question text', () => {
    const repeated = {
      ...question,
      options: [
        { label: 'A', text: 'First choice' },
        { label: 'A', text: 'Second choice' },
      ],
    };
    const result = questionBankPackSchema.safeParse({ ...pack, questions: [repeated, { ...question }] });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues.map((issue) => issue.message);
      expect(issues).toContain('duplicate_option_label');
      expect(issues).toContain('duplicate_reference_id');
      expect(issues).toContain('duplicate_question_stem');
    }
  });

  it('requires a year for imported past questions', () => {
    const result = questionBankPackSchema.safeParse({
      ...pack,
      questions: [{ ...question, origin: 'past_question', year: null }],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map((issue) => issue.message)).toContain('past_question_year_required');
  });

  it('requires reviewer details before a question can be marked verified', () => {
    const result = questionBankPackSchema.safeParse({
      ...pack,
      questions: [{ ...question, reviewStatus: 'verified' }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain(
        'verified_question_needs_reviewer_and_time',
      );
    }
  });

  it('requires a note when claiming the source is licensed, owned or cleared for use', () => {
    const result = questionBankPackSchema.safeParse({
      ...pack,
      sourceDocument: { title: 'Biology class notes', rights: 'licensed' },
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map((issue) => issue.message)).toContain('rights_evidence_required');
  });
});
