import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Role } from '@scholars/shared';
import { createApp } from '../src/app';
import { createSession } from '../src/auth/sessions';
import { questionPacks, questionRevisions, questions, userRoles, users } from '../src/db/schema';
import { createTestDb } from './helpers';

const ORIGIN = 'http://localhost:5173';
const NOW = new Date('2026-11-16T09:00:00.000Z');
const { db, pool } = createTestDb();
const app = createApp({ db, corsOrigin: ORIGIN, version: 'test', clock: () => NOW });

beforeEach(async () => {
  await db.delete(questionPacks);
  await db.delete(users);
});
afterAll(async () => {
  await pool.end();
});

let n = 0;
async function signedInAs(role: Role) {
  n += 1;
  const [user] = await db
    .insert(users)
    .values({
      googleSub: `questions-${n}`,
      email: `questions${n}@example.com`,
      fullName: 'Test Person',
      onboardingStage: 1,
    })
    .returning();
  await db.insert(userRoles).values({ userId: user!.id, role });
  const { token } = await createSession(db, user!.id, 'test', NOW);
  return { user: user!, cookie: `ss_session=${token}` };
}

const question = (referenceId: string, stem: string) => ({
  referenceId,
  exam: 'jamb',
  origin: 'generated_from_pdf',
  year: null,
  subject: 'Biology',
  topic: 'Cells',
  stem,
  options: [
    { label: 'A', text: 'Cell wall' },
    { label: 'B', text: 'Nucleus' },
    { label: 'C', text: 'Cytoplasm' },
    { label: 'D', text: 'Vacuole' },
  ],
  answer: 'B',
  explanation: 'The nucleus controls cell activities.',
  difficulty: 3,
  sourcePage: 2,
  reviewStatus: 'pending',
});

const packBody = () => ({
  schemaVersion: 1,
  title: 'Biology practice',
  sourceDocument: { title: 'Class notes', rights: 'unknown' },
  questions: [
    question('q1', 'Which structure controls the activities of a cell?'),
    question('q2', 'Which part of a cell makes protein?'),
  ],
});

const edit = (expectedVersion: number) => ({
  expectedVersion,
  stem: 'Which structure controls what a cell does?',
  options: [
    { label: 'A', text: 'Cell wall' },
    { label: 'B', text: 'Nucleus' },
    { label: 'C', text: 'Cytoplasm' },
    { label: 'D', text: 'Vacuole' },
  ],
  answer: 'B',
  explanation: 'The nucleus holds the genetic material that directs the cell.',
  topic: 'Cells',
  difficulty: 2,
  note: 'Clearer wording',
});

/** An admin imports a pack; returns the pack id and the id of its first question. */
async function importPack() {
  const admin = await signedInAs('admin');
  const res = await request(app)
    .post('/api/admin/question-packs')
    .set('Cookie', admin.cookie)
    .send(packBody());
  expect(res.status).toBe(201);
  const [first] = await db.select().from(questions).where(eq(questions.referenceId, 'q1'));
  return { admin, packId: res.body.packId as string, questionId: first!.id };
}

describe('importing a pack', () => {
  it('needs someone signed in as an admin', async () => {
    expect((await request(app).post('/api/admin/question-packs').send(packBody())).status).toBe(
      401,
    );
    const teacher = await signedInAs('teacher');
    const res = await request(app)
      .post('/api/admin/question-packs')
      .set('Cookie', teacher.cookie)
      .send(packBody());
    expect(res.status).toBe(403);
  });

  it('stores every question as pending, even if the file claims verified', async () => {
    const admin = await signedInAs('admin');
    const body = packBody();
    body.questions[0] = {
      ...body.questions[0]!,
      reviewStatus: 'verified',
      // @ts-expect-error extra keys the pack format allows when verified
      reviewedBy: 'Mr Ade',
      reviewedAt: NOW.toISOString(),
    };
    const res = await request(app)
      .post('/api/admin/question-packs')
      .set('Cookie', admin.cookie)
      .send(body);
    expect(res.status).toBe(201);
    expect(res.body.imported).toBe(2);
    const rows = await db.select().from(questions);
    expect(rows.map((row) => row.status)).toEqual(['pending', 'pending']);
    expect(rows.every((row) => row.version === 1)).toBe(true);
  });

  it('rejects a pack whose answer is not one of the options', async () => {
    const admin = await signedInAs('admin');
    const body = packBody();
    body.questions[0] = { ...body.questions[0]!, answer: 'F' };
    const res = await request(app)
      .post('/api/admin/question-packs')
      .set('Cookie', admin.cookie)
      .send(body);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('validation_failed');
    expect(await db.select().from(questionPacks)).toHaveLength(0);
  });
});

describe('the review queue', () => {
  it('is closed to students and signed-out visitors', async () => {
    expect((await request(app).get('/api/teacher/questions')).status).toBe(401);
    const student = await signedInAs('student');
    const res = await request(app).get('/api/teacher/questions').set('Cookie', student.cookie);
    expect(res.status).toBe(403);
  });

  it('shows a teacher the pending questions with their rights status', async () => {
    await importPack();
    const teacher = await signedInAs('teacher');
    const res = await request(app).get('/api/teacher/questions').set('Cookie', teacher.cookie);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.questions[0].status).toBe('pending');
    expect(res.body.questions[0].rights).toBe('unknown');
    expect(res.body.questions[0].publishable).toBe(false);
  });

  it('shows everything needed to judge one question', async () => {
    const { questionId } = await importPack();
    const teacher = await signedInAs('teacher');
    const res = await request(app)
      .get(`/api/teacher/questions/${questionId}`)
      .set('Cookie', teacher.cookie);
    expect(res.status).toBe(200);
    expect(res.body.question.options).toHaveLength(4);
    expect(res.body.question.answer).toBe('B');
    expect(res.body.question.explanation).toContain('nucleus');
    expect(res.body.question.sourcePage).toBe(2);
    expect(res.body.question.origin).toBe('generated_from_pdf');
    expect(res.body.revisions).toEqual([]);
  });
});

