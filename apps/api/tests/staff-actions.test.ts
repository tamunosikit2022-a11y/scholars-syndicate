import { asc, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Role } from '@scholars/shared';
import { createApp } from '../src/app';
import { createSession } from '../src/auth/sessions';
import { questionPacks, questions, staffActions, userRoles, users } from '../src/db/schema';
import { createTestDb } from './helpers';

const ORIGIN = 'http://localhost:5173';
const NOW = new Date('2026-11-21T09:00:00.000Z');
const { db, pool } = createTestDb();
const app = createApp({ db, corsOrigin: ORIGIN, version: 'test', clock: () => NOW });

beforeEach(async () => {
  await db.delete(staffActions);
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
      googleSub: `staff-actions-${n}`,
      email: `staffactions${n}@example.com`,
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
});

async function importPack() {
  const admin = await signedInAs('admin');
  const teacher = await signedInAs('teacher');
  const res = await request(app)
    .post('/api/admin/question-packs')
    .set('Cookie', admin.cookie)
    .send(packBody());
  expect(res.status).toBe(201);
  const [first] = await db.select().from(questions).where(eq(questions.referenceId, 'q1'));
  return { admin, teacher, packId: res.body.packId as string, questionId: first!.id };
}

const allLogLines = () => db.select().from(staffActions).orderBy(asc(staffActions.createdAt));

