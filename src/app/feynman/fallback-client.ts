"use client";

import { filterEvaluationCitations, normalizeEvaluation } from "@/lib/ai/feynman-eval";
import { classifyLocalError } from "@/lib/ai/types";
import { logEvent } from "@/lib/logging";
import type { FeynmanEvaluation } from "@/lib/ai/feynman-eval";
import type { GeminiFailureClass, LocalFailureClass } from "@/lib/ai/types";

export interface FeynmanClientChunk {
  chunkId: string;
  documentId: string;
  pageNumber: number;
  content: string;
}

export interface FeynmanFallbackInput {
  submissionId: string;
  explanation: string;
  readyDocumentIds: string[];
  geminiFailureClass: GeminiFailureClass;
}

export interface FeynmanFallbackDeps {
  getCachedChunks(documentIds: string[]): Promise<FeynmanClientChunk[]>;
  evaluateLocal(explanation: string, chunks: FeynmanClientChunk[]): Promise<unknown>;
  persistEvaluation(submissionId: string, evaluation: FeynmanEvaluation): Promise<void>;
  queueRetryState(
    submissionId: string,
    failureClasses: { gemini: GeminiFailureClass; local: LocalFailureClass },
  ): Promise<void>;
}

export type FeynmanFallbackResult =
  | { ok: true; engine: "local"; evaluation: FeynmanEvaluation }
  | { ok: false; state: "unavailable"; retryQueued: true };

async function queueUnavailable(
  input: FeynmanFallbackInput,
  deps: FeynmanFallbackDeps,
  local: LocalFailureClass,
): Promise<FeynmanFallbackResult> {
  await deps.queueRetryState(input.submissionId, {
    gemini: input.geminiFailureClass,
    local,
  });
  logEvent({
    boundary: "ai",
    level: "warn",
    engine: "local",
    failure_class: local,
    message: "feynman local fallback unavailable",
    expected_degradation: true,
    submission_id: input.submissionId,
    gemini_failure_class: input.geminiFailureClass,
  });
  return { ok: false, state: "unavailable", retryQueued: true };
}

export async function runFeynmanFallback(
  input: FeynmanFallbackInput,
  deps: FeynmanFallbackDeps,
): Promise<FeynmanFallbackResult> {
  const chunks =
    input.readyDocumentIds.length === 0 ? [] : await deps.getCachedChunks(input.readyDocumentIds);

  if (input.readyDocumentIds.length > 0 && chunks.length === 0) {
    return queueUnavailable(input, deps, "not_cached");
  }

  try {
    const rawEvaluation = await deps.evaluateLocal(input.explanation, chunks);
    const normalized = normalizeEvaluation(rawEvaluation);
    if ("error" in normalized) {
      return queueUnavailable(input, deps, "inference_error");
    }

    const groundedEvaluation = filterEvaluationCitations(normalized.evaluation, chunks);
    await deps.persistEvaluation(input.submissionId, groundedEvaluation);
    logEvent({
      boundary: "ai",
      level: "warn",
      engine: "local",
      message: "feynman local fallback ok",
      expected_degradation: true,
      submission_id: input.submissionId,
      gemini_failure_class: input.geminiFailureClass,
    });
    return { ok: true, engine: "local", evaluation: groundedEvaluation };
  } catch (error) {
    return queueUnavailable(input, deps, classifyLocalError(error));
  }
}