describe('editing wording', () => {
  it('saves the old text as a revision and bumps the version', async () => {
    const { questionId } = await importPack();
    const teacher = await signedInAs('teacher');
    const res = await request(app)
      .put(`/api/teacher/questions/${questionId}`)
      .set('Cookie', teacher.cookie)
      .send(edit(1));
    expect(res.status).toBe(200);
    expect(res.body.question.version).toBe(2);
    expect(res.body.question.stem).toBe('Which structure controls what a cell does?');

    const revisions = await db
      .select()
      .from(questionRevisions)
      .where(eq(questionRevisions.questionId, questionId));
    expect(revisions).toHaveLength(1);
    expect(revisions[0]!.version).toBe(1);
    expect(revisions[0]!.snapshot.stem).toBe('Which structure controls the activities of a cell?');
    expect(revisions[0]!.note).toBe('Clearer wording');
  });

  it('refuses an edit made from an out-of-date version', async () => {
    const { questionId } = await importPack();
    const teacher = await signedInAs('teacher');
    await request(app)
      .put(`/api/teacher/questions/${questionId}`)
      .set('Cookie', teacher.cookie)
      .send(edit(1));
    const again = await request(app)
      .put(`/api/teacher/questions/${questionId}`)
      .set('Cookie', teacher.cookie)
      .send(edit(1));
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('version_conflict');
  });

  it('sends an approved question back to pending', async () => {
    const { questionId } = await importPack();
    const teacher = await signedInAs('teacher');
    await request(app)
      .post(`/api/teacher/questions/${questionId}/approve`)
      .set('Cookie', teacher.cookie)
      .send({ expectedVersion: 1 });
    const res = await request(app)
      .put(`/api/teacher/questions/${questionId}`)
      .set('Cookie', teacher.cookie)
      .send(edit(1));
    expect(res.body.question.status).toBe('pending');
    expect(res.body.question.reviewedAt).toBeNull();
  });

  it('rejects wording whose answer is not among the options', async () => {
    const { questionId } = await importPack();
    const teacher = await signedInAs('teacher');
    const res = await request(app)
      .put(`/api/teacher/questions/${questionId}`)
      .set('Cookie', teacher.cookie)
      .send({ ...edit(1), answer: 'F' });
    expect(res.status).toBe(422);
  });
});

describe('approving and rejecting', () => {
  it('approves a pending question, but it is not publishable while rights are unknown', async () => {
    const { questionId } = await importPack();
    const teacher = await signedInAs('teacher');
    const res = await request(app)
      .post(`/api/teacher/questions/${questionId}/approve`)
      .set('Cookie', teacher.cookie)
      .send({ expectedVersion: 1 });
    expect(res.status).toBe(200);
    expect(res.body.question.status).toBe('approved');
    expect(res.body.question.publishable).toBe(false);
  });

  it('becomes publishable once an admin records the rights', async () => {
    const { admin, packId, questionId } = await importPack();
    const teacher = await signedInAs('teacher');
    await request(app)
      .post(`/api/teacher/questions/${questionId}/approve`)
      .set('Cookie', teacher.cookie)
      .send({ expectedVersion: 1 });

    const body = { rights: 'permission_granted', evidence: 'Email from the author, 12 Nov 2026' };
    const asTeacher = await request(app)
      .post(`/api/admin/question-packs/${packId}/rights`)
      .set('Cookie', teacher.cookie)
      .send(body);
    expect(asTeacher.status).toBe(403);

    const asAdmin = await request(app)
      .post(`/api/admin/question-packs/${packId}/rights`)
      .set('Cookie', admin.cookie)
      .send(body);
    expect(asAdmin.status).toBe(200);

    const res = await request(app)
      .get(`/api/teacher/questions/${questionId}`)
      .set('Cookie', teacher.cookie);
    expect(res.body.question.publishable).toBe(true);
  });

  it('refuses to approve text that changed since the teacher looked', async () => {
    const { questionId } = await importPack();
    const teacher = await signedInAs('teacher');
    await request(app)
      .put(`/api/teacher/questions/${questionId}`)
      .set('Cookie', teacher.cookie)
      .send(edit(1));
    const res = await request(app)
      .post(`/api/teacher/questions/${questionId}/approve`)
      .set('Cookie', teacher.cookie)
      .send({ expectedVersion: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('version_conflict');
  });

  it('needs a reason to reject, and can reject an approved question', async () => {
    const { questionId } = await importPack();
    const teacher = await signedInAs('teacher');
    await request(app)
      .post(`/api/teacher/questions/${questionId}/approve`)
      .set('Cookie', teacher.cookie)
      .send({ expectedVersion: 1 });

    const noReason = await request(app)
      .post(`/api/teacher/questions/${questionId}/reject`)
      .set('Cookie', teacher.cookie)
      .send({ expectedVersion: 1 });
    expect(noReason.status).toBe(422);

    const res = await request(app)
      .post(`/api/teacher/questions/${questionId}/reject`)
      .set('Cookie', teacher.cookie)
      .send({ expectedVersion: 1, reason: 'Two options could be correct' });
    expect(res.status).toBe(200);
    expect(res.body.question.status).toBe('rejected');
    expect(res.body.question.rejectionReason).toBe('Two options could be correct');
  });
});
