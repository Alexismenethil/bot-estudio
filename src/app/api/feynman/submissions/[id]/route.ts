import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aiEvaluations, feynmanSubmissions } from "@/lib/db/schema";
import { evaluationRowToResponse } from "@/lib/feynman/persistence";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
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

  const evaluations = await db
    .select()
    .from(aiEvaluations)
    .where(eq(aiEvaluations.submissionId, id));

  return NextResponse.json({
    ...submission,
    evaluations: evaluations.map(evaluationRowToResponse),
  });
}
