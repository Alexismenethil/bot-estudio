import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { filterEvaluationCitations, normalizeEvaluation } from "@/lib/ai/feynman-eval";
import { feynmanSubmissions } from "@/lib/db/schema";
import { evaluationRowToResponse, persistFeynmanEvaluation } from "@/lib/feynman/persistence";
import { retrieveTopicChunks } from "@/lib/rag/retrieve";
import { localFeynmanEvaluationSchema } from "@/lib/validation/feynman";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = localFeynmanEvaluationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "invalid_body", message: parsed.error.message } },
      { status: 400 },
    );
  }

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

  const normalized = normalizeEvaluation(parsed.data.evaluation);
  if ("error" in normalized) {
    return NextResponse.json(
      { error: { code: "invalid_response", message: "Invalid Feynman evaluation." } },
      { status: 400 },
    );
  }

  const chunks = await retrieveTopicChunks(submission.topicId, submission.explanation);
  const groundedEvaluation = filterEvaluationCitations(normalized.evaluation, chunks);
  const created = await persistFeynmanEvaluation(db, id, "local", groundedEvaluation);
  return NextResponse.json(evaluationRowToResponse(created), { status: 201 });
}
