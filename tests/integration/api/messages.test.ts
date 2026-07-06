import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async () => {
  const { createTestDb } = await import("../../helpers/pglite");
  const { db } = await createTestDb();
  return { db };
});

const { db } = await import("@/lib/db");
const { courses, topics, documents, assistantThreads } = await import("@/lib/db/schema");
const { GET: getMessages, POST: postMessage } = await import("@/app/api/documents/[id]/messages/route");

function jsonRequest(body: unknown) {
  return new Request("https://example.com/api/messages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function createDocument() {
  const [course] = await db.insert(courses).values({ code: `IS-${Math.random()}`, name: "QA" }).returning();
  const [topic] = await db.insert(topics).values({ courseId: course.id, name: "RAG" }).returning();
  const [document] = await db
    .insert(documents)
    .values({ topicId: topic.id, title: "Doc", blobUrl: "https://blob/doc.pdf", pageCount: 3, status: "ready" })
    .returning();
  return document.id as string;
}

describe("POST/GET /api/documents/:id/messages [FR-030, US1-AC8]", () => {
  it("creates a thread lazily and persists a user message", async () => {
    const documentId = await createDocument();

    const response = await postMessage(jsonRequest({ role: "user", content: "¿que dice la pagina 2?", status: "ok" }), {
      params: Promise.resolve({ id: documentId }),
    });

    expect(response.status).toBe(201);
    const message = await response.json();
    expect(message.role).toBe("user");
    expect(message.status).toBe("ok");

    const threads = await db.select().from(assistantThreads).where(undefined);
    expect(threads.filter((t) => t.documentId === documentId)).toHaveLength(1);
  });

  it("reuses the same thread across multiple messages for one document", async () => {
    const documentId = await createDocument();
    const params = { params: Promise.resolve({ id: documentId }) };

    await postMessage(jsonRequest({ role: "user", content: "primera", status: "ok" }), params);
    await postMessage(jsonRequest({ role: "assistant", content: "respuesta", status: "ok", engine: "gemini" }), params);

    const response = await getMessages(new Request("https://example.com"), params);
    const { messages } = await response.json();
    expect(messages).toHaveLength(2);
    expect(new Set(messages.map((m: { threadId: string }) => m.threadId)).size).toBe(1);
  });

  it("keeps threads scoped per document (no cross-document leakage)", async () => {
    const docA = await createDocument();
    const docB = await createDocument();

    await postMessage(jsonRequest({ role: "user", content: "A", status: "ok" }), { params: Promise.resolve({ id: docA }) });
    await postMessage(jsonRequest({ role: "user", content: "B", status: "ok" }), { params: Promise.resolve({ id: docB }) });

    const responseA = await getMessages(new Request("https://example.com"), { params: Promise.resolve({ id: docA }) });
    const { messages: messagesA } = await responseA.json();
    expect(messagesA).toHaveLength(1);
    expect(messagesA[0].content).toBe("A");
  });

  it("persists an assistant message with engine and citations", async () => {
    const documentId = await createDocument();
    const params = { params: Promise.resolve({ id: documentId }) };

    const response = await postMessage(
      jsonRequest({
        role: "assistant",
        content: "La respuesta esta en la pagina 2.",
        status: "ok",
        engine: "gemini",
        citations: [{ page: 2, chunkId: "11111111-1111-4111-8111-111111111111" }],
      }),
      params,
    );

    const message = await response.json();
    expect(message.engine).toBe("gemini");
    expect(message.citations).toEqual([{ page: 2, chunkId: "11111111-1111-4111-8111-111111111111" }]);
  });

  it("preserves a double-failure user question as status pending_retry, retrievable via GET", async () => {
    const documentId = await createDocument();
    const params = { params: Promise.resolve({ id: documentId }) };

    await postMessage(
      jsonRequest({ role: "user", content: "pregunta sin responder", status: "pending_retry" }),
      params,
    );

    const response = await getMessages(new Request("https://example.com"), params);
    const { messages } = await response.json();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ status: "pending_retry", content: "pregunta sin responder" });
  });

  it("returns an empty list for a document with no messages yet", async () => {
    const documentId = await createDocument();
    const response = await getMessages(new Request("https://example.com"), { params: Promise.resolve({ id: documentId }) });
    expect(await response.json()).toEqual({ messages: [] });
  });
});
