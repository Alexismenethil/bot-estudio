import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async () => {
  const { createTestDb } = await import("../../helpers/pglite");
  const { db } = await createTestDb();
  return { db };
});

const { db } = await import("@/lib/db");
const { courses, topics } = await import("@/lib/db/schema");
const { isDue } = await import("@/lib/engine/sm2");
const { GET: getFlashcards, POST: postFlashcard } = await import("@/app/api/flashcards/route");
const { PATCH: patchFlashcard, DELETE: deleteFlashcard } = await import("@/app/api/flashcards/[id]/route");

function jsonRequest(body: unknown, method = "POST", url = "https://example.com/api/flashcards") {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function createTopic() {
  const [course] = await db.insert(courses).values({ code: `IS-${Math.random()}`, name: "QA" }).returning();
  const [topic] = await db.insert(topics).values({ courseId: course.id, name: "SM-2" }).returning();
  return topic.id as string;
}

describe("POST/PATCH/DELETE /api/flashcards [FR-010, FR-011, US2-AC1]", () => {
  it("creates a flashcard due on its creation day and lists it by topic", async () => {
    const topicId = await createTopic();

    const response = await postFlashcard(jsonRequest({ topicId, front: "TDD", back: "Tests first" }));

    expect(response.status).toBe(201);
    const created = await response.json();
    expect(created).toMatchObject({
      topicId,
      front: "TDD",
      back: "Tests first",
      intervalDays: 0,
      repetitions: 0,
    });
    expect(created.easeFactor).toBeCloseTo(2.5);
    expect(isDue(created, created.nextReviewAt)).toBe(true);

    const listResponse = await getFlashcards(
      new Request(`https://example.com/api/flashcards?topicId=${topicId}`),
    );
    const { flashcards } = await listResponse.json();
    expect(flashcards).toHaveLength(1);
    expect(flashcards[0].id).toBe(created.id);
  });

  it("rejects invalid flashcard bodies with 400", async () => {
    const response = await postFlashcard(jsonRequest({ topicId: "not-a-uuid", front: "", back: "" }));
    expect(response.status).toBe(400);
  });

  it("updates flashcard front/back text", async () => {
    const topicId = await createTopic();
    const created = await (await postFlashcard(jsonRequest({ topicId, front: "Old", back: "Back" }))).json();

    const response = await patchFlashcard(jsonRequest({ front: "New", back: "Updated" }, "PATCH"), {
      params: Promise.resolve({ id: created.id }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ front: "New", back: "Updated" });
  });

  it("deletes a flashcard", async () => {
    const topicId = await createTopic();
    const created = await (await postFlashcard(jsonRequest({ topicId, front: "Delete", back: "Me" }))).json();

    const response = await deleteFlashcard(jsonRequest({}, "DELETE"), {
      params: Promise.resolve({ id: created.id }),
    });

    expect(response.status).toBe(204);
    const listResponse = await getFlashcards(
      new Request(`https://example.com/api/flashcards?topicId=${topicId}`),
    );
    const { flashcards } = await listResponse.json();
    expect(flashcards).toEqual([]);
  });
});
