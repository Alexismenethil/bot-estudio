import { eq } from "drizzle-orm";
import type { db as appDb } from "@/lib/db";
import { aiEvaluations, feynmanSubmissions } from "@/lib/db/schema";
import type { FeynmanEvaluation } from "@/lib/ai/feynman-eval";
import { logEvent } from "@/lib/logging";

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
  logEvent({
    boundary: "db",
    message: "feynman evaluation created",
    operation: "insert",
    table: "ai_evaluations",
    submission_id: submissionId,
    evaluation_id: created?.id,
    engine,
  });

  await db
    .update(feynmanSubmissions)
    .set({ status: "evaluated", failureClasses: null, updatedAt: new Date() })
    .where(eq(feynmanSubmissions.id, submissionId));
  logEvent({
    boundary: "db",
    message: "feynman submission marked evaluated",
    operation: "update",
    table: "feynman_submissions",
    submission_id: submissionId,
  });

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
