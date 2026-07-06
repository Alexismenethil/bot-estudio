import { describe, expect, it, vi } from "vitest";
import { runFeynmanFallback } from "@/app/feynman/fallback-client";
import { LocalEngineError } from "@/lib/ai/types";
import type { FeynmanFallbackDeps } from "@/app/feynman/fallback-client";

const localEvaluation = {
  correctPoints: ["La explicacion identifica el concepto central."],
  missingPoints: [],
  wrongPoints: [],
  reviewSuggestions: ["Agrega un ejemplo propio."],
  citations: [],
};

const cachedChunk = {
  chunkId: "chunk-1",
  documentId: "11111111-1111-1111-1111-111111111111",
  pageNumber: 2,
  content: "AAA divide la prueba en tres fases.",
};

function deps(overrides: Partial<FeynmanFallbackDeps> = {}): FeynmanFallbackDeps {
  return {
    getCachedChunks: vi.fn(async () => [cachedChunk]),
    evaluateLocal: vi.fn(async () => localEvaluation),
    persistEvaluation: vi.fn(async () => undefined),
    queueRetryState: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("runFeynmanFallback [US5 Scenario B]", () => {
  it("does not run ungrounded local evaluation when ready topic documents are not cached", async () => {
    const fallbackDeps = deps({ getCachedChunks: vi.fn(async () => []) });

    const result = await runFeynmanFallback(
      {
        submissionId: "sub-1",
        explanation: "AAA separa la prueba en fases.",
        readyDocumentIds: ["11111111-1111-1111-1111-111111111111"],
        geminiFailureClass: "network",
      },
      fallbackDeps,
    );

    expect(result).toEqual({ ok: false, state: "unavailable", retryQueued: true });
    expect(fallbackDeps.evaluateLocal).not.toHaveBeenCalled();
    expect(fallbackDeps.persistEvaluation).not.toHaveBeenCalled();
    expect(fallbackDeps.queueRetryState).toHaveBeenCalledWith("sub-1", {
      gemini: "network",
      local: "not_cached",
    });
  });

  it("allows ungrounded local evaluation when the topic has no ready documents", async () => {
    const fallbackDeps = deps();

    const result = await runFeynmanFallback(
      {
        submissionId: "sub-2",
        explanation: "Explico sin documentos de biblioteca.",
        readyDocumentIds: [],
        geminiFailureClass: "quota",
      },
      fallbackDeps,
    );

    expect(fallbackDeps.getCachedChunks).not.toHaveBeenCalled();
    expect(fallbackDeps.evaluateLocal).toHaveBeenCalledWith("Explico sin documentos de biblioteca.", []);
    expect(fallbackDeps.persistEvaluation).toHaveBeenCalledWith("sub-2", localEvaluation);
    expect(result).toEqual({ ok: true, engine: "local", evaluation: localEvaluation });
  });

  it("drops local fallback citations that do not match the cached chunks", async () => {
    const hallucinatedEvaluation = {
      ...localEvaluation,
      citations: [
        { documentId: cachedChunk.documentId, page: cachedChunk.pageNumber },
        { documentId: "99999999-9999-9999-9999-999999999999", page: 99 },
        { documentId: cachedChunk.documentId, page: 99 },
      ],
    };
    const fallbackDeps = deps({ evaluateLocal: vi.fn(async () => hallucinatedEvaluation) });

    const result = await runFeynmanFallback(
      {
        submissionId: "sub-4",
        explanation: "AAA separa la prueba en fases.",
        readyDocumentIds: [cachedChunk.documentId],
        geminiFailureClass: "quota",
      },
      fallbackDeps,
    );

    const expectedEvaluation = {
      ...localEvaluation,
      citations: [{ documentId: cachedChunk.documentId, page: cachedChunk.pageNumber }],
    };
    expect(fallbackDeps.persistEvaluation).toHaveBeenCalledWith("sub-4", expectedEvaluation);
    expect(result).toEqual({ ok: true, engine: "local", evaluation: expectedEvaluation });
  });

  it("queues pending_retry when the local engine also fails", async () => {
    const fallbackDeps = deps({
      evaluateLocal: vi.fn(async () => {
        throw new LocalEngineError("unsupported");
      }),
    });

    const result = await runFeynmanFallback(
      {
        submissionId: "sub-3",
        explanation: "AAA separa la prueba en fases.",
        readyDocumentIds: ["11111111-1111-1111-1111-111111111111"],
        geminiFailureClass: "timeout",
      },
      fallbackDeps,
    );

    expect(result).toEqual({ ok: false, state: "unavailable", retryQueued: true });
    expect(fallbackDeps.persistEvaluation).not.toHaveBeenCalled();
    expect(fallbackDeps.queueRetryState).toHaveBeenCalledWith("sub-3", {
      gemini: "timeout",
      local: "unsupported",
    });
  });
});
