import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async () => {
  const { createTestDb } = await import("../../helpers/pglite");
  const { db } = await createTestDb();
  return { db };
});

const { db } = await import("@/lib/db");
const { bankQuestions, courses, reviewLogs, sessionAnswers, topics } = await import("@/lib/db/schema");
const { POST: postSession } = await import("@/app/api/trainer/sessions/route");
const { GET: getSession } = await import("@/app/api/trainer/sessions/[id]/route");
const { POST: postTrainerAnswer } = await import("@/app/api/trainer/sessions/[id]/answers/route");

function jsonRequest(body: unknown, method = "POST", url = "https://example.com/api/trainer/sessions") {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: method === "GET" || method === "HEAD" ? undefined : JSON.stringify(body),
  });
}

async function seedCourseTopic() {
  const [course] = await db.insert(courses).values({ code: `IS-${Math.random()}`, name: "QA" }).returning();
  const [topic] = await db.insert(topics).values({ courseId: course.id, name: "Entrenador" }).returning();
  return { course: course!, topic: topic! };
}

describe("POST /api/trainer/sessions [FR-015, FR-016, US3-AC2]", () => {
  it("creates a topic-scoped trainer session with a frozen question draw", async () => {
    const { topic } = await seedCourseTopic();
    const [first] = await db
      .insert(bankQuestions)
      .values({ topicId: topic.id, prompt: "A", correctAnswer: "A", explanation: "Primera" })
      .returning();
    const [second] = await db
      .insert(bankQuestions)
      .values({ topicId: topic.id, prompt: "B", correctAnswer: "B", explanation: "Segunda" })
      .returning();

    const response = await postSession(jsonRequest({ scopeType: "topic", scopeId: topic.id }));

    expect(response.status).toBe(201);
    const created = await response.json();
    expect(created).toMatchObject({
      scopeType: "topic",
      scopeId: topic.id,
      currentIndex: 0,
      status: "active",
    });
    expect(new Set(created.questionIds)).toEqual(new Set([first.id, second.id]));

    await db
      .insert(bankQuestions)
      .values({ topicId: topic.id, prompt: "C", correctAnswer: "C", explanation: "Late addition" });

    const resumeResponse = await getSession(jsonRequest({}, "GET"), {
      params: Promise.resolve({ id: created.id }),
    });
    expect(resumeResponse.status).toBe(200);
    const resumed = await resumeResponse.json();
    expect(resumed.questionIds).toEqual(created.questionIds);
    expect(resumed.currentIndex).toBe(0);
  });

  it("rejects an empty question bank with 422", async () => {
    const { topic } = await seedCourseTopic();

    const response = await postSession(jsonRequest({ scopeType: "topic", scopeId: topic.id }));

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: { code: "empty_bank" },
    });
  });
});

describe("POST /api/trainer/sessions/:id/answers [FR-017, FR-018, FR-029, US3-AC4, US3-AC5]", () => {
  it("returns immediate correct feedback without changing the SM-2 schedule", async () => {
    const { topic } = await seedCourseTopic();
    const [question] = await db
      .insert(bankQuestions)
      .values({
        topicId: topic.id,
        prompt: "Nombre de la práctica",
        correctAnswer: "TDD",
        explanation: "TDD exige ver fallar un test antes de implementar.",
        nextReviewAt: "2026-08-01",
        intervalDays: 9,
        easeFactor: 2.4,
        repetitions: 3,
      })
      .returning();
    const session = await (await postSession(jsonRequest({ scopeType: "topic", scopeId: topic.id }))).json();

    const response = await postTrainerAnswer(
      jsonRequest({
        questionId: question.id,
        givenAnswer: "  tdd  ",
        today: "2026-07-06",
      }),
      { params: Promise.resolve({ id: session.id }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      isCorrect: true,
      explanation: "TDD exige ver fallar un test antes de implementar.",
      review: {
        scheduleChanged: false,
        state: { nextReviewAt: "2026-08-01", intervalDays: 9, repetitions: 3 },
      },
    });

    const [stored] = await db.select().from(bankQuestions).where(eq(bankQuestions.id, question.id));
    expect(stored).toMatchObject({ nextReviewAt: "2026-08-01", intervalDays: 9, repetitions: 3 });
    const answers = await db.select().from(sessionAnswers).where(eq(sessionAnswers.sessionId, session.id));
    expect(answers).toHaveLength(1);
    expect(answers[0]).toMatchObject({ sessionKind: "trainer", questionId: question.id, isCorrect: true });

    const resumeResponse = await getSession(jsonRequest({}, "GET"), {
      params: Promise.resolve({ id: session.id }),
    });
    expect(await resumeResponse.json()).toMatchObject({ currentIndex: 1, status: "finished" });
  });

  it("marks an incorrect answer for priority review via the SM-2 override", async () => {
    const { topic } = await seedCourseTopic();
    const [question] = await db
      .insert(bankQuestions)
      .values({
        topicId: topic.id,
        prompt: "2 + 2",
        correctAnswer: "4",
        explanation: "Dos pares forman cuatro.",
        nextReviewAt: "2026-09-01",
        intervalDays: 40,
        easeFactor: 2.1,
        repetitions: 5,
      })
      .returning();
    const session = await (await postSession(jsonRequest({ scopeType: "topic", scopeId: topic.id }))).json();

    const response = await postTrainerAnswer(
      jsonRequest({
        questionId: question.id,
        givenAnswer: "5",
        today: "2026-07-06",
      }),
      { params: Promise.resolve({ id: session.id }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      isCorrect: false,
      explanation: "Dos pares forman cuatro.",
      review: {
        scheduleChanged: true,
        state: { nextReviewAt: "2026-07-07", intervalDays: 1, repetitions: 0 },
      },
    });

    const [stored] = await db.select().from(bankQuestions).where(eq(bankQuestions.id, question.id));
    expect(stored).toMatchObject({ nextReviewAt: "2026-07-07", intervalDays: 1, repetitions: 0 });
    const [log] = await db.select().from(reviewLogs).where(eq(reviewLogs.itemId, question.id));
    expect(log).toMatchObject({
      itemType: "bank_question",
      context: "trainer",
      outcome: "incorrect",
      scheduleChanged: true,
    });
  });
});
