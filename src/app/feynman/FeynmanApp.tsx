"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { runFeynmanFallback } from "./fallback-client";
import type { FeynmanEvaluation } from "@/lib/ai/feynman-eval";
import type { GeminiFailureClass, LocalFailureClass } from "@/lib/ai/types";
import type { FeynmanClientChunk } from "./fallback-client";

export interface FeynmanTopic {
  id: string;
  courseId: string;
  name: string;
  courseCode?: string;
}

export interface FeynmanSubmitInput {
  topicId: string;
  explanation: string;
}

export type FeynmanSubmitResult =
  | { engine: "gemini" | "local"; evaluation: FeynmanEvaluation }
  | { state: "unavailable" };

const draftKey = "bot-estudio:feynman-draft";
const MAX_EXPLANATION_LENGTH = 20_000;

function uniqueDocumentIds(chunks: FeynmanClientChunk[]) {
  return [...new Set(chunks.map((chunk) => chunk.documentId))];
}

function firstSentence(text: string) {
  return text.split(/[.!?]/)[0]?.trim() || text.trim();
}

function createLocalEvaluation(explanation: string, chunks: FeynmanClientChunk[]): FeynmanEvaluation {
  const summary = firstSentence(explanation).slice(0, 140);
  return {
    correctPoints: [summary ? `La explicacion cubre: ${summary}.` : "La explicacion tiene una idea inicial."],
    missingPoints: chunks.length > 0 ? ["Conecta mas explicitamente la idea con el documento citado."] : [],
    wrongPoints: [],
    reviewSuggestions: ["Reescribe la idea con un ejemplo cotidiano y una contra-pregunta."],
    citations: chunks[0] ? [{ documentId: chunks[0].documentId, page: chunks[0].pageNumber }] : [],
  };
}

async function queueRetryState(
  submissionId: string,
  failureClasses: { gemini: GeminiFailureClass; local: LocalFailureClass },
) {
  await fetch(`/api/feynman/submissions/${submissionId}/retry-state`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "pending_retry", failureClasses }),
  });
}

async function submitThroughApi(input: FeynmanSubmitInput): Promise<FeynmanSubmitResult> {
  const createdResponse = await fetch("/api/feynman/submissions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!createdResponse.ok) {
    throw new Error("submission_failed");
  }
  const submission = (await createdResponse.json()) as { id: string };

  const evaluatedResponse = await fetch(`/api/feynman/submissions/${submission.id}/evaluate`, {
    method: "POST",
  });
  if (evaluatedResponse.ok) {
    return (await evaluatedResponse.json()) as FeynmanSubmitResult;
  }

  const failure = (await evaluatedResponse.json().catch(() => ({ failureClass: "invalid_response" }))) as {
    failureClass: GeminiFailureClass;
  };

  const retrievedResponse = await fetch("/api/feynman/retrieve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ submissionId: submission.id }),
  }).catch(() => null);

  if (!retrievedResponse?.ok) {
    await queueRetryState(submission.id, { gemini: failure.failureClass, local: "not_cached" });
    return { state: "unavailable" };
  }

  const retrieved = (await retrievedResponse.json()) as { chunks: FeynmanClientChunk[] };
  const fallback = await runFeynmanFallback(
    {
      submissionId: submission.id,
      explanation: input.explanation,
      readyDocumentIds: uniqueDocumentIds(retrieved.chunks),
      geminiFailureClass: failure.failureClass,
    },
    {
      getCachedChunks: async () => retrieved.chunks,
      evaluateLocal: async (explanation, chunks) => createLocalEvaluation(explanation, chunks),
      persistEvaluation: async (submissionId, evaluation) => {
        const response = await fetch(`/api/feynman/submissions/${submissionId}/evaluations`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ engine: "local", evaluation }),
        });
        if (!response.ok) {
          throw new Error("persist_failed");
        }
      },
      queueRetryState,
    },
  );

  return fallback.ok ? { engine: "local", evaluation: fallback.evaluation } : { state: "unavailable" };
}

