"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { LibraryDocument } from "./PdfViewer";

type EngineName = "gemini" | "local";

interface Citation {
  page: number;
  chunkId: string;
}

export interface AssistantMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  status: "ok" | "pending_retry";
  engine?: EngineName;
  citations?: Citation[];
}

interface AssistantOverlayProps {
  document: LibraryDocument;
  open: boolean;
  initialMessages?: AssistantMessage[];
  onClose: () => void;
  onCitationSelect: (page: number) => void;
  onRetryPendingQuestion?: (question: string) => void;
}

const unavailableMessage =
  "El asistente esta temporalmente no disponible. Tu pregunta queda guardada para reintentar.";

function apiUrl(path: string) {
  if (typeof window === "undefined") {
    return `http://localhost${path}`;
  }
  const base = window.location.origin === "null" ? "http://localhost" : window.location.origin;
  return new URL(path, base).toString();
}

function hasBrowserLocalEngine() {
  return (
    typeof navigator !== "undefined" &&
    Boolean((navigator as Navigator & { gpu?: unknown }).gpu)
  );
}

async function localFallbackAnswer(documentId: string, question: string) {
  const response = await fetch(apiUrl("/api/assistant/retrieve"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ documentId, question }),
  });
  if (!response.ok) {
    throw new Error("local_retrieve_failed");
  }
  const { chunks } = (await response.json()) as {
    chunks: { id?: string; chunkId?: string; pageNumber: number; content: string }[];
  };
  const [chunk] = chunks;
  if (!chunk) {
    return { answer: "No puedo responder esta pregunta usando el contenido de este documento.", citations: [] };
  }
  return {
    answer: `${chunk.content} [p. ${chunk.pageNumber}]`,
    citations: [{ page: chunk.pageNumber, chunkId: chunk.id ?? chunk.chunkId ?? crypto.randomUUID() }],
  };
}

