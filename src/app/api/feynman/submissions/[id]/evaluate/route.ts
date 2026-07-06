import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { evaluateFeynmanWithGemini } from "@/lib/ai/feynman-gemini";
import { classifyGeminiError } from "@/lib/ai/gemini";
import { feynmanSubmissions } from "@/lib/db/schema";
import { persistFeynmanEvaluation } from "@/lib/feynman/persistence";
import { retrieveTopicChunks } from "@/lib/rag/retrieve";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const [submission] = await db
    .select()
    .from(feynmanSubmissions)
    .where(eq(feynmanSubmissions.id, id));

  if (!submission) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Feynman submission not found." } },
      { status: 404 },
    );
  }

  const chunks = await retrieveTopicChunks(submission.topicId, submission.explanation);

  try {
    const evaluation = await evaluateFeynmanWithGemini(submission.explanation, chunks);
    await persistFeynmanEvaluation(db, id, "gemini", evaluation);
    return NextResponse.json({ engine: "gemini", evaluation });
  } catch (error) {
    return NextResponse.json({ failureClass: classifyGeminiError(error) }, { status: 502 });
  }
}
