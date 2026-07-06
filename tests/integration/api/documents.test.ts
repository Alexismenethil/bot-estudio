import { describe, expect, it, vi } from "vitest";

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
      texts.map(() => new Array(actual.EMBEDDING_DIMENSIONS).fill(0.01)),
  };
});

const { db } = await import("@/lib/db");
const { courses, topics, documents } = await import("@/lib/db/schema");
const { POST: postDocument } = await import("@/app/api/documents/route");
const { GET: getDocumentById } = await import("@/app/api/documents/[id]/route");
const { GET: getDocumentChunks } = await import("@/app/api/documents/[id]/chunks/route");

function jsonRequest(body: unknown) {
  return new Request("https://example.com/api/documents", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getRequest(path = "/api/documents/x") {
  return new Request(`https://example.com${path}`);
}

async function createTopic() {
  const [course] = await db
    .insert(courses)
    .values({ code: `IS-${Math.random().toString(36).slice(2, 8)}`, name: "QA" })
    .returning();
  const [topic] = await db.insert(topics).values({ courseId: course.id, name: "RAG" }).returning();
  return topic.id as string;
}

describe("POST /api/documents [FR-001, US1-AC1]", () => {
  it("chunks and embeds a document, returning 202 with status 'ready'", async () => {
    const topicId = await createTopic();
    const response = await postDocument(
      jsonRequest({
        topicId,
        title: "Apuntes",
        blobUrl: "https://blob.example.com/apuntes.pdf",
        pages: [
          { pageNumber: 1, text: "contenido de la página uno" },
          { pageNumber: 2, text: "contenido de la página dos" },
        ],
      }),
    );

    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.status).toBe("ready");
    expect(body.id).toEqual(expect.any(String));

    const docResponse = await getDocumentById(getRequest(), { params: Promise.resolve({ id: body.id }) });
    const doc = await docResponse.json();
    expect(doc.status).toBe("ready");
    expect(doc.pageCount).toBe(2);
    expect(doc.blobUrl).toBe("https://blob.example.com/apuntes.pdf");

    const chunksResponse = await getDocumentChunks(getRequest(), { params: Promise.resolve({ id: body.id }) });
    const { chunks } = await chunksResponse.json();
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]).toMatchObject({ pageNumber: 1, content: expect.any(String) });
    expect(chunks[0].embedding).toHaveLength(384);
  });

  it("rejects a page_number greater than the document's page count with 422, persisting nothing", async () => {
    const topicId = await createTopic();
    const before = await db.select().from(documents);

    const response = await postDocument(
      jsonRequest({
        topicId,
        title: "Bad",
        blobUrl: "https://blob.example.com/bad.pdf",
        pages: [{ pageNumber: 5, text: "solo una página pero dice 5" }],
      }),
    );

    expect(response.status).toBe(422);
    const after = await db.select().from(documents);
    expect(after).toHaveLength(before.length);
  });

  it("marks the document 'failed' when no extractable text is found (corrupt/non-PDF edge case)", async () => {
    const topicId = await createTopic();
    const response = await postDocument(
      jsonRequest({
        topicId,
        title: "Corrupto",
        blobUrl: "https://blob.example.com/corrupt.pdf",
        pages: [
          { pageNumber: 1, text: "   " },
          { pageNumber: 2, text: "" },
        ],
      }),
    );

    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.status).toBe("failed");
    expect(body.error).toBeTruthy();

    const docResponse = await getDocumentById(getRequest(), { params: Promise.resolve({ id: body.id }) });
    const doc = await docResponse.json();
    expect(doc.status).toBe("failed");
  });

  it("returns 404 for a document that does not exist", async () => {
    const response = await getDocumentById(getRequest(), {
      params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }),
    });
    expect(response.status).toBe(404);
  });
});