export function AssistantOverlay({
  document,
  open,
  initialMessages = [],
  onClose,
  onCitationSelect,
  onRetryPendingQuestion,
}: AssistantOverlayProps) {
  const [messages, setMessages] = useState<AssistantMessage[]>(initialMessages);
  const [question, setQuestion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const pendingQuestion = useMemo(
    () => messages.find((message) => message.role === "user" && message.status === "pending_retry")?.content,
    [messages],
  );

  useEffect(() => {
    if (!open || initialMessages.length > 0 || !document.id) {
      return;
    }

    let cancelled = false;
    async function loadMessages() {
      try {
        const response = await fetch(apiUrl(`/api/documents/${document.id}/messages`));
        if (!response.ok || cancelled) {
          return;
        }
        const { messages: loaded } = (await response.json()) as { messages: AssistantMessage[] };
        setMessages(loaded);
      } catch {
        return;
      }
    }

    void loadMessages();
    return () => {
      cancelled = true;
    };
  }, [document.id, initialMessages.length, open]);

  if (!open) {
    return null;
  }

  async function persistMessage(message: AssistantMessage) {
    if (!document.id) {
      return;
    }
    await fetch(apiUrl(`/api/documents/${document.id}/messages`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(message),
    }).catch(() => undefined);
  }

  async function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || submitting) {
      return;
    }
    setQuestion("");
    setSubmitting(true);

    const userMessage: AssistantMessage = { role: "user", content: trimmed, status: "ok" };
    setMessages((current) => [...current, userMessage]);
    await persistMessage(userMessage);

    try {
      if (!document.id) {
        throw new Error("missing_document_id");
      }
      const response = await fetch(apiUrl("/api/assistant/ask"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documentId: document.id, question: trimmed }),
      });

      if (response.ok) {
        const body = (await response.json()) as { answer: string; citations: Citation[]; engine: EngineName };
        const assistantMessage: AssistantMessage = {
          role: "assistant",
          content: body.answer,
          status: "ok",
          engine: body.engine,
          citations: body.citations,
        };
        setMessages((current) => [...current, assistantMessage]);
        await persistMessage(assistantMessage);
        return;
      }

      if (response.status === 502 && hasBrowserLocalEngine()) {
        const local = await localFallbackAnswer(document.id, trimmed);
        const assistantMessage: AssistantMessage = {
          role: "assistant",
          content: local.answer,
          status: "ok",
          engine: "local",
          citations: local.citations,
        };
        setMessages((current) => [...current, assistantMessage]);
        await persistMessage(assistantMessage);
        return;
      }

      throw new Error("assistant_unavailable");
    } catch {
      const pending: AssistantMessage = { role: "user", content: trimmed, status: "pending_retry" };
      setMessages((current) => [...current, pending]);
      await persistMessage(pending);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-white/30 px-4 py-6 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="assistant-title"
        className="flex h-[min(760px,calc(100dvh-3rem))] w-full max-w-[690px] flex-col overflow-hidden rounded-[8px] bg-white shadow-[0_30px_90px_rgba(15,23,42,0.22)]"
      >
        <header className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="grid size-10 place-items-center rounded-full bg-blue-50 text-blue-700">
              AI
            </span>
            <div>
              <h2 id="assistant-title" className="text-base font-semibold text-slate-900">
                TutorPDF
              </h2>
              <p className="text-xs text-slate-500">Asistente de estudio</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Cerrar asistente"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-full text-xl text-slate-500 hover:bg-slate-100"
          >
            x
          </button>
        </header>

        <div className="flex flex-1 flex-col gap-4 overflow-auto px-6 py-5">
          <p className="max-w-[72%] rounded-[8px] border border-slate-100 bg-white px-4 py-3 text-sm leading-6 text-slate-700 shadow-sm">
            Hola, soy TutorPDF, un asistente de IA que esta listo para ayudar con tu estudio.
          </p>

          {messages.map((message, index) => {
            const isUser = message.role === "user";
            return (
              <article
                key={message.id ?? `${message.role}-${index}`}
                className={`max-w-[78%] rounded-[8px] px-4 py-3 text-sm leading-6 shadow-sm ${
                  isUser ? "ml-auto bg-blue-600 text-white" : "mr-auto border border-slate-100 bg-white text-slate-700"
                }`}
              >
                <p>{message.content}</p>
                {message.engine && (
                  <p className={`mt-2 text-xs font-medium ${isUser ? "text-blue-100" : "text-slate-500"}`}>
                    Motor: {message.engine}
                  </p>
                )}
                {message.citations && message.citations.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {message.citations.map((citation) => (
                      <button
                        key={`${citation.chunkId}-${citation.page}`}
                        type="button"
                        aria-label={`Ir a pagina ${citation.page}`}
                        onClick={() => onCitationSelect(citation.page)}
                        className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700"
                      >
                        p. {citation.page}
                      </button>
                    ))}
                  </div>
                )}
              </article>
            );
          })}

          {pendingQuestion && (
            <aside role="status" className="rounded-[8px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p>{unavailableMessage}</p>
              <button
                type="button"
                onClick={() => {
                  setQuestion(pendingQuestion);
                  onRetryPendingQuestion?.(pendingQuestion);
                }}
                className="mt-3 rounded-full bg-amber-900 px-4 py-2 text-xs font-semibold text-white"
              >
                Reintentar pregunta
              </button>
            </aside>
          )}
        </div>

        <form onSubmit={submitQuestion} className="flex items-center gap-3 border-t border-slate-100 p-5">
          <label htmlFor="assistant-question" className="sr-only">
            Escribe tu duda
          </label>
          <input
            id="assistant-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Escribe tu duda aqui..."
            className="min-w-0 flex-1 rounded-full border border-blue-200 px-5 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          <button
            type="submit"
            disabled={submitting || question.trim().length === 0}
            className="grid size-11 place-items-center rounded-full bg-blue-600 text-sm font-semibold text-white disabled:opacity-40"
          >
            Enviar
          </button>
        </form>
      </section>
    </div>
  );
}
