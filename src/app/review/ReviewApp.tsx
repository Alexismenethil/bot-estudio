"use client";

import { useEffect, useState } from "react";
import type { DueQueueItem } from "@/lib/db/queries";
import type { Outcome, ReviewContext } from "@/lib/engine/sm2";

export interface ReviewAnswerPayload {
  itemType: DueQueueItem["itemType"];
  itemId: string;
  outcome: Outcome;
  context: ReviewContext;
  today: string;
}

function todayIso() {
  if (typeof window !== "undefined") {
    const todayParam = new URLSearchParams(window.location.search).get("today");
    if (todayParam) {
      return todayParam;
    }
  }
  return new Date().toISOString().slice(0, 10);
}

export function ReviewApp({
  initialItems,
  today = todayIso(),
  onSubmitAnswer,
}: {
  initialItems?: DueQueueItem[];
  today?: string;
  onSubmitAnswer?: (payload: ReviewAnswerPayload) => void;
}) {
  const [items, setItems] = useState<DueQueueItem[]>(initialItems ?? []);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const current = items[currentIndex];

  useEffect(() => {
    if (initialItems) {
      return;
    }

    let cancelled = false;
    async function loadQueue() {
      const response = await fetch(`/api/review/due?scope=all&horizon=today&today=${today}`).catch(() => null);
      if (!response?.ok || cancelled) {
        return;
      }
      const body = (await response.json()) as { items: DueQueueItem[] };
      setItems(body.items);
    }

    void loadQueue();
    return () => {
      cancelled = true;
    };
  }, [initialItems, today]);

  function submit(outcome: Outcome) {
    if (!current) {
      return;
    }
    const payload: ReviewAnswerPayload = {
      itemType: current.itemType,
      itemId: current.itemId,
      outcome,
      context: "review",
      today,
    };
    onSubmitAnswer?.(payload);
    if (!onSubmitAnswer) {
      void fetch("/api/review/answer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
    setRevealed(false);
    setCurrentIndex((index) => Math.min(index + 1, items.length));
  }

  if (!current) {
    return (
      <main className="grid min-h-dvh place-items-center bg-slate-50 px-4 text-slate-950">
        <section className="max-w-md rounded-[8px] border border-dashed border-slate-300 bg-white p-6 text-center">
          <h1 className="text-2xl font-semibold">Sin repasos pendientes</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            No hay flashcards ni bank questions vencidas para hoy.
          </p>
        </section>
      </main>
    );
  }

  const answerText = current.itemType === "flashcard" ? current.back : current.correctAnswer;
  const frontText = current.itemType === "flashcard" ? current.front : current.prompt;

  return (
    <main className="min-h-dvh bg-slate-50 px-4 py-6 pb-24 text-slate-950">
      <section className="mx-auto flex max-w-2xl flex-col gap-5">
        <header>
          <p className="text-sm font-medium text-blue-700">
            {current.courseCode} / {current.topicName}
          </p>
          <h1 className="mt-1 text-3xl font-semibold">Repaso</h1>
        </header>

        <article className="rounded-[8px] border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase text-slate-500">
            {current.itemType === "flashcard" ? "Flashcard" : "Bank Question"}
          </p>
          <h2 className="mt-4 text-2xl font-semibold">{frontText}</h2>
          {revealed ? (
            <p className="mt-5 rounded-[8px] bg-slate-100 p-4 text-slate-800">{answerText}</p>
          ) : (
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="mt-5 rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white"
            >
              Revelar respuesta
            </button>
          )}
        </article>

        <div className="grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            aria-label="Marcar fallo"
            disabled={!revealed}
            onClick={() => submit("incorrect")}
            className="rounded-full border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-700 disabled:opacity-40"
          >
            Incorrecto
          </button>
          <button
            type="button"
            aria-label="Marcar dificil"
            disabled={!revealed}
            onClick={() => submit("hard")}
            className="rounded-full border border-amber-200 bg-white px-4 py-3 text-sm font-semibold text-amber-700 disabled:opacity-40"
          >
            Dificil
          </button>
          <button
            type="button"
            aria-label="Marcar correcto"
            disabled={!revealed}
            onClick={() => submit("correct")}
            className="rounded-full bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            Correcto
          </button>
        </div>
      </section>
    </main>
  );
}
