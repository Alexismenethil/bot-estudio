import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/lib/db", async () => {
  const { createTestDb } = await import("../../helpers/pglite");
  const { db } = await createTestDb();
  return { db };
});

const { db } = await import("@/lib/db");
const { bankQuestions, courses, flashcards, reviewLogs, topics } = await import("@/lib/db/schema");
const { GET: getDue } = await import("@/app/api/review/due/route");
const { POST: postAnswer } = await import("@/app/api/review/answer/route");

function jsonRequest(body: unknown, method = "POST", url = "https://example.com/api/review/answer") {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function seedCourseTopic() {
  const [course] = await db.insert(courses).values({ code: `IS-${Math.random()}`, name: "QA" }).returning();
  const [topic] = await db.insert(topics).values({ courseId: course.id, name: "SM-2" }).returning();
  return { course: course!, topic: topic! };
}

describe("POST /api/review/answer [FR-013, FR-018, US2-AC2, US2-AC6, US2-AC7]", () => {
  it("advances a flashcard schedule through official review", async () => {
    const { topic } = await seedCourseTopic();
    const [card] = await db
      .insert(flashcards)
      .values({ topicId: topic.id, front: "front", back: "back", nextReviewAt: "2026-07-06" })
      .returning();

    const response = await postAnswer(
      jsonRequest({
        itemType: "flashcard",
        itemId: card.id,
        outcome: "correct",
        context: "review",
        today: "2026-07-06",
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.scheduleChanged).toBe(true);
    expect(body.state.intervalDays).toBe(1);
    expect(body.state.nextReviewAt).toBe("2026-07-07");

    const logs = await db.select().from(reviewLogs).where(eq(reviewLogs.itemId, card.id));
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ scheduleChanged: true, context: "review", outcome: "correct" });
  });

  it("leaves trainer/exam correct bank-question answers untouched", async () => {
    const { topic } = await seedCourseTopic();
    const [question] = await db
      .insert(bankQuestions)
      .values({
        topicId: topic.id,
        prompt: "2+2",
        correctAnswer: "4",
        explanation: "sum",
        nextReviewAt: "2026-08-10",
        intervalDays: 20,
        easeFactor: 2.3,
        repetitions: 4,
      })
      .returning();

    const response = await postAnswer(
      jsonRequest({
        itemType: "bank_question",
        itemId: question.id,
        outcome: "correct",
        context: "trainer",
        today: "2026-07-06",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      scheduleChanged: false,
      state: {
        nextReviewAt: "2026-08-10",
        intervalDays: 20,
        easeFactor: 2.3,
        repetitions: 4,
      },
    });

    const [stored] = await db.select().from(bankQuestions).where(eq(bankQuestions.id, question.id));
    expect(stored).toMatchObject({ nextReviewAt: "2026-08-10", intervalDays: 20, repetitions: 4 });
    const [log] = await db.select().from(reviewLogs).where(eq(reviewLogs.itemId, question.id));
    expect(log?.scheduleChanged).toBe(false);
  });

  it("overrides a future bank-question schedule on incorrect exam answer", async () => {
    const { topic } = await seedCourseTopic();
    const [question] = await db
      .insert(bankQuestions)
      .values({
        topicId: topic.id,
        prompt: "2+2",
        correctAnswer: "4",
        explanation: "sum",
        nextReviewAt: "2026-09-01",
        intervalDays: 40,
        easeFactor: 2.1,
        repetitions: 5,
      })
      .returning();

    const response = await postAnswer(
      jsonRequest({
        itemType: "bank_question",
        itemId: question.id,
        outcome: "incorrect",
        context: "exam",
        today: "2026-07-06",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      scheduleChanged: true,
      state: { nextReviewAt: "2026-07-07", intervalDays: 1, repetitions: 0 },
    });
  });

  it("requires today to keep the API deterministic", async () => {
    const response = await postAnswer(
      jsonRequest({ itemType: "flashcard", itemId: "11111111-1111-4111-8111-111111111111", outcome: "correct", context: "review" }),
    );
    expect(response.status).toBe(400);
  });
});

describe("GET /api/review/due [FR-014, US2-AC5, SC-003]", () => {
  it("returns a scoped due queue across flashcards and bank questions, sorted most-overdue first", async () => {
    const { course, topic } = await seedCourseTopic();
    const [overdueCard] = await db
      .insert(flashcards)
      .values({ topicId: topic.id, front: "overdue", back: "card", nextReviewAt: "2026-07-05" })
      .returning();
    const [dueQuestion] = await db
      .insert(bankQuestions)
      .values({
        topicId: topic.id,
        prompt: "due",
        correctAnswer: "answer",
        explanation: "explanation",
        nextReviewAt: "2026-07-06",
      })
      .returning();
    await db
      .insert(flashcards)
      .values({ topicId: topic.id, front: "week", back: "card", nextReviewAt: "2026-07-10" });
    await db
      .insert(bankQuestions)
      .values({
        topicId: topic.id,
        prompt: "later",
        correctAnswer: "answer",
        explanation: "explanation",
        nextReviewAt: "2026-07-20",
      });

    const todayResponse = await getDue(
      new Request(`https://example.com/api/review/due?scope=course:${course.id}&horizon=today&today=2026-07-06`),
    );
    const todayBody = await todayResponse.json();

    expect(todayResponse.status).toBe(200);
    expect(todayBody.items.map((item: { itemId: string }) => item.itemId)).toEqual([
      overdueCard.id,
      dueQuestion.id,
    ]);
    expect(todayBody.counts).toMatchObject({
      total: 2,
      byType: { flashcard: 1, bankQuestion: 1 },
      byCourse: [{ courseId: course.id, dueCount: 2 }],
      byTopic: [{ topicId: topic.id, dueCount: 2 }],
    });

    const weekResponse = await getDue(
      new Request(`https://example.com/api/review/due?scope=topic:${topic.id}&horizon=week&today=2026-07-06`),
    );
    const weekBody = await weekResponse.json();
    expect(weekBody.items).toHaveLength(3);
    expect(weekBody.items.every((item: { nextReviewAt: string }) => item.nextReviewAt <= "2026-07-13")).toBe(true);
  });

  it("rejects missing today with 400", async () => {
    const response = await getDue(new Request("https://example.com/api/review/due?horizon=today"));
    expect(response.status).toBe(400);
  });
});
