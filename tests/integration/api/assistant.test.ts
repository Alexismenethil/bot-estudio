import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse, delay } from "msw";
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
const { courses, topics, documents, documentChunks } = await import("@/lib/db/schema");
const { POST: postAsk } = await import("@/app/api/assistant/ask/route");
const { POST: postRetrieve } = await import("@/app/api/assistant/retrieve/route");

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/*";

function geminiRespondsWith(payload: { answerable: boolean; answer: string; citedPages: number[] }) {
  server.use(
    http.post(GEMINI_ENDPOINT, () =>
      HttpResponse.json({
        candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] }, finishReason: "STOP" }],
      }),
    ),
  );
}

function jsonRequest(body: unknown) {
  return new Request("https://example.com/api/assistant/ask", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function seedDocumentWithChunks() {
  const [course] = await db.insert(courses).values({ code: `IS-${Math.random()}`, name: "QA" }).returning();
  const [topic] = await db.insert(topics).values({ courseId: course.id, name: "RAG" }).returning();
  const [document] = await db
    .insert(documents)
    .values({ topicId: topic.id, title: "Doc", blobUrl: "https://blob/doc.pdf", pageCount: 2, status: "ready" })
    .returning();

  const vectorA = new Array(384).fill(0).map((_, i) => (i === 0 ? 1 : 0));
  const vectorB = new Array(384).fill(0).map((_, i) => (i === 1 ? 1 : 0));

  const [chunkA, chunkB] = await db
    .insert(documentChunks)
    .values([
      { documentId: document.id, pageNumber: 1, chunkIndex: 0, content: "contenido de la pagina uno", embedding: vectorA },
      { documentId: document.id, pageNumber: 2, chunkIndex: 1, content: "contenido de la pagina dos", embedding: vectorB },
    ])
    .returning();

  return { documentId: document.id as string, chunkA: chunkA!, chunkB: chunkB! };
}

beforeEach(() => {
  process.env.GEMINI_API_KEY = "test-key";
  process.env.GEMINI_TIMEOUT_MS = "50";
});

afterEach(() => {
  server.resetHandlers();
});

describe("POST /api/assistant/ask [US1-AC4, US1-AC6, US1-AC7]", () => {
  it("returns a grounded answer with a page citation on success (engine: gemini)", async () => {
    const { documentId, chunkB } = await seedDocumentWithChunks();
    geminiRespondsWith({ answerable: true, answer: "La respuesta esta en la pagina dos.", citedPages: [2] });

    const response = await postAsk(jsonRequest({ documentId, question: "¿que dice la pagina dos?" }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.engine).toBe("gemini");
    expect(body.answer).toBe("La respuesta esta en la pagina dos.");
    expect(body.citations).toEqual([{ page: 2, chunkId: chunkB.id }]);
  });

  it("returns the explicit FR-007 refusal with zero citations when unanswerable", async () => {
    const { documentId } = await seedDocumentWithChunks();
    geminiRespondsWith({ answerable: false, answer: "", citedPages: [] });

    const response = await postAsk(jsonRequest({ documentId, question: "¿cual es la capital de la luna?" }));

    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.citations).toEqual([]);
    expect(body.answer).toMatch(/no puedo responder/i);
  });

  it("returns 502 {failureClass:'quota'} on a 429 RESOURCE_EXHAUSTED response", async () => {
    const { documentId } = await seedDocumentWithChunks();
    server.use(
      http.post(GEMINI_ENDPOINT, () =>
        HttpResponse.json(
          { error: { code: 429, message: "Quota exceeded", status: "RESOURCE_EXHAUSTED" } },
          { status: 429 },
        ),
      ),
    );

    const response = await postAsk(jsonRequest({ documentId, question: "pregunta" }));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ failureClass: "quota" });
  });

  it("returns 502 {failureClass:'network'} on a network-level failure", async () => {
    const { documentId } = await seedDocumentWithChunks();
    server.use(http.post(GEMINI_ENDPOINT, () => HttpResponse.error()));

    const response = await postAsk(jsonRequest({ documentId, question: "pregunta" }));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ failureClass: "network" });
  });

  it("returns 502 {failureClass:'timeout'} when Gemini never responds within the deadline", async () => {
    const { documentId } = await seedDocumentWithChunks();
    server.use(
      http.post(GEMINI_ENDPOINT, async () => {
        await delay("infinite");
        return HttpResponse.json({});
      }),
    );

    const response = await postAsk(jsonRequest({ documentId, question: "pregunta" }));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ failureClass: "timeout" });
  }, 10_000);
});

describe("POST /api/assistant/retrieve [FR-004]", () => {
  it("returns top-k chunks with pageNumber, scoped to the single document", async () => {
    const { documentId, chunkB } = await seedDocumentWithChunks();

    const response = await postRetrieve(
      new Request("https://example.com/api/assistant/retrieve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documentId, question: "¿que dice la pagina dos?" }),
      }),
    );

    const body = await response.json();
    expect(body.chunks[0]).toMatchObject({ id: chunkB.id, pageNumber: 2 });
    expect(body.chunks.every((c: { content: string }) => typeof c.content === "string")).toBe(true);
  });
});
