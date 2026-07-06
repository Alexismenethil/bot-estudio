import { GoogleGenAI } from "@google/genai";
import { logEvent } from "@/lib/logging";
import { classifyGeminiError } from "./gemini";
import { filterEvaluationCitations, normalizeEvaluation } from "./feynman-eval";
import type { FeynmanEvaluation, FeynmanGroundingChunk } from "./feynman-eval";

const FEYNMAN_MODEL = "gemini-2.5-flash";

function geminiTimeoutMs(): number {
  return Number(process.env.GEMINI_TIMEOUT_MS ?? 10_000);
}

function buildFeynmanPrompt(explanation: string, chunks: FeynmanGroundingChunk[]): string {
  const context =
    chunks.length === 0
      ? "No hay documentos listos para este tema. Evalua sin citas y no inventes referencias."
      : chunks
          .map((chunk) => `[doc ${chunk.documentId} p. ${chunk.pageNumber}] ${chunk.content}`)
          .join("\n\n");

  return [
    "Evalua esta explicacion estilo Feynman para ayudar a estudiar.",
    "Devuelve solamente JSON con estas claves:",
    "correctPoints, missingPoints, wrongPoints, reviewSuggestions, citations.",
    "Cada punto debe ser una cadena breve. Las citas solo pueden usar documentId y page",
    "presentes en los fragmentos. Si no hay fragmentos, citations debe ser [].",
    "",
    "Fragmentos:",
    context,
    "",
    "Explicacion del estudiante:",
    explanation,
  ].join("\n");
}

export async function evaluateFeynmanWithGemini(
  explanation: string,
  chunks: FeynmanGroundingChunk[],
): Promise<FeynmanEvaluation> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }

  const ai = new GoogleGenAI({ apiKey });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), geminiTimeoutMs());
  const startedAt = Date.now();

  try {
    const response = await ai.models.generateContent({
      model: FEYNMAN_MODEL,
      contents: buildFeynmanPrompt(explanation, chunks),
      config: {
        abortSignal: controller.signal,
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            correctPoints: { type: "array", items: { type: "string" } },
            missingPoints: { type: "array", items: { type: "string" } },
            wrongPoints: { type: "array", items: { type: "string" } },
            reviewSuggestions: { type: "array", items: { type: "string" } },
            citations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  documentId: { type: "string" },
                  page: { type: "integer" },
                },
                required: ["documentId", "page"],
              },
            },
          },
          required: ["correctPoints", "missingPoints", "wrongPoints", "reviewSuggestions", "citations"],
        },
      },
    });

    const normalized = normalizeEvaluation(response.text);
    if ("error" in normalized) {
      throw new Error("Gemini returned an invalid Feynman evaluation");
    }

    logEvent({
      boundary: "ai",
      engine: "gemini",
      message: "feynman evaluation ok",
      expected_degradation: false,
      latency_ms: Date.now() - startedAt,
    });
    return filterEvaluationCitations(normalized.evaluation, chunks);
  } catch (error) {
    const failureClass = classifyGeminiError(error);
    logEvent({
      boundary: "ai",
      level: "warn",
      engine: "gemini",
      failure_class: failureClass,
      message: "feynman evaluation failed",
      expected_degradation: true,
      latency_ms: Date.now() - startedAt,
    });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
