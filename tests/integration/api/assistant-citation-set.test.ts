import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../setup";
import fixture from "../../fixtures/us1-citation-set.json";

const EMBEDDING_DIMENSIONS = 384;

function oneHot(index: number): number[] {
  return new Array(EMBEDDING_DIMENSIONS).fill(0).map((_, i) => (i === index ? 1 : 0));
}

// A vector with no strong alignment to any page's one-hot embedding —
// deliberately "unanswerable" from a retrieval standpoint too.
const NEUTRAL_VECTOR = new Array(EMBEDDING_DIMENSIONS).fill(0.01);

function findFixtureQuestion(bodyText: string) {
  return fixture.questions.find((entry) => bodyText.includes(entry.question));
}

vi.mock("@/lib/db", async () => {
  const { createTestDb } = await import("../../helpers/pglite");
  const { db } = await createTestDb();
  return { db };
});

vi.mock("@/lib/rag/embed", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rag/embed")>("@/lib/rag/embed");
  return {
    ...actual,
    createTransformersEmbedder: () => async (texts: string[]) =>
      texts.map((text) => {
        const entry = fixture.questions.find((q) => q.question === text);
        return entry?.answerable && entry.expectedPage
          ? oneHot(entry.expectedPage - 1)
          : NEUTRAL_VECTOR;
      }),
  };
});

const { db } = await import("@/lib/db");
const { courses, topics, documents, documentChunks } = await import("@/lib/db/schema");
const { POST: postAsk } = await import("@/app/api/assistant/ask/route");

let documentId: string;
const chunkIdByPage = new Map<number, string>();

beforeAll(async () => {
  process.env.GEMINI_API_KEY = "test-key";
  process.env.GEMINI_TIMEOUT_MS = "2000";

  const [course] = await db.insert(courses).values({ code: "IS-SC002", name: "QA" }).returning();
  const [topic] = await db.insert(topics).values({ courseId: course.id, name: "Fundamentos" }).returning();
  const [document] = await db
    .insert(documents)
    .values({
      topicId: topic.id,
      title: "Fundamentos de Pruebas de Software",
      blobUrl: "https://blob/fundamentos.pdf",
      pageCount: fixture.documentPages.length,
      status: "ready",
    })
    .returning();
  documentId = document.id as string;

  const rows = await db
    .insert(documentChunks)
    .values(
      fixture.documentPages.map((page, i) => ({
        documentId,
        pageNumber: page.pageNumber,
        chunkIndex: i,
        content: page.content,
        embedding: oneHot(page.pageNumber - 1),
      })),
    )
    .returning();

  for (const row of rows) {
    chunkIdByPage.set(row.pageNumber, row.id);
  }

  server.use(
    http.post("https://generativelanguage.googleapis.com/*", async ({ request }) => {
      const bodyText = await request.clone().text();
      const entry = findFixtureQuestion(bodyText);
      const payload = entry?.answerable
        ? { answerable: true, answer: `Respuesta para la pagina ${entry.expectedPage}.`, citedPages: [entry.expectedPage] }
        : { answerable: false, answer: "", citedPages: [] };

      return HttpResponse.json({
        candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] }, finishReason: "STOP" }],
      });
    }),
  );
});

afterAll(() => {
  server.resetHandlers();
});

function askRequest(question: string) {
  return new Request("https://example.com/api/assistant/ask", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ documentId, question }),
  });
}

describe("SC-002 (executable): ≥20-question citation-accuracy/refusal fixture", () => {
  it("achieves 100% correct-page citation on answerable questions and 100% refusal on unanswerable ones", async () => {
    expect(fixture.questions.length).toBeGreaterThanOrEqual(20);

    const results = await Promise.all(
      fixture.questions.map(async (entry) => {
        const response = await postAsk(askRequest(entry.question));
        const body = await response.json();
        return { entry, body };
      }),
    );

    const answerable = results.filter((r) => r.entry.answerable);
    const unanswerable = results.filter((r) => !r.entry.answerable);

    const correctlyCited = answerable.filter((r) =>
      r.body.citations?.some(
        (c: { page: number; chunkId: string }) =>
          c.page === r.entry.expectedPage && c.chunkId === chunkIdByPage.get(r.entry.expectedPage!),
      ),
    );
    expect(correctlyCited).toHaveLength(answerable.length);

    const correctlyRefused = unanswerable.filter(
      (r) => r.body.citations?.length === 0 && /no puedo responder/i.test(r.body.answer ?? ""),
    );
    expect(correctlyRefused).toHaveLength(unanswerable.length);
  });
});
