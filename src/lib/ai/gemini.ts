import { GoogleGenAI } from "@google/genai";
import { logEvent } from "@/lib/logging";
import { CANNOT_ANSWER_MESSAGE } from "./types";
import type { AssistantAnswer, GeminiFailureClass, RetrievedChunk } from "./types";

const GEMINI_MODEL = "gemini-2.5-flash";
// Overridable via env var so tests can exercise the real AbortController path
// without waiting the full 10s (production always uses the 10s default).
function geminiTimeoutMs(): number {
  return Number(process.env.GEMINI_TIMEOUT_MS ?? 10_000);
}

// Principle V failure taxonomy: any Gemini call must be classifiable into
// exactly one of these modes so askWithFallback() can decide deterministically.
export function classifyGeminiError(error: unknown): GeminiFailureClass {
  if ((error instanceof DOMException || error instanceof Error) && error.name === "AbortError") {
    return "timeout";
  }

  const status = (error as { status?: number } | null)?.status;
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";

  if (status === 429 || /RESOURCE_EXHAUSTED/i.test(message)) {
    return "quota";
  }

  if (error instanceof TypeError) {
    return "network";
  }

  return "invalid_response";
}

interface GroundedResponse {
  answerable: boolean;
  answer: string;
  citedPages: number[];
}

function buildPrompt(question: string, chunks: RetrievedChunk[]): string {
  const context = chunks.map((chunk) => `[p. ${chunk.pageNumber}] ${chunk.content}`).join("\n\n");

  return [
    "Eres un asistente que responde preguntas UNICAMENTE con base en los",
    "fragmentos del documento provistos a continuacion. Si la respuesta no",
    "esta en los fragmentos, responde con answerable=false y answer vacio —",
    "nunca inventes informacion ni cites paginas que no respaldan la respuesta.",
    "",
    "Fragmentos:",
    context,
    "",
    `Pregunta: ${question}`,
  ].join("\n");
}

function toAssistantAnswer(parsed: GroundedResponse, chunks: RetrievedChunk[]): AssistantAnswer {
  if (!parsed.answerable) {
    return { answer: CANNOT_ANSWER_MESSAGE, citations: [] };
  }

  const citations = parsed.citedPages
    .map((page) => chunks.find((chunk) => chunk.pageNumber === page))
    .filter((chunk): chunk is RetrievedChunk => Boolean(chunk))
    .map((chunk) => ({ page: chunk.pageNumber, chunkId: chunk.chunkId }));

  return { answer: parsed.answer, citations };
}

export async function askGemini(question: string, chunks: RetrievedChunk[]): Promise<AssistantAnswer> {
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
      model: GEMINI_MODEL,
      contents: buildPrompt(question, chunks),
      config: {
        abortSignal: controller.signal,
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            answerable: { type: "boolean" },
            answer: { type: "string" },
            citedPages: { type: "array", items: { type: "integer" } },
          },
          required: ["answerable", "answer", "citedPages"],
        },
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("Gemini returned an empty response");
    }

    const parsed = JSON.parse(text) as GroundedResponse;
    logEvent({
      boundary: "ai",
      engine: "gemini",
      message: "assistant ask ok",
      expected_degradation: false,
      latency_ms: Date.now() - startedAt,
    });
    return toAssistantAnswer(parsed, chunks);
  } catch (error) {
    const failureClass = classifyGeminiError(error);
    logEvent({
      boundary: "ai",
      level: "warn",
      engine: "gemini",
      failure_class: failureClass,
      message: "assistant ask failed",
      expected_degradation: true,
      latency_ms: Date.now() - startedAt,
    });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