function EvaluationList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-[8px] border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">Sin puntos registrados.</p>
      ) : (
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Feedback({
  engine,
  evaluation,
}: {
  engine: "gemini" | "local";
  evaluation: FeynmanEvaluation;
}) {
  return (
    <section aria-label="Feedback Feynman" className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Feedback</h2>
        <p
          aria-label="Motor evaluador"
          className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-800"
        >
          Motor: {engine === "gemini" ? "Gemini" : "Local"}
        </p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <EvaluationList title="Puntos correctos" items={evaluation.correctPoints} />
        <EvaluationList title="Faltantes" items={evaluation.missingPoints} />
        <EvaluationList title="Errores" items={evaluation.wrongPoints} />
        <EvaluationList title="Sugerencias" items={evaluation.reviewSuggestions} />
      </div>
      <section className="rounded-[8px] border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold">Citas</h3>
        {evaluation.citations.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Sin citas.</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2 text-sm">
            {evaluation.citations.map((citation) => (
              <li
                key={`${citation.documentId}:${citation.page}`}
                className="rounded-full bg-slate-100 px-3 py-1 text-slate-700"
              >
                Pag. {citation.page}
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

export function FeynmanApp({
  initialTopics = [],
  initialExplanation,
  initialStatus,
  initialFeedback,
  onSubmitExplanation,
}: {
  initialTopics?: FeynmanTopic[];
  initialExplanation?: string;
  initialStatus?: "unavailable";
  initialFeedback?: { engine: "gemini" | "local"; evaluation: FeynmanEvaluation };
  onSubmitExplanation?: (input: FeynmanSubmitInput) => Promise<FeynmanSubmitResult>;
}) {
  const [topics, setTopics] = useState(initialTopics);
  const [selectedTopicId, setSelectedTopicId] = useState(initialTopics[0]?.id ?? "");
  const [explanation, setExplanation] = useState(initialExplanation ?? "");
  const [feedback, setFeedback] = useState(initialFeedback);
  const [status, setStatus] = useState<"idle" | "submitting" | "unavailable">(
    initialStatus ?? "idle",
  );
  const [error, setError] = useState("");

  useEffect(() => {
    if (initialTopics.length > 0) {
      return;
    }

    let cancelled = false;
    async function loadTopics() {
      const response = await fetch("/api/topics").catch(() => null);
      if (!response?.ok || cancelled) {
        return;
      }
      const loaded = (await response.json()) as FeynmanTopic[];
      setTopics(loaded);
      setSelectedTopicId((current) => current || loaded[0]?.id || "");
    }

    void loadTopics();
    return () => {
      cancelled = true;
    };
  }, [initialTopics.length]);

  useEffect(() => {
    if (initialExplanation !== undefined || typeof window === "undefined") {
      return;
    }
    const storage = window.localStorage;
    if (typeof storage?.getItem !== "function") {
      return;
    }
    const saved = storage.getItem(draftKey);
    if (saved) {
      let cancelled = false;
      queueMicrotask(() => {
        if (!cancelled) {
          setExplanation(saved);
        }
      });
      return () => {
        cancelled = true;
      };
    }
  }, [initialExplanation]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.localStorage?.setItem !== "function") {
      return;
    }
    window.localStorage.setItem(draftKey, explanation);
  }, [explanation]);

  const overLimit = explanation.length > MAX_EXPLANATION_LENGTH;
  const canSubmit = selectedTopicId && explanation.trim().length > 0 && !overLimit && status !== "submitting";
  const selectedTopic = useMemo(
    () => topics.find((topic) => topic.id === selectedTopicId),
    [selectedTopicId, topics],
  );

  async function submitExplanation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    setStatus("submitting");
    setError("");
    setFeedback(undefined);

    try {
      const result = onSubmitExplanation
        ? await onSubmitExplanation({ topicId: selectedTopicId, explanation })
        : await submitThroughApi({ topicId: selectedTopicId, explanation });

      if ("state" in result) {
        setStatus("unavailable");
        return;
      }

      setFeedback(result);
      setStatus("idle");
    } catch {
      setError("No pudimos enviar la explicacion.");
      setStatus("idle");
    }
  }

  return (
    <main className="min-h-dvh bg-slate-50 px-4 py-6 pb-24 text-slate-950">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[360px_1fr]">
        <section>
          <p className="text-sm font-medium text-blue-700">US5</p>
          <h1 className="mt-1 text-3xl font-semibold">Modo Feynman</h1>
          <form onSubmit={submitExplanation} className="mt-5 rounded-[8px] border border-slate-200 bg-white p-4">
            <label htmlFor="feynman-topic" className="block text-sm font-medium">
              Tema
            </label>
            <select
              id="feynman-topic"
              value={selectedTopicId}
              onChange={(event) => setSelectedTopicId(event.target.value)}
              className="mt-2 w-full rounded-[8px] border border-slate-300 bg-white px-3 py-2"
            >
              <option value="">Selecciona un tema</option>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.courseCode ? `${topic.courseCode} - ` : ""}
                  {topic.name}
                </option>
              ))}
            </select>

            <label htmlFor="feynman-explanation" className="mt-4 block text-sm font-medium">
              Tu explicacion
            </label>
            <textarea
              id="feynman-explanation"
              value={explanation}
              onChange={(event) => {
                setExplanation(event.target.value);
                if (status === "unavailable") {
                  setStatus("idle");
                }
              }}
              rows={12}
              className="mt-2 min-h-72 w-full resize-y rounded-[8px] border border-slate-300 px-3 py-2 leading-6"
            />
            <p className={`mt-2 text-sm ${overLimit ? "font-medium text-red-700" : "text-slate-500"}`}>
              {explanation.length}/{MAX_EXPLANATION_LENGTH} caracteres
              {overLimit ? " - Maximo 20000 caracteres." : ""}
            </p>

            <button
              type="submit"
              disabled={!canSubmit}
              className="mt-4 w-full rounded-full bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              {status === "submitting" ? "Evaluando..." : "Evaluar explicacion"}
            </button>
            {error && <p className="mt-3 text-sm font-medium text-red-700">{error}</p>}
          </form>
        </section>

        <section className="grid content-start gap-5">
          {selectedTopic && (
            <section className="rounded-[8px] border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-semibold">{selectedTopic.name}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Escribe la explicacion como si se la contaras a otra persona y recibe feedback estructurado.
              </p>
            </section>
          )}

          {status === "unavailable" && (
            <section
              role="status"
              className="rounded-[8px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
            >
              No pudimos evaluar ahora. Intenta de nuevo mas tarde; tu explicacion queda preservada.
            </section>
          )}

          {feedback ? (
            <Feedback engine={feedback.engine} evaluation={feedback.evaluation} />
          ) : (
            <section className="rounded-[8px] border border-dashed border-slate-300 bg-white p-6">
              <h2 className="text-lg font-semibold">Sin evaluacion aun</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                El feedback aparecera aqui cuando termines la evaluacion.
              </p>
            </section>
          )}
        </section>
      </div>
    </main>
  );
}
