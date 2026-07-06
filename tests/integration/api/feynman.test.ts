import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { delay, http, HttpResponse } from "msw";
import { server } from "../../setup";

vi.mock("@/lib/db", async () => {
  const { createTestDb } = await import("../../helpers/pglite");
  const { db } = await createTestDb();
  return { db };
});

const QUERY_VECTOR = new Array(384).fill(0).map((_, i) => (i === 1 ? 1 : 0));

vi.mock("@/lib/rag/embed", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rag/embed")>("@/lib/rag/embed");
  return {
    ...actual,
    createTransformersEmbedder: () => async (texts: string[]) => texts.map(() => QUERY_VECTOR),
  };
});

const { db } = await import("@/lib/db");
const { aiEvaluations, courses, documentChunks, documents, feynmanSubmissions, topics } = await import(
  "@/lib/db/schema"
);
const { POST: postSubmission } = await import("@/app/api/feynman/submissions/route");
const { GET: getSubmission } = await import("@/app/api/feynman/submissions/[id]/route");
const { POST: postEvaluate } = await import("@/app/api/feynman/submissions/[id]/evaluate/route");
const { POST: postLocalEvaluation } = await import("@/app/api/feynman/submissions/[id]/evaluations/route");
const { PATCH: patchRetryState } = await import("@/app/api/feynman/submissions/[id]/retry-state/route");
const { POST: postRetrieve } = await import("@/app/api/feynman/retrieve/route");

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/*";

const validEvaluation = {
  correctPoints: ["Describe el objetivo de AAA."],
  missingPoints: ["Falta explicar aislamiento de dependencias."],
  wrongPoints: [],
  reviewSuggestions: ["Reescribe el ejemplo usando Given/When/Then."],
  citations: [{ documentId: "11111111-1111-1111-1111-111111111111", page: 2 }],
};

function geminiRespondsWith(payload: typeof validEvaluation) {
  server.use(
    http.post(GEMINI_ENDPOINT, () =>
      HttpResponse.json({
        candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] }, finishReason: "STOP" }],
      }),
    ),
  );
}

function jsonRequest(body: unknown, url = "https://example.com/api/feynman/submissions", method = "POST") {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: method === "GET" || method === "HEAD" ? undefined : JSON.stringify(body),
  });
}

async function seedTopic() {
  const [course] = await db.insert(courses).values({ code: `FY-${Math.random()}`, name: "QA" }).returning();
  const [topic] = await db.insert(topics).values({ courseId: course.id, name: "Feynman" }).returning();
  return { course: course!, topic: topic! };
}

async function seedTopicWithDocuments() {
  const { topic } = await seedTopic();
  const [firstDoc, secondDoc, processingDoc] = await db
    .insert(documents)
    .values([
      { topicId: topic.id, title: "AAA", blobUrl: "https://blob/aaa.pdf", pageCount: 3, status: "ready" },
      { topicId: topic.id, title: "Mocks", blobUrl: "https://blob/mocks.pdf", pageCount: 2, status: "ready" },
      { topicId: topic.id, title: "Draft", blobUrl: "https://blob/draft.pdf", pageCount: 1, status: "processing" },
    ])
    .returning();

  const vectorA = new Array(384).fill(0).map((_, i) => (i === 0 ? 1 : 0));
  const vectorB = new Array(384).fill(0).map((_, i) => (i === 1 ? 1 : 0));

  const [firstChunk, secondChunk, processingChunk] = await db
    .insert(documentChunks)
    .values([
      {
        documentId: firstDoc!.id,
        pageNumber: 2,
        chunkIndex: 0,
        content: "AAA organiza pruebas en arrange act assert.",
        embedding: vectorA,
      },
      {
        documentId: secondDoc!.id,
        pageNumber: 1,
        chunkIndex: 0,
        content: "Los mocks permiten observar colaboraciones.",
        embedding: vectorB,
      },
      {
        documentId: processingDoc!.id,
        pageNumber: 1,
        chunkIndex: 0,
        content: "Este documento no esta listo.",
        embedding: vectorB,
      },
    ])
    .returning();

  return { topic, firstDoc: firstDoc!, secondDoc: secondDoc!, firstChunk: firstChunk!, secondChunk: secondChunk!, processingChunk: processingChunk! };
}

async function createSubmission(topicId: string, explanation = "AAA separa preparacion, accion y verificacion.") {
  const response = await postSubmission(jsonRequest({ topicId, explanation }));
  expect(response.status).toBe(201);
  return (await response.json()) as { id: string; topicId: string; explanation: string; status: string };
}

beforeEach(() => {
  process.env.GEMINI_API_KEY = "test-key";
  process.env.GEMINI_TIMEOUT_MS = "50";
});

afterEach(() => {
  server.resetHandlers();
});

describe("POST /api/feynman/submissions [US5-AC1]", () => {
  it("creates a submitted explanation and rejects empty or too-long text", async () => {
    const { topic } = await seedTopic();

    const created = await createSubmission(topic.id, "Explico el patron AAA con mis palabras.");
    expect(created).toMatchObject({
      topicId: topic.id,
      explanation: "Explico el patron AAA con mis palabras.",
      status: "submitted",
    });

    const empty = await postSubmission(jsonRequest({ topicId: topic.id, explanation: "   " }));
    const tooLong = await postSubmission(jsonRequest({ topicId: topic.id, explanation: "x".repeat(20_001) }));

    expect(empty.status).toBe(422);
    expect(tooLong.status).toBe(422);
  });
});

describe("POST /api/feynman/submissions/:id/evaluate [US5-AC2, US5-AC5]", () => {
  it("persists a normalized Gemini evaluation and marks the submission evaluated", async () => {
    const { topic, firstDoc } = await seedTopicWithDocuments();
    const submission = await createSubmission(topic.id);
    geminiRespondsWith({
      ...validEvaluation,
      citations: [
        { documentId: firstDoc.id, page: 2 },
        { documentId: "99999999-9999-9999-9999-999999999999", page: 99 },
      ],
    });

    const response = await postEvaluate(jsonRequest({}, "https://example.com/api/feynman/submissions/id/evaluate"), {
      params: Promise.resolve({ id: submission.id }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.engine).toBe("gemini");
    expect(body.evaluation).toMatchObject({
      correctPoints: ["Describe el objetivo de AAA."],
      citations: [{ documentId: firstDoc.id, page: 2 }],
    });

    const [stored] = await db.select().from(feynmanSubmissions).where(eq(feynmanSubmissions.id, submission.id));
    const evaluations = await db.select().from(aiEvaluations).where(eq(aiEvaluations.submissionId, submission.id));
    expect(stored).toMatchObject({ status: "evaluated" });
    expect(evaluations).toHaveLength(1);
    expect(evaluations[0]).toMatchObject({ engine: "gemini" });
  });

  it.each([
    ["quota", () => HttpResponse.json({ error: { code: 429, status: "RESOURCE_EXHAUSTED" } }, { status: 429 })],
    ["network", () => HttpResponse.error()],
    [
      "timeout",
      async () => {
        await delay("infinite");
        return HttpResponse.json({});
      },
    ],
  ] as const)("returns 502 {failureClass:'%s'} when Gemini fails", async (failureClass, handler) => {
    const { topic } = await seedTopicWithDocuments();
    const submission = await createSubmission(topic.id);
    server.use(http.post(GEMINI_ENDPOINT, handler));

    const response = await postEvaluate(jsonRequest({}, "https://example.com/api/feynman/submissions/id/evaluate"), {
      params: Promise.resolve({ id: submission.id }),
    });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ failureClass });
  }, 10_000);
});

describe("POST /api/feynman/retrieve [US5-AC3, FR-030]", () => {
  it("retrieves top chunks across all ready documents for the submission topic", async () => {
    const { topic, secondDoc, secondChunk, processingChunk } = await seedTopicWithDocuments();
    const submission = await createSubmission(topic.id, "Explico mocks y AAA.");

    const response = await postRetrieve(
      jsonRequest({ submissionId: submission.id }, "https://example.com/api/feynman/retrieve"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.chunks[0]).toMatchObject({
      chunkId: secondChunk.id,
      documentId: secondDoc.id,
      pageNumber: 1,
      content: "Los mocks permiten observar colaboraciones.",
    });
    expect(body.chunks.map((chunk: { chunkId: string }) => chunk.chunkId)).not.toContain(processingChunk.id);
  });

  it("returns an empty chunk list when the topic has no ready documents", async () => {
    const { topic } = await seedTopic();
    const submission = await createSubmission(topic.id);

    const response = await postRetrieve(
      jsonRequest({ submissionId: submission.id }, "https://example.com/api/feynman/retrieve"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ chunks: [] });
  });
});

describe("POST /api/feynman/submissions/:id/evaluations [US5-AC4]", () => {
  it("persists a local fallback evaluation and returns it through GET", async () => {
    const { topic } = await seedTopic();
    const submission = await createSubmission(topic.id);

    const response = await postLocalEvaluation(
      jsonRequest(
        { engine: "local", evaluation: { ...validEvaluation, citations: [] } },
        "https://example.com/api/feynman/submissions/id/evaluations",
      ),
      { params: Promise.resolve({ id: submission.id }) },
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.engine).toBe("local");
    const getResponse = await getSubmission(jsonRequest({}, "https://example.com/api/feynman/submissions/id", "GET"), {
      params: Promise.resolve({ id: submission.id }),
    });

    expect(await getResponse.json()).toMatchObject({
      id: submission.id,
      status: "evaluated",
      evaluations: [{ engine: "local" }],
    });
  });

  it("drops local fallback citations that were not retrieved for the submission topic", async () => {
    const { topic, secondDoc } = await seedTopicWithDocuments();
    const submission = await createSubmission(topic.id, "Explico mocks y AAA.");

    const response = await postLocalEvaluation(
      jsonRequest(
        {
          engine: "local",
          evaluation: {
            ...validEvaluation,
            citations: [
              { documentId: secondDoc.id, page: 1 },
              { documentId: "99999999-9999-4999-8999-999999999999", page: 99 },
              { documentId: secondDoc.id, page: 99 },
            ],
          },
        },
        "https://example.com/api/feynman/submissions/id/evaluations",
      ),
      { params: Promise.resolve({ id: submission.id }) },
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.evaluation.citations).toEqual([{ documentId: secondDoc.id, page: 1 }]);
    const [stored] = await db.select().from(aiEvaluations).where(eq(aiEvaluations.submissionId, submission.id));
    expect(stored.citations).toEqual([{ documentId: secondDoc.id, page: 1 }]);
  });
});

describe("PATCH /api/feynman/submissions/:id/retry-state [US5-AC5, FR-030]", () => {
  it("is idempotent for pending_retry and rejects already evaluated submissions", async () => {
    const { topic } = await seedTopic();
    const submission = await createSubmission(topic.id);
    const failureClasses = { gemini: "network", local: "unsupported" };

    const first = await patchRetryState(
      jsonRequest(
        { status: "pending_retry", failureClasses },
        "https://example.com/api/feynman/submissions/id/retry-state",
        "PATCH",
      ),
      { params: Promise.resolve({ id: submission.id }) },
    );
    const second = await patchRetryState(
      jsonRequest(
        { status: "pending_retry", failureClasses },
        "https://example.com/api/feynman/submissions/id/retry-state",
        "PATCH",
      ),
      { params: Promise.resolve({ id: submission.id }) },
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ status: "pending_retry", failureClasses });

    await postLocalEvaluation(
      jsonRequest(
        { engine: "local", evaluation: { ...validEvaluation, citations: [] } },
        "https://example.com/api/feynman/submissions/id/evaluations",
      ),
      { params: Promise.resolve({ id: submission.id }) },
    );
    const conflict = await patchRetryState(
      jsonRequest(
        { status: "pending_retry", failureClasses },
        "https://example.com/api/feynman/submissions/id/retry-state",
        "PATCH",
      ),
      { params: Promise.resolve({ id: submission.id }) },
    );

    expect(conflict.status).toBe(409);
  });
});
