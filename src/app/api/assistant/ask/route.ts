import { NextResponse } from "next/server";
import { retrieveChunks } from "@/lib/rag/retrieve";
import { askGemini, classifyGeminiError } from "@/lib/ai/gemini";
import { assistantQuerySchema } from "@/lib/validation/assistant";

// Server path: pgvector retrieve + Gemini only. On failure this returns
// 502 {failureClass} so the CLIENT drives the local WebGPU fallback
// (research.md R1 Scenario A — local generation still runs in the browser,
// never on the server) — contracts/api.md.
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

  try {
    const { answer, citations } = await askGemini(question, chunks);
    return NextResponse.json({ answer, citations, engine: "gemini" });
  } catch (error) {
    const failureClass = classifyGeminiError(error);
    return NextResponse.json({ failureClass }, { status: 502 });
  }
}
