import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async () => {
  const { createTestDb } = await import("../../helpers/pglite");
  const { db } = await createTestDb();
  return { db };
});

const { db } = await import("@/lib/db");
const { bankQuestions, courses, examSessions, reviewLogs, sessionAnswers, topics } = await import(
  "@/lib/db/schema"
);
const { POST: postSession } = await import("@/app/api/exam/sessions/route");
const { GET: getSession } = await import("@/app/api/exam/sessions/[id]/route");
const { POST: postExamAnswer } = await import("@/app/api/exam/sessions/[id]/answers/route");
const { POST: postFinalize } = await import("@/app/api/exam/sessions/[id]/finalize/route");

function jsonRequest(body: unknown, method = "POST", url = "https://example.com/api/exam/sessions") {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: method === "GET" || method === "HEAD" ? undefined : JSON.stringify(body),
  });
}

function isoDateAfter(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function seedCourseTopic() {
  const [course] = await db.insert(courses).values({ code: `EX-${Math.random()}`, name: "QA" }).returning();
  const [topic] = await db.insert(topics).values({ courseId: course.id, name: "Examen" }).returning();
  return { course: course!, topic: topic! };
}

async function seedQuestion(topicId: string, values: Partial<typeof bankQuestions.$inferInsert> = {}) {
  const [question] = await db
    .insert(bankQuestions)
    .values({
      topicId,
      prompt: values.prompt ?? "Pregunta",
      correctAnswer: values.correctAnswer ?? "Correcta",
      explanation: values.explanation ?? "Explicacion",
      nextReviewAt: values.nextReviewAt ?? "2026-09-01",
      intervalDays: values.intervalDays ?? 20,
      easeFactor: values.easeFactor ?? 2.4,
      repetitions: values.repetitions ?? 3,
    })
    .returning();
  return question!;
}

async function expireSession(sessionId: string) {
  await db
    .update(examSessions)
    .set({ startedAt: new Date(Date.now() - 120_000) })
    .where(eq(examSessions.id, sessionId));
}

describe("POST /api/exam/sessions [FR-019, US4-AC1]", () => {
  it("creates an exam with server startedAt and a frozen question draw", async () => {
    const { topic } = await seedCourseTopic();
    const first = await seedQuestion(topic.id, { prompt: "A", correctAnswer: "A" });
    const second = await seedQuestion(topic.id, { prompt: "B", correctAnswer: "B" });

    const response = await postSession(jsonRequest({ scopeType: "topic", scopeId: topic.id, durationSeconds: 120 }));

    expect(response.status).toBe(201);
    const created = await response.json();
    expect(created).toMatchObject({
      scopeType: "topic",
      scopeId: topic.id,
      durationSeconds: 120,
      status: "active",
    });
    expect(Date.parse(created.startedAt)).not.toBeNaN();
    expect(created.remainingMs).toBeGreaterThan(0);
    expect(created.remainingMs).toBeLessThanOrEqual(120_000);
    expect(new Set(created.questionIds)).toEqual(new Set([first.id, second.id]));
  });

  it("rejects an empty bank with 422", async () => {
    const { topic } = await seedCourseTopic();

    const response = await postSession(jsonRequest({ scopeType: "topic", scopeId: topic.id, durationSeconds: 120 }));

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "empty_bank" } });
  });
});

