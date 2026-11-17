import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { Router, type Response } from 'express';
import {
  QUESTION_STATUSES,
  clearRightsRequestSchema,
  editQuestionRequestSchema,
  questionBankPackSchema,
  rejectQuestionRequestSchema,
  reviewQuestionRequestSchema,
} from '@scholars/shared';
import { requireRole } from '../auth/middleware';
import type { Db } from '../db/client';
import { questionPacks, questionRevisions, questions } from '../db/schema';

export interface QuestionRoutesDeps {
  db: Db;
  clock: () => Date;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const idOf = (value: unknown): string | null =>
  typeof value === 'string' && UUID.test(value) ? value : null;

function issuesOf(error: {
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>;
}) {
  return error.issues.map((issue) => ({
    path: issue.path.map((part) => String(part)).join('.'),
    message: issue.message,
  }));
}

type QuestionRow = typeof questions.$inferSelect;
type PackRow = typeof questionPacks.$inferSelect;

/** Everything a reviewer needs to judge one question. */
function toQuestionView(q: QuestionRow, pack: PackRow) {
  return {
    id: q.id,
    referenceId: q.referenceId,
    exam: q.exam,
    origin: q.origin,
    year: q.year,
    subject: q.subject,
    topic: q.topic,
    stem: q.stem,
    options: q.options,
    answer: q.answer,
    explanation: q.explanation,
    difficulty: q.difficulty,
    sourcePage: q.sourcePage,
    status: q.status,
    rejectionReason: q.rejectionReason,
    reviewedAt: q.reviewedAt?.toISOString() ?? null,
    version: q.version,
    pack: {
      id: pack.id,
      title: pack.title,
      sourceTitle: pack.sourceTitle,
      rights: pack.rights,
      rightsEvidence: pack.rightsEvidence,
    },
    // Approved by a teacher AND permission to use the material is on record.
    publishable: q.status === 'approved' && pack.rights !== 'unknown',
  };
}

async function loadQuestion(db: Db, id: string) {
  const [row] = await db
    .select({ question: questions, pack: questionPacks })
    .from(questions)
    .innerJoin(questionPacks, eq(questions.packId, questionPacks.id))
    .where(eq(questions.id, id))
    .limit(1);
  return row ?? null;
}

async function sendQuestion(db: Db, id: string, res: Response) {
  const row = await loadQuestion(db, id);
  if (!row) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.json({ question: toQuestionView(row.question, row.pack) });
}

/** Explains why a review action changed nothing: gone, someone edited it meanwhile, or wrong state. */
async function refuse(db: Db, id: string, expectedVersion: number, res: Response) {
  const [current] = await db
    .select({ version: questions.version })
    .from(questions)
    .where(eq(questions.id, id))
    .limit(1);
  if (!current) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.status(409).json({
    error: current.version !== expectedVersion ? 'version_conflict' : 'invalid_state',
  });
}

const noStore = (
  _req: unknown,
  res: { set: (name: string, value: string) => void },
  next: () => void,
) => {
  res.set('Cache-Control', 'no-store');
  next();
};

/** Admin only: bring a validated pack in (as pending) and record where its rights stand. */
export function adminQuestionPacksRouter(deps: QuestionRoutesDeps) {
  const router = Router();
  router.use(requireRole('admin'));
  router.use(noStore);

  router.post('/', async (req, res) => {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    const parsed = questionBankPackSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: 'validation_failed', issues: issuesOf(parsed.error) });
      return;
    }
    const pack = parsed.data;
    const now = deps.clock();

    const packId = await deps.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(questionPacks)
        .values({
          title: pack.title,
          sourceTitle: pack.sourceDocument.title,
          rights: pack.sourceDocument.rights,
          rightsEvidence: pack.sourceDocument.rightsEvidence ?? null,
          importedBy: auth.user.id,
          createdAt: now,
        })
        .returning({ id: questionPacks.id });
      if (!created) throw new Error('Could not save the question pack');

      // Whatever review state the file claims, everything starts as pending.
      await tx.insert(questions).values(
        pack.questions.map((q) => ({
          packId: created.id,
          referenceId: q.referenceId,
          exam: q.exam,
          origin: q.origin,
          year: q.year,
          subject: q.subject,
          topic: q.topic,
          stem: q.stem,
          options: q.options,
          answer: q.answer,
          explanation: q.explanation,
          difficulty: q.difficulty,
          sourcePage: q.sourcePage,
          createdAt: now,
          updatedAt: now,
        })),
      );
      return created.id;
    });

    res.status(201).json({
      packId,
      imported: pack.questions.length,
      rights: pack.sourceDocument.rights,
    });
  });

  router.post('/:id/rights', async (req, res) => {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    const id = idOf(req.params.id);
    if (!id) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const parsed = clearRightsRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: 'validation_failed', issues: issuesOf(parsed.error) });
      return;
    }
    const [updated] = await deps.db
      .update(questionPacks)
      .set({
        rights: parsed.data.rights,
        rightsEvidence: parsed.data.evidence,
        rightsClearedBy: auth.user.id,
        rightsClearedAt: deps.clock(),
      })
      .where(eq(questionPacks.id, id))
      .returning({ id: questionPacks.id, rights: questionPacks.rights });
    if (!updated) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({ packId: updated.id, rights: updated.rights });
  });

  return router;
}

