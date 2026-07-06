import { pipeline } from "@huggingface/transformers";
import { CANNOT_ANSWER_MESSAGE, LocalEngineError } from "./types";
import type { AssistantAnswer, RetrievedChunk } from "./types";

// research.md R4: a single constant model-id pair, not a user-facing setting.
const PHI3_MODEL_ID = "onnx-community/Phi-3-mini-4k-instruct-ONNX";
const QWEN_MODEL_ID = "onnx-community/Qwen2.5-1.5B-Instruct";
const HIGH_MEMORY_THRESHOLD_GB = 6;

export function selectModelId(hasWebGPU: boolean, deviceMemoryGB: number | undefined): string {
  return hasWebGPU && (deviceMemoryGB ?? 0) >= HIGH_MEMORY_THRESHOLD_GB ? PHI3_MODEL_ID : QWEN_MODEL_ID;
}

export type LocalTextGenerator = (prompt: string) => Promise<string>;

export interface LocalEngineDeps {
  hasWebGPU(): boolean;
  deviceMemoryGB(): number | undefined;
  isOnline(): boolean;
  hasCachedWeights(modelId: string): Promise<boolean>;
  loadModel(modelId: string): Promise<LocalTextGenerator>;
  generate(
    model: LocalTextGenerator,
    question: string,
    chunks: RetrievedChunk[],
  ): Promise<AssistantAnswer>;
}

function isOutOfMemoryError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /out of memory|oom/i.test(message);
}

// research.md R2: WebGPU absence/OOM/uncached-while-offline/crash are all
// local-engine failures, classified distinctly for logging but treated
// identically by the fallback chain (askWithFallback → FR-030).
export async function askLocal(
  question: string,
  chunks: RetrievedChunk[],
  deps: LocalEngineDeps,
): Promise<AssistantAnswer> {
  if (!deps.hasWebGPU()) {
    throw new LocalEngineError("unsupported");
  }

  const modelId = selectModelId(deps.hasWebGPU(), deps.deviceMemoryGB());

  if (!deps.isOnline() && !(await deps.hasCachedWeights(modelId))) {
    throw new LocalEngineError("not_cached");
  }

  let model: LocalTextGenerator;
  try {
    model = await deps.loadModel(modelId);
  } catch (error) {
    throw new LocalEngineError(isOutOfMemoryError(error) ? "oom" : "inference_error");
  }

  try {
    return await deps.generate(model, question, chunks);
  } catch {
    throw new LocalEngineError("inference_error");
  }
}

function buildLocalPrompt(question: string, chunks: RetrievedChunk[]): string {
  const context = chunks.map((chunk) => `[p. ${chunk.pageNumber}] ${chunk.content}`).join("\n\n");
  return [
    "Responde UNICAMENTE con base en los fragmentos. Si no esta en los",
    "fragmentos, responde exactamente: " + CANNOT_ANSWER_MESSAGE,
    "",
    "Fragmentos:",
    context,
    "",
    `Pregunta: ${question}`,
  ].join("\n");
}

function parseLocalResponse(text: string, chunks: RetrievedChunk[]): AssistantAnswer {
  if (text.trim() === CANNOT_ANSWER_MESSAGE || text.trim().length === 0) {
    return { answer: CANNOT_ANSWER_MESSAGE, citations: [] };
  }

  const citations = chunks
    .filter((chunk) => text.includes(`[p. ${chunk.pageNumber}]`))
    .map((chunk) => ({ page: chunk.pageNumber, chunkId: chunk.chunkId }));

  return { answer: text.trim(), citations };
}

function hasNavigator(): boolean {
  return typeof navigator !== "undefined";
}

// Wires real browser globals (WebGPU, Cache Storage, transformers.js) — used
// client-side only; not unit-tested directly (no navigator/WebGPU in Node),
// hence askLocal above taking injectable deps.
export function createBrowserLocalEngineDeps(): LocalEngineDeps {
  return {
    hasWebGPU: () => hasNavigator() && "gpu" in navigator,
    deviceMemoryGB: () =>
      hasNavigator() ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory : undefined,
    isOnline: () => (hasNavigator() ? navigator.onLine : true),
    hasCachedWeights: async (modelId) => {
      if (typeof caches === "undefined") {
        return false;
      }
      try {
        const cacheNames = await caches.keys();
        for (const name of cacheNames) {
          const cache = await caches.open(name);
          const keys = await cache.keys();
          if (keys.some((request) => request.url.includes(modelId))) {
            return true;
          }
        }
        return false;
      } catch {
        return false;
      }
    },
    loadModel: async (modelId) => {
      const generator = await pipeline("text-generation", modelId, { device: "webgpu" });
      return async (prompt: string) => {
        const output = await generator(prompt, { max_new_tokens: 512 });
        const [result] = Array.isArray(output) ? output : [output];
        const generatedText = (result as { generated_text?: unknown })?.generated_text;
        return typeof generatedText === "string" ? generatedText : String(generatedText ?? "");
      };
    },
    generate: async (model, question, chunks) => {
      const text = await model(buildLocalPrompt(question, chunks));
      return parseLocalResponse(text, chunks);
    },
  };
}
