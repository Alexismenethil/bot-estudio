import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents, documentChunks } from "@/lib/db/schema";
import { createDocumentSchema } from "@/lib/validation/documents";
import { chunkDocument } from "@/lib/rag/chunking";
import { createTransformersEmbedder, embedTexts } from "@/lib/rag/embed";

const embedder = createTransformersEmbedder();

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = createDocumentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "invalid_body", message: parsed.error.message } },
      { status: 400 },
    );
  }

  const { topicId, title, blobUrl, pages } = parsed.data;
  const pageCount = pages.length;

  // App-layer upper bound (data-model.md): a DB CHECK can't reference
  // page_count on another table, so it's validated here before any write.
  if (pageCount === 0 || pages.some((page) => page.pageNumber > pageCount)) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_page_number",
          message: "Every page_number must be within the document's page count.",
        },
      },
      { status: 422 },
    );
  }

  const [document] = await db
    .insert(documents)
    .values({ topicId, title, blobUrl, pageCount, status: "processing" })
    .returning();

  const chunks = chunkDocument(pages);

  if (chunks.length === 0) {
    const [failed] = await db
      .update(documents)
      .set({ status: "failed" })
      .where(eq(documents.id, document.id))
      .returning();
    return NextResponse.json(
      {
        id: failed.id,
        status: failed.status,
        error: {
          code: "empty_content",
          message: "No extractable text was found in this document.",
        },
      },
      { status: 202 },
    );
  }

  const embeddings = await embedTexts(
    chunks.map((chunk) => chunk.content),
    embedder,
  );

  await db.insert(documentChunks).values(
    chunks.map((chunk, i) => ({
      documentId: document.id,
      pageNumber: chunk.pageNumber,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      embedding: embeddings[i]!,
    })),
  );

  const [ready] = await db
    .update(documents)
    .set({ status: "ready" })
    .where(eq(documents.id, document.id))
    .returning();

  return NextResponse.json({ id: ready.id, status: ready.status }, { status: 202 });
}