/** Teachers and admins: the review queue. Students never reach these routes. */
export function teacherQuestionsRouter(deps: QuestionRoutesDeps) {
  const router = Router();
  router.use(requireRole('teacher', 'admin'));
  router.use(noStore);

  router.get('/', async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : 'pending';
    if (!(QUESTION_STATUSES as readonly string[]).includes(status)) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    const limit = Math.min(
      Math.max(Number.parseInt(String(req.query.limit ?? '50'), 10) || 50, 1),
      100,
    );
    const offset = Math.max(Number.parseInt(String(req.query.offset ?? '0'), 10) || 0, 0);

    const [rows, counted] = await Promise.all([
      deps.db
        .select({ question: questions, pack: questionPacks })
        .from(questions)
        .innerJoin(questionPacks, eq(questions.packId, questionPacks.id))
        .where(eq(questions.status, status))
        .orderBy(asc(questions.createdAt), asc(questions.id))
        .limit(limit)
        .offset(offset),
      deps.db
        .select({ n: sql<number>`count(*)::int` })
        .from(questions)
        .where(eq(questions.status, status)),
    ]);

    res.json({
      total: counted[0]?.n ?? 0,
      questions: rows.map(({ question, pack }) => ({
        id: question.id,
        referenceId: question.referenceId,
        exam: question.exam,
        origin: question.origin,
        subject: question.subject,
        topic: question.topic,
        stem: question.stem,
        status: question.status,
        version: question.version,
        packTitle: pack.title,
        rights: pack.rights,
        publishable: question.status === 'approved' && pack.rights !== 'unknown',
      })),
    });
  });

  router.get('/:id', async (req, res) => {
    const id = idOf(req.params.id);
    if (!id) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const row = await loadQuestion(deps.db, id);
    if (!row) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const revisions = await deps.db
      .select()
      .from(questionRevisions)
      .where(eq(questionRevisions.questionId, id))
      .orderBy(desc(questionRevisions.version));
    res.json({
      question: toQuestionView(row.question, row.pack),
      // Revision N keeps the text exactly as it was before the edit that created version N+1.
      revisions: revisions.map((revision) => ({
        version: revision.version,
        snapshot: revision.snapshot,
        note: revision.note,
        editedAt: revision.createdAt.toISOString(),
      })),
    });
  });

  router.put('/:id', async (req, res) => {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    const id = idOf(req.params.id);
    if (!id) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const parsed = editQuestionRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: 'validation_failed', issues: issuesOf(parsed.error) });
      return;
    }
    const input = parsed.data;
    const now = deps.clock();

    const outcome = await deps.db.transaction(async (tx) => {
      const [current] = await tx.select().from(questions).where(eq(questions.id, id)).limit(1);
      if (!current) return 'not_found' as const;
      if (current.version !== input.expectedVersion) return 'version_conflict' as const;

      // The version check sits in the WHERE too, so two edits at once cannot both win.
      const [updated] = await tx
        .update(questions)
        .set({
          stem: input.stem,
          options: input.options,
          answer: input.answer,
          explanation: input.explanation,
          topic: input.topic,
          difficulty: input.difficulty,
          status: 'pending',
          rejectionReason: null,
          reviewedBy: null,
          reviewedAt: null,
          version: current.version + 1,
          updatedAt: now,
        })
        .where(and(eq(questions.id, id), eq(questions.version, input.expectedVersion)))
        .returning({ id: questions.id });
      if (!updated) return 'version_conflict' as const;

      await tx.insert(questionRevisions).values({
        questionId: id,
        version: current.version,
        snapshot: {
          stem: current.stem,
          options: current.options,
          answer: current.answer,
          explanation: current.explanation,
          topic: current.topic,
          difficulty: current.difficulty,
        },
        editedBy: auth.user.id,
        note: input.note ?? null,
        createdAt: now,
      });
      return 'ok' as const;
    });

    if (outcome === 'not_found') {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    if (outcome === 'version_conflict') {
      res.status(409).json({ error: 'version_conflict' });
      return;
    }
    await sendQuestion(deps.db, id, res);
  });

  router.post('/:id/approve', async (req, res) => {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    const id = idOf(req.params.id);
    if (!id) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const parsed = reviewQuestionRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: 'validation_failed', issues: issuesOf(parsed.error) });
      return;
    }
    const now = deps.clock();
    const [updated] = await deps.db
      .update(questions)
      .set({
        status: 'approved',
        reviewedBy: auth.user.id,
        reviewedAt: now,
        rejectionReason: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(questions.id, id),
          eq(questions.status, 'pending'),
          eq(questions.version, parsed.data.expectedVersion),
        ),
      )
      .returning({ id: questions.id });
    if (!updated) {
      await refuse(deps.db, id, parsed.data.expectedVersion, res);
      return;
    }
    await sendQuestion(deps.db, id, res);
  });

  router.post('/:id/reject', async (req, res) => {
    const auth = req.auth;
    if (!auth) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    const id = idOf(req.params.id);
    if (!id) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const parsed = rejectQuestionRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: 'validation_failed', issues: issuesOf(parsed.error) });
      return;
    }
    const now = deps.clock();
    const [updated] = await deps.db
      .update(questions)
      .set({
        status: 'rejected',
        reviewedBy: auth.user.id,
        reviewedAt: now,
        rejectionReason: parsed.data.reason,
        updatedAt: now,
      })
      .where(
        and(
          eq(questions.id, id),
          inArray(questions.status, ['pending', 'approved']),
          eq(questions.version, parsed.data.expectedVersion),
        ),
      )
      .returning({ id: questions.id });
    if (!updated) {
      await refuse(deps.db, id, parsed.data.expectedVersion, res);
      return;
    }
    await sendQuestion(deps.db, id, res);
  });

  return router;
}
