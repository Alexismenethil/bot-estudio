export type GeminiFailureClass = "timeout" | "quota" | "network" | "invalid_response";
export type LocalFailureClass = "unsupported" | "oom" | "not_cached" | "inference_error";
export type FailureClass = GeminiFailureClass | LocalFailureClass;

export type EngineName = "gemini" | "local";

export interface RetrievedChunk {
  chunkId: string;
  pageNumber: number;
  content: string;
}

export interface Citation {
  page: number;
  chunkId: string;
}

export interface AssistantAnswer {
  answer: string;
  citations: Citation[];
}

export interface AnswerEngine {
  ask(question: string, chunks: RetrievedChunk[]): Promise<AssistantAnswer>;
}

// FR-007: identical wording regardless of which engine (Gemini or local)
// produces the refusal, so grounding failures are indistinguishable to the
// student across the fallback chain.
export const CANNOT_ANSWER_MESSAGE =
  "No puedo responder esta pregunta usando el contenido de este documento.";

// Thrown by the local (WebGPU) engine so askWithFallback can classify the
// failure without local.ts and fallback.ts depending on each other directly.
export class LocalEngineError extends Error {
  readonly failureClass: LocalFailureClass;

  constructor(failureClass: LocalFailureClass, message?: string) {
    super(message ?? failureClass);
    this.name = "LocalEngineError";
    this.failureClass = failureClass;
  }
}

export function classifyLocalError(error: unknown): LocalFailureClass {
  return error instanceof LocalEngineError ? error.failureClass : "inference_error";
}
