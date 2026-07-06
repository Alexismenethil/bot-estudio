import { eq } from "drizzle-orm";
import type { db as appDb } from "@/lib/db";
import { aiEvaluations, feynmanSubmissions } from "@/lib/db/schema";
import type { FeynmanEvaluation } from "@/lib/ai/feynman-eval";

type StudyDb = typeof appDb;
type FeynmanEngine = "gemini" | "local";

export async function persistFeynmanEvaluation(
  db: StudyDb,
  submissionId: string,
  engine: FeynmanEngine,
  evaluation: FeynmanEvaluation,
) {
  const [created] = await db
    .insert(aiEvaluations)
    .values({
      submissionId,
      engine,
      correctPoints: evaluation.correctPoints,
      missingPoints: evaluation.missingPoints,
      wrongPoints: evaluation.wrongPoints,
      reviewSuggestions: evaluation.reviewSuggestions,
      citations: evaluation.citations,
    })
    .returning();

  await db
    .update(feynmanSubmissions)
    .set({ status: "evaluated", failureClasses: null, updatedAt: new Date() })
    .where(eq(feynmanSubmissions.id, submissionId));

  return created!;
}

export function evaluationRowToResponse(row: typeof aiEvaluations.$inferSelect) {
  return {
    id: row.id,
    engine: row.engine,
    evaluation: {
      correctPoints: row.correctPoints,
      missingPoints: row.missingPoints,
      wrongPoints: row.wrongPoints,
      reviewSuggestions: row.reviewSuggestions,
      citations: row.citations ?? [],
    },
    createdAt: row.createdAt,
  };
}
