"use client";

import { useEffect, useState } from "react";
import type { DueQueueResult } from "@/lib/db/queries";

const emptyDue: DueQueueResult = {
  items: [],
  counts: { total: 0, byType: { flashcard: 0, bankQuestion: 0 }, byCourse: [], byTopic: [] },
};

function todayIso() {
  if (typeof window !== "undefined") {
    const todayParam = new URLSearchParams(window.location.search).get("today");
    if (todayParam) {
      return todayParam;
    }
  }
  return new Date().toISOString().slice(0, 10);
}

export function HomeDashboard({ dueToday }: { dueToday?: DueQueueResult }) {
  const [loadedQueue, setLoadedQueue] = useState<DueQueueResult>(emptyDue);
  const queue = dueToday ?? loadedQueue;

  useEffect(() => {
    if (dueToday) {
      return;
    }

    let cancelled = false;
    async function loadDue() {
      const response = await fetch(`/api/review/due?scope=all&horizon=today&today=${todayIso()}`).catch(() => null);
      if (!response?.ok || cancelled) {
        return;
      }
      setLoadedQueue((await response.json()) as DueQueueResult);
    }

    void loadDue();
    return () => {
      cancelled = true;
    };
  }, [dueToday]);

  return (
    <main className="min-h-dvh bg-slate-50 px-4 py-6 pb-24 text-slate-950">
      <section className="mx-auto flex max-w-5xl flex-col gap-6">
        <header>
          <p className="text-sm font-medium text-blue-700">Repaso de hoy</p>
          <h1 className="mt-1 text-3xl font-semibold">Panel de estudio</h1>
        </header>

        <section aria-label="Resumen de pendientes" className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-[8px] border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">Total vencido</p>
            <p aria-label={`Total vencido: ${queue.counts.total}`} className="mt-2 text-4xl font-semibold">
              {queue.counts.total}
            </p>
          </div>
          <div className="rounded-[8px] border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">Flashcards</p>
            <p aria-label={`Flashcards: ${queue.counts.byType.flashcard}`} className="mt-2 text-3xl font-semibold">
              {queue.counts.byType.flashcard}
            </p>
          </div>
          <div className="rounded-[8px] border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">Bank Questions</p>
            <p
              aria-label={`Bank Questions: ${queue.counts.byType.bankQuestion}`}
              className="mt-2 text-3xl font-semibold"
            >
              {queue.counts.byType.bankQuestion}
            </p>
          </div>
        </section>

        {queue.items.length === 0 ? (
          <section className="rounded-[8px] border border-dashed border-slate-300 bg-white p-6">
            <h2 className="text-lg font-semibold">Nada pendiente</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              No hay flashcards ni preguntas vencidas para hoy.
            </p>
          </section>
        ) : (
          <section aria-label="Pendientes por curso" className="rounded-[8px] border border-slate-200 bg-white">
            <ul className="divide-y divide-slate-100">
              {queue.counts.byCourse.map((course) => (
                <li key={course.courseId} className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <p className="font-semibold">{course.courseCode}</p>
                    <p className="text-sm text-slate-600">{course.courseName}</p>
                  </div>
                  <p className="text-sm font-medium">{course.dueCount} pendientes</p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </section>
    </main>
  );
}