describe("GET /api/exam/sessions/:id [FR-020, FR-029, US4-AC5, US4-AC6]", () => {
  it("returns a server-computed remainingMs for resume", async () => {
    const { topic } = await seedCourseTopic();
    await seedQuestion(topic.id);
    const session = await (
      await postSession(jsonRequest({ scopeType: "topic", scopeId: topic.id, durationSeconds: 120 }))
    ).json();
    await db
      .update(examSessions)
      .set({ startedAt: new Date(Date.now() - 30_000) })
      .where(eq(examSessions.id, session.id));

    const response = await getSession(jsonRequest({}, "GET"), { params: Promise.resolve({ id: session.id }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("active");
    expect(body.remainingMs).toBeGreaterThan(0);
    expect(body.remainingMs).toBeLessThan(120_000);
  });

  it("auto-finalizes when read after the deadline", async () => {
    const { topic } = await seedCourseTopic();
    const first = await seedQuestion(topic.id, { correctAnswer: "A" });
    const second = await seedQuestion(topic.id, { correctAnswer: "B" });
    const session = await (
      await postSession(jsonRequest({ scopeType: "topic", scopeId: topic.id, durationSeconds: 1 }))
    ).json();
    await postExamAnswer(
      jsonRequest({ questionId: first.id, givenAnswer: "A" }),
      { params: Promise.resolve({ id: session.id }) },
    );
    await expireSession(session.id);

    const response = await getSession(jsonRequest({}, "GET"), { params: Promise.resolve({ id: session.id }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("finished");
    expect(body.remainingMs).toBe(0);
    expect(body.report).toMatchObject({
      totalQuestions: 2,
      answeredCount: 1,
      correctCount: 1,
      failed: [{ questionId: second.id, topicId: topic.id }],
    });
  });
});

describe("POST /api/exam/sessions/:id/answers [FR-020]", () => {
  it("rejects answers after expiry and finalizes without storing the late answer", async () => {
    const { topic } = await seedCourseTopic();
    const question = await seedQuestion(topic.id, { correctAnswer: "A" });
    const session = await (
      await postSession(jsonRequest({ scopeType: "topic", scopeId: topic.id, durationSeconds: 1 }))
    ).json();
    await expireSession(session.id);

    const response = await postExamAnswer(
      jsonRequest({ questionId: question.id, givenAnswer: "A" }),
      { params: Promise.resolve({ id: session.id }) },
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "expired" } });
    const answers = await db.select().from(sessionAnswers).where(eq(sessionAnswers.sessionId, session.id));
    expect(answers).toHaveLength(0);
  });
});

describe("POST /api/exam/sessions/:id/finalize [FR-018, FR-021, US4-AC3, US4-AC4]", () => {
  it("is idempotent and applies SM-2 priority-review overrides to failed questions", async () => {
    const { topic } = await seedCourseTopic();
    const correct = await seedQuestion(topic.id, {
      prompt: "Correct",
      correctAnswer: "A",
      nextReviewAt: "2026-09-01",
      intervalDays: 40,
      easeFactor: 2.2,
      repetitions: 5,
    });
    const failed = await seedQuestion(topic.id, {
      prompt: "Failed",
      correctAnswer: "B",
      nextReviewAt: "2026-09-01",
      intervalDays: 40,
      easeFactor: 2.2,
      repetitions: 5,
    });
    const session = await (
      await postSession(jsonRequest({ scopeType: "topic", scopeId: topic.id, durationSeconds: 120 }))
    ).json();
    await postExamAnswer(
      jsonRequest({ questionId: correct.id, givenAnswer: "A" }),
      { params: Promise.resolve({ id: session.id }) },
    );
    await postExamAnswer(
      jsonRequest({ questionId: failed.id, givenAnswer: "wrong" }),
      { params: Promise.resolve({ id: session.id }) },
    );

    const firstFinalize = await postFinalize(jsonRequest({}, "POST"), {
      params: Promise.resolve({ id: session.id }),
    });
    const firstReport = await firstFinalize.json();
    const secondFinalize = await postFinalize(jsonRequest({}, "POST"), {
      params: Promise.resolve({ id: session.id }),
    });
    const secondReport = await secondFinalize.json();

    expect(firstFinalize.status).toBe(200);
    expect(secondFinalize.status).toBe(200);
    expect(secondReport).toEqual(firstReport);
    expect(firstReport).toMatchObject({
      totalQuestions: 2,
      answeredCount: 2,
      correctCount: 1,
      failed: [{ questionId: failed.id, topicId: topic.id }],
    });

    const [storedFailed] = await db.select().from(bankQuestions).where(eq(bankQuestions.id, failed.id));
    expect(storedFailed).toMatchObject({
      nextReviewAt: isoDateAfter(todayIso(), 1),
      intervalDays: 1,
      repetitions: 0,
    });
    const [storedCorrect] = await db.select().from(bankQuestions).where(eq(bankQuestions.id, correct.id));
    expect(storedCorrect).toMatchObject({ nextReviewAt: "2026-09-01", intervalDays: 40, repetitions: 5 });

    const logs = await db
      .select()
      .from(reviewLogs)
      .where(and(eq(reviewLogs.itemId, failed.id), eq(reviewLogs.context, "exam")));
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ outcome: "incorrect", scheduleChanged: true });
  });
});
