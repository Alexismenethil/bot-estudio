import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async () => {
  const { createTestDb } = await import("../../helpers/pglite");
  const { db } = await createTestDb();
  return { db };
});

const { db } = await import("@/lib/db");
const { courses, topics } = await import("@/lib/db/schema");
const { GET: getBankQuestions, POST: postBankQuestion } = await import("@/app/api/bank-questions/route");
const { PATCH: patchBankQuestion, DELETE: deleteBankQuestion } = await import(
  "@/app/api/bank-questions/[id]/route"
);

function jsonRequest(body: unknown, method = "POST", url = "https://example.com/api/bank-questions") {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function createTopic() {
  const [course] = await db.insert(courses).values({ code: `IS-${Math.random()}`, name: "QA" }).returning();
  const [topic] = await db.insert(topics).values({ courseId: course.id, name: "Entrenador" }).returning();
  return topic.id as string;
}

describe("POST/PATCH/DELETE /api/bank-questions [FR-031, US3-AC1]", () => {
  it("creates a bank question and lists it by topic", async () => {
    const topicId = await createTopic();

    const response = await postBankQuestion(
      jsonRequest({
        topicId,
        prompt: "¿Qué verifica un test rojo?",
        correctAnswer: "Que la capacidad aún no existe.",
        explanation: "El rojo prueba que el test captura el comportamiento esperado.",
      }),
    );

    expect(response.status).toBe(201);
    const created = await response.json();
    expect(created).toMatchObject({
      topicId,
      prompt: "¿Qué verifica un test rojo?",
      correctAnswer: "Que la capacidad aún no existe.",
      explanation: "El rojo prueba que el test captura el comportamiento esperado.",
      intervalDays: 0,
      repetitions: 0,
    });

    const listResponse = await getBankQuestions(
      new Request(`https://example.com/api/bank-questions?topicId=${topicId}`),
    );
    const { bankQuestions } = await listResponse.json();
    expect(bankQuestions).toHaveLength(1);
    expect(bankQuestions[0].id).toBe(created.id);
  });

  it("rejects invalid bank question bodies with 400", async () => {
    const response = await postBankQuestion(
      jsonRequest({ topicId: "not-a-uuid", prompt: "", correctAnswer: "", explanation: "" }),
    );
    expect(response.status).toBe(400);
  });

  it("updates prompt, correct answer, and explanation", async () => {
    const topicId = await createTopic();
    const created = await (
      await postBankQuestion(
        jsonRequest({
          topicId,
          prompt: "Old",
          correctAnswer: "Answer",
          explanation: "Because",
        }),
      )
    ).json();

    const response = await patchBankQuestion(
      jsonRequest(
        {
          prompt: "New prompt",
          correctAnswer: "New answer",
          explanation: "New explanation",
        },
        "PATCH",
      ),
      { params: Promise.resolve({ id: created.id }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      prompt: "New prompt",
      correctAnswer: "New answer",
      explanation: "New explanation",
    });
  });

  it("deletes a bank question", async () => {
    const topicId = await createTopic();
    const created = await (
      await postBankQuestion(
        jsonRequest({
          topicId,
          prompt: "Delete",
          correctAnswer: "Me",
          explanation: "No longer needed",
        }),
      )
    ).json();

    const response = await deleteBankQuestion(jsonRequest({}, "DELETE"), {
      params: Promise.resolve({ id: created.id }),
    });

    expect(response.status).toBe(204);
    const listResponse = await getBankQuestions(
      new Request(`https://example.com/api/bank-questions?topicId=${topicId}`),
    );
    const body = await listResponse.json();
    expect(body.bankQuestions).toEqual([]);
  });
});
