import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async () => {
  const { createTestDb } = await import("../../helpers/pglite");
  const { db } = await createTestDb();
  return { db };
});

const { GET: getCourses, POST: postCourse } = await import("@/app/api/courses/route");
const { POST: postTopic } = await import("@/app/api/topics/route");
const { PATCH: patchTopic, DELETE: deleteTopic } = await import("@/app/api/topics/[id]/route");
const { db } = await import("@/lib/db");
const { bankQuestions, flashcards } = await import("@/lib/db/schema");

function jsonRequest(body: unknown, method = "POST") {
  return new Request("https://example.com/api/test", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function createCourse(code = "IS-481", name = "Software QA") {
  const response = await postCourse(jsonRequest({ code, name }));
  return response.json();
}

describe("GET/POST /api/courses [FR-009]", () => {
  it("creates a course and lists it back", async () => {
    const created = await createCourse();
    expect(created.code).toBe("IS-481");
    expect(created.id).toEqual(expect.any(String));

    const listResponse = await getCourses();
    const list = await listResponse.json();
    expect(list).toContainEqual(expect.objectContaining({ code: "IS-481" }));
  });

  it("rejects a duplicate course code with 409", async () => {
    await createCourse("IS-999", "First");
    const response = await postCourse(jsonRequest({ code: "IS-999", name: "Second" }));
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("duplicate_code");
  });

  it("rejects an invalid body with 400", async () => {
    const response = await postCourse(jsonRequest({ code: "" }));
    expect(response.status).toBe(400);
  });

  it("GET /api/courses [FR-014]: includes due-count rollups when today is supplied", async () => {
    const course = await createCourse(`ROLL-${Math.random().toString(36).slice(2, 8)}`, "Rollups");
    const topic = await (await postTopic(jsonRequest({ courseId: course.id, name: "Due" }))).json();
    await db
      .insert(flashcards)
      .values({ topicId: topic.id, front: "due", back: "today", nextReviewAt: "2026-07-06" });
    await db.insert(bankQuestions).values({
      topicId: topic.id,
      prompt: "week",
      correctAnswer: "answer",
      explanation: "explanation",
      nextReviewAt: "2026-07-10",
    });

    const response = await getCourses(new Request("https://example.com/api/courses?today=2026-07-06"));
    const list = await response.json();
    const rolled = list.find((item: { id: string }) => item.id === course.id);

    expect(rolled.dueToday).toBe(1);
    expect(rolled.dueWeek).toBe(2);
    expect(rolled.dueByType).toEqual({ flashcard: 1, bankQuestion: 1 });
  });
});

describe("POST/PATCH/DELETE /api/topics [FR-009]", () => {
  let courseId: string;

  beforeEach(async () => {
    const course = await createCourse(`CRS-${Math.random().toString(36).slice(2, 8)}`, "Some course");
    courseId = course.id;
  });

  it("creates a topic under a course", async () => {
    const response = await postTopic(jsonRequest({ courseId, name: "SM-2" }));
    expect(response.status).toBe(201);
    const topic = await response.json();
    expect(topic.courseId).toBe(courseId);
    expect(topic.name).toBe("SM-2");
  });

  it("rejects a duplicate (courseId, name) pair with 409", async () => {
    await postTopic(jsonRequest({ courseId, name: "Dup" }));
    const response = await postTopic(jsonRequest({ courseId, name: "Dup" }));
    expect(response.status).toBe(409);
  });

  it("updates a topic's name via PATCH", async () => {
    const created = await (await postTopic(jsonRequest({ courseId, name: "Old" }))).json();
    const response = await patchTopic(jsonRequest({ name: "New" }, "PATCH"), {
      params: Promise.resolve({ id: created.id }),
    });
    expect(response.status).toBe(200);
    const updated = await response.json();
    expect(updated.name).toBe("New");
  });

  it("deletes a topic via DELETE", async () => {
    const created = await (await postTopic(jsonRequest({ courseId, name: "ToDelete" }))).json();
    const response = await deleteTopic(jsonRequest({}, "DELETE"), {
      params: Promise.resolve({ id: created.id }),
    });
    expect(response.status).toBe(204);
  });
});