describe('the staff actions log', () => {
  it('records an import: who, what, which pack, and how many questions', async () => {
    const { admin, packId } = await importPack();
    const lines = await allLogLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      actorId: admin.user.id,
      action: 'pack.import',
      targetType: 'pack',
      targetId: packId,
      detail: { questionCount: 2, rights: 'unknown' },
      createdAt: NOW,
    });
  });

  it('records the rights decision, without storing the evidence text', async () => {
    const { admin, packId } = await importPack();
    const res = await request(app)
      .post(`/api/admin/question-packs/${packId}/rights`)
      .set('Cookie', admin.cookie)
      .send({ rights: 'permission_granted', evidence: 'Letter from the publisher, 3 Nov 2026' });
    expect(res.status).toBe(200);
    const [line] = (await allLogLines()).filter((row) => row.action === 'pack.rights');
    expect(line).toMatchObject({
      actorId: admin.user.id,
      targetType: 'pack',
      targetId: packId,
      detail: { rights: 'permission_granted' },
    });
    expect(JSON.stringify(line!.detail)).not.toContain('publisher');
  });

  it('records an edit with the version it moved from and to, not the wording', async () => {
    const { teacher, questionId } = await importPack();
    const res = await request(app)
      .put(`/api/teacher/questions/${questionId}`)
      .set('Cookie', teacher.cookie)
      .send(edit(1));
    expect(res.status).toBe(200);
    const [line] = (await allLogLines()).filter((row) => row.action === 'question.edit');
    expect(line).toMatchObject({
      actorId: teacher.user.id,
      targetType: 'question',
      targetId: questionId,
      detail: { fromVersion: 1, toVersion: 2 },
    });
    expect(JSON.stringify(line!.detail)).not.toContain('nucleus');
  });

  it('records an approval and a rejection (with its reason)', async () => {
    const { teacher, questionId } = await importPack();
    const approve = await request(app)
      .post(`/api/teacher/questions/${questionId}/approve`)
      .set('Cookie', teacher.cookie)
      .send({ expectedVersion: 1 });
    expect(approve.status).toBe(200);
    const reject = await request(app)
      .post(`/api/teacher/questions/${questionId}/reject`)
      .set('Cookie', teacher.cookie)
      .send({ expectedVersion: 1, reason: 'The answer key is wrong' });
    expect(reject.status).toBe(200);

    const lines = (await allLogLines()).filter((row) => row.targetType === 'question');
    expect(lines.map((row) => row.action).sort()).toEqual(['question.approve', 'question.reject']);
    const rejected = lines.find((row) => row.action === 'question.reject');
    expect(rejected).toMatchObject({
      actorId: teacher.user.id,
      targetId: questionId,
      detail: { version: 1, reason: 'The answer key is wrong' },
    });
  });

  it('logs nothing when an action is refused', async () => {
    const { teacher, questionId } = await importPack();
    const student = await signedInAs('student');
    const before = (await allLogLines()).length;

    // out-of-date version
    expect(
      (
        await request(app)
          .post(`/api/teacher/questions/${questionId}/approve`)
          .set('Cookie', teacher.cookie)
          .send({ expectedVersion: 9 })
      ).status,
    ).toBe(409);
    // invalid input
    expect(
      (
        await request(app)
          .post(`/api/teacher/questions/${questionId}/reject`)
          .set('Cookie', teacher.cookie)
          .send({ expectedVersion: 1 })
      ).status,
    ).toBe(422);
    // wrong role
    expect(
      (
        await request(app)
          .post(`/api/teacher/questions/${questionId}/approve`)
          .set('Cookie', student.cookie)
          .send({ expectedVersion: 1 })
      ).status,
    ).toBe(403);
    // unknown question
    expect(
      (
        await request(app)
          .post('/api/teacher/questions/00000000-0000-4000-8000-000000000000/approve')
          .set('Cookie', teacher.cookie)
          .send({ expectedVersion: 1 })
      ).status,
    ).toBe(404);

    expect(await allLogLines()).toHaveLength(before);
  });

  it('keeps the record when the question is erased or the staff member leaves', async () => {
    const { teacher, packId, questionId } = await importPack();
    await request(app)
      .post(`/api/teacher/questions/${questionId}/approve`)
      .set('Cookie', teacher.cookie)
      .send({ expectedVersion: 1 });

    await db.delete(questionPacks).where(eq(questionPacks.id, packId));
    await db.delete(users).where(eq(users.id, teacher.user.id));

    const lines = await allLogLines();
    expect(lines).toHaveLength(2);
    const approval = lines.find((row) => row.action === 'question.approve');
    expect(approval?.targetId).toBe(questionId);
    expect(approval?.actorId).toBeNull();
  });

  it('refuses a made-up action name or target type at the database level', async () => {
    const { admin, packId } = await importPack();
    await expect(
      pool.query(
        `insert into staff_actions (actor_id, action, target_type, target_id) values ($1, 'question.delete_everything', 'pack', $2)`,
        [admin.user.id, packId],
      ),
    ).rejects.toThrow(/staff_actions_action_valid/);
    await expect(
      pool.query(
        `insert into staff_actions (actor_id, action, target_type, target_id) values ($1, 'pack.import', 'user', $2)`,
        [admin.user.id, packId],
      ),
    ).rejects.toThrow(/staff_actions_target_type_valid/);
  });

  it('leaves no log line behind if the action fails at the very last moment', async () => {
    const { teacher, questionId } = await importPack();
    // Fails when the transaction commits, i.e. AFTER the log line was written inside it.
    await pool.query(`
      create function questions_commit_block() returns trigger as $$
      begin raise exception 'commit refused'; end $$ language plpgsql`);
    await pool.query(`
      create constraint trigger questions_commit_block_trigger after update on questions
      deferrable initially deferred for each row execute function questions_commit_block()`);
    try {
      const before = (await allLogLines()).length;
      const res = await request(app)
        .post(`/api/teacher/questions/${questionId}/approve`)
        .set('Cookie', teacher.cookie)
        .send({ expectedVersion: 1 });
      expect(res.status).toBe(500);
      expect(await allLogLines()).toHaveLength(before); // no record of something that did not happen
    } finally {
      await pool.query('drop trigger questions_commit_block_trigger on questions');
      await pool.query('drop function questions_commit_block()');
    }
  });

  it('undoes the action itself if the log line cannot be written', async () => {
    const { teacher, questionId } = await importPack();
    await pool.query(`
      create function staff_actions_block() returns trigger as $$
      begin raise exception 'log unavailable'; end $$ language plpgsql`);
    await pool.query(`
      create trigger staff_actions_block_trigger before insert on staff_actions
      for each row execute function staff_actions_block()`);
    try {
      const res = await request(app)
        .post(`/api/teacher/questions/${questionId}/approve`)
        .set('Cookie', teacher.cookie)
        .send({ expectedVersion: 1 });
      expect(res.status).toBe(500);
      const [row] = await db.select().from(questions).where(eq(questions.id, questionId));
      expect(row?.status).toBe('pending'); // nothing was approved without a record
      expect(row?.reviewedBy).toBeNull();
    } finally {
      await pool.query('drop trigger staff_actions_block_trigger on staff_actions');
      await pool.query('drop function staff_actions_block()');
    }
  });
});
