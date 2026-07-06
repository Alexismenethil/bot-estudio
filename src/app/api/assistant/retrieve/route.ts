import { NextResponse } from "next/server";
import { retrieveChunks } from "@/lib/rag/retrieve";
import { assistantQuerySchema } from "@/lib/validation/assistant";

// Scenario A retrieval-only endpoint (research.md R1-A): lets the client
// drive local WebGPU generation over the same server-retrieved chunks when
// Gemini is unavailable but the backend/Postgres is still reachable.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = assistantQuerySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "invalid_body", message: parsed.error.message } },
      { status: 400 },
    );
  }

  const { documentId, question } = parsed.data;
  const chunks = await retrieveChunks(documentId, question);

  return NextResponse.json({
    chunks: chunks.map((chunk) => ({
      id: chunk.chunkId,
      pageNumber: chunk.pageNumber,
      content: chunk.content,
    })),
  });
}
