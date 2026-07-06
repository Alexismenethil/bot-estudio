import { cosineDistance, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentChunks } from "@/lib/db/schema";
import { createTransformersEmbedder, embedTexts } from "./embed";
import type { RetrievedChunk } from "@/lib/ai/types";

const embedder = createTransformersEmbedder();
const DEFAULT_TOP_K = 6;

// Server-side pgvector top-k retrieval (research.md R1, Scenario A/normal
// path): query embedding never depends on Gemini, so a Gemini outage can't
// take retrieval down with it.
export async function retrieveChunks(
  documentId: string,
  question: string,
  topK: number = DEFAULT_TOP_K,
): Promise<RetrievedChunk[]> {
  const [queryEmbedding] = await embedTexts([question], embedder);

  const rows = await db
    .select({
      id: documentChunks.id,
      pageNumber: documentChunks.pageNumber,
      content: documentChunks.content,
    })
    .from(documentChunks)
    .where(eq(documentChunks.documentId, documentId))
    .orderBy(cosineDistance(documentChunks.embedding, queryEmbedding!))
    .limit(topK);

  return rows.map((row) => ({ chunkId: row.id, pageNumber: row.pageNumber, content: row.content }));
}
