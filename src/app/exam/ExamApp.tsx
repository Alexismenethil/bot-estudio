"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

export interface ExamTopic {
  id: string;
  courseId: string;
  name: string;
  courseCode?: string;
}

export interface ExamBankQuestion {
  id: string;
  topicId: string;
  prompt: string;
  correctAnswer: string;
  explanation: string;
}

export interface ExamAnswerSummary {
  questionId: string;
  isCorrect: boolean;
}

export interface ExamSessionView {
  id: string;
  scopeType: "topic" | "course";
  scopeId: string;
  questionIds: string[];
  durationSeconds: number;
  startedAt: string;
  status: "active" | "finished";
  remainingMs: number;
  answers: ExamAnswerSummary[];
}

export interface ExamReport {
  totalQuestions: number;
  answeredCount: number;
  correctCount: number;
  scorePct: number;
  failed: {
    questionId: string;
    topicId: string;
    prompt: string;
    correctAnswer: string;
    explanation: string;
  }[];
}

const storageKey = "bot-estudio:active-exam-session";

function formatRemaining(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function ExamApp({
  initialTopics = [],
  initialQuestions,
  initialSession,
  initialReport,
  onStartSession,
  onSubmitAnswer,
  onFinalize,
}: {
  initialTopics?: ExamTopic[];
  initialQuestions?: ExamBankQuestion[];
  initialSession?: ExamSessionView;
  initialReport?: ExamReport;
  onStartSession?: (input: {
    scopeType: "topic";
    scopeId: string;
    durationSeconds: number;
  }) => Promise<ExamSessionView>;
  onSubmitAnswer?: (payload: {
    sessionId: string;
    questionId: string;
    givenAnswer: string;
  }) => Promise<ExamAnswerSummary>;
  onFinalize?: (sessionId: string) => Promise<ExamReport>;
}) {
  const [topics, setTopics] = useState(initialTopics);
  const [selectedTopicId, setSelectedTopicId] = useState(initialSession?.scopeId ?? initialTopics[0]?.id ?? "");
  const [questions, setQuestions] = useState<ExamBankQuestion[]>(initialQuestions ?? []);
  const [durationSeconds, setDurationSeconds] = useState(120);
  const [session, setSession] = useState<ExamSessionView | undefined>(initialSession);
  const [answers, setAnswers] = useState<ExamAnswerSummary[]>(initialSession?.answers ?? []);
  const [answerText, setAnswerText] = useState("");
  const [remaining, setRemaining] = useState(initialSession?.remainingMs ?? 0);
  const [report, setReport] = useState<ExamReport | undefined>(initialReport);
  const [error, setError] = useState("");
  const [finalizing, setFinalizing] = useState(false);

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
      const loaded = (await response.json()) as ExamTopic[];
      setTopics(loaded);
      setSelectedTopicId((current) => current || loaded[0]?.id || "");
    }

    void loadTopics();
    return () => {
      cancelled = true;
    };
  }, [initialTopics.length]);

  useEffect(() => {
    if (initialQuestions || !selectedTopicId) {
      return;
    }

    let cancelled = false;
    async function loadQuestions() {
      const response = await fetch(`/api/bank-questions?topicId=${selectedTopicId}`).catch(() => null);
      if (!response?.ok || cancelled) {
        return;
      }
      const body = (await response.json()) as { bankQuestions: ExamBankQuestion[] };
      setQuestions((current) => [
        ...current.filter((question) => question.topicId !== selectedTopicId),
        ...body.bankQuestions,
      ]);
    }

    void loadQuestions();
    return () => {
      cancelled = true;
    };
  }, [initialQuestions, selectedTopicId]);

  useEffect(() => {
    if (initialSession || typeof window === "undefined") {
      return;
    }
    const storage = window.localStorage;
    if (typeof storage?.getItem !== "function") {
      return;
    }
    const sessionId = storage.getItem(storageKey);
    if (!sessionId) {
      return;
    }

    let cancelled = false;
    async function resumeSession() {
      const response = await fetch(`/api/exam/sessions/${sessionId}`).catch(() => null);
      if (!response?.ok || cancelled) {
        return;
      }
      const loaded = (await response.json()) as ExamSessionView & { report?: ExamReport };
      setSession(loaded);
      setSelectedTopicId(loaded.scopeId);
      setAnswers(loaded.answers ?? []);
      setRemaining(loaded.remainingMs);
      if (loaded.report) {
        setReport(loaded.report);
      }
    }

    void resumeSession();
    return () => {
      cancelled = true;
    };
  }, [initialSession]);

  const topicQuestions = useMemo(
    () => questions.filter((question) => question.topicId === selectedTopicId),
    [questions, selectedTopicId],
  );
  const answeredIds = useMemo(() => new Set(answers.map((answer) => answer.questionId)), [answers]);
  const currentQuestion = session
    ? questions.find((question) => session.questionIds.includes(question.id) && !answeredIds.has(question.id))
    : undefined;

  const finalizeSession = useCallback(async () => {
    if (!session || finalizing || report) {
      return;
    }
    setFinalizing(true);
    const nextReport = onFinalize
      ? await onFinalize(session.id)
      : await fetch(`/api/exam/sessions/${session.id}/finalize`, { method: "POST" }).then(
          (response) => response.json() as Promise<ExamReport>,
        );
    setReport(nextReport);
    setRemaining(0);
    setSession((current) => (current ? { ...current, status: "finished", remainingMs: 0 } : current));
    setFinalizing(false);
  }, [finalizing, onFinalize, report, session]);

  useEffect(() => {
    if (!session || session.status !== "active" || report) {
      return;
    }

    const deadline = Date.now() + session.remainingMs;
    const tick = () => {
      const nextRemaining = Math.max(0, deadline - Date.now());
      setRemaining(nextRemaining);
      if (nextRemaining === 0) {
        void finalizeSession();
      }
    };
    tick();
    const intervalId = window.setInterval(tick, 250);
    return () => window.clearInterval(intervalId);
  }, [finalizeSession, report, session]);

  async function startExam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTopicId) {
      return;
    }
    setError("");
    const created = onStartSession
      ? await onStartSession({ scopeType: "topic", scopeId: selectedTopicId, durationSeconds })
      : await fetch("/api/exam/sessions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ scopeType: "topic", scopeId: selectedTopicId, durationSeconds }),
        }).then(async (response) => {
          if (response.status === 422) {
            setError("Banco de preguntas vacio.");
            return undefined;
          }
          return response.json() as Promise<ExamSessionView>;
        });

    if (!created) {
      return;
    }
    setSession(created);
    setAnswers(created.answers ?? []);
    setRemaining(created.remainingMs);
    setReport(undefined);
    if (typeof window !== "undefined" && typeof window.localStorage?.setItem === "function") {
      window.localStorage.setItem(storageKey, created.id);
    }
  }

  async function saveAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !currentQuestion) {
      return;
    }

    const saved = onSubmitAnswer
      ? await onSubmitAnswer({ sessionId: session.id, questionId: currentQuestion.id, givenAnswer: answerText })
      : await fetch(`/api/exam/sessions/${session.id}/answers`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ questionId: currentQuestion.id, givenAnswer: answerText }),
        }).then(async (response) => {
          if (response.status === 409) {
            await finalizeSession();
            throw new Error("expired");
          }
          return response.json() as Promise<ExamAnswerSummary>;
        });

    setAnswers((current) => [...current, saved]);
    setAnswerText("");
  }

  if (report) {
    return (
      <main className="min-h-dvh bg-slate-50 px-4 py-6 pb-24 text-slate-950">
        <section className="mx-auto max-w-3xl rounded-[8px] border border-slate-200 bg-white p-5">
          <p className="text-sm font-medium text-blue-700">US4</p>
          <h1 className="mt-1 text-3xl font-semibold">Reporte de examen</h1>
          <p aria-label="Puntaje" className="mt-5 text-5xl font-semibold">
            {Math.round(report.scorePct)}%
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {report.correctCount} correctas de {report.totalQuestions} preguntas.
          </p>
          <section className="mt-6">
            <h2 className="text-base font-semibold">Preguntas falladas</h2>
            {report.failed.length === 0 ? (
              <p className="mt-3 rounded-[8px] bg-emerald-50 p-4 text-sm text-emerald-800">
                Sin fallos registrados.
              </p>
            ) : (
              <ul className="mt-3 grid gap-3">
                {report.failed.map((failed) => (
                  <li key={failed.questionId} className="rounded-[8px] border border-amber-200 bg-amber-50 p-4">
                    <p className="font-semibold">{failed.prompt}</p>
                    <p className="mt-2 text-sm text-amber-900">Respuesta: {failed.correctAnswer}</p>
                    <p className="mt-2 text-sm text-amber-900">{failed.explanation}</p>
                    <p className="mt-3 text-sm font-semibold text-amber-950">Repaso prioritario</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-slate-50 px-4 py-6 pb-24 text-slate-950">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[360px_1fr]">
        <section>
          <p className="text-sm font-medium text-blue-700">US4</p>
          <h1 className="mt-1 text-3xl font-semibold">Simulador de examen</h1>
          <form onSubmit={startExam} className="mt-5 rounded-[8px] border border-slate-200 bg-white p-4">
            <label htmlFor="exam-topic" className="block text-sm font-medium">
              Tema
            </label>
            <select
              id="exam-topic"
              value={selectedTopicId}
              disabled={Boolean(session)}
              onChange={(event) => setSelectedTopicId(event.target.value)}
              className="mt-2 w-full rounded-[8px] border border-slate-300 bg-white px-3 py-2 disabled:bg-slate-100"
            >
              <option value="">Selecciona un tema</option>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.courseCode ? `${topic.courseCode} - ` : ""}
                  {topic.name}
                </option>
              ))}
            </select>
            <label htmlFor="exam-duration" className="mt-4 block text-sm font-medium">
              Duracion (segundos)
            </label>
            <input
              id="exam-duration"
              type="number"
              min={1}
              value={durationSeconds}
              disabled={Boolean(session)}
              onChange={(event) => setDurationSeconds(Number(event.target.value))}
              className="mt-2 w-full rounded-[8px] border border-slate-300 px-3 py-2 disabled:bg-slate-100"
            />
            <button
              type="submit"
              disabled={Boolean(session) || !selectedTopicId || topicQuestions.length === 0}
              className="mt-4 w-full rounded-full bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              Iniciar examen
            </button>
            {error && <p className="mt-3 text-sm font-medium text-red-700">{error}</p>}
          </form>
        </section>

        <section className="rounded-[8px] border border-slate-200 bg-white p-4">
          {session ? (
            <>
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-base font-semibold">Examen en curso</h2>
                <p aria-label="Tiempo restante" className="font-mono text-2xl font-semibold text-blue-700">
                  {formatRemaining(remaining)}
                </p>
              </div>
              {currentQuestion ? (
                <article className="mt-5">
                  <p className="text-sm text-slate-600">
                    Pregunta {answers.length + 1} de {session.questionIds.length}
                  </p>
                  <h3 className="mt-3 text-xl font-semibold">{currentQuestion.prompt}</h3>
                  <form onSubmit={saveAnswer} className="mt-4">
                    <label htmlFor="exam-answer" className="block text-sm font-medium">
                      Tu respuesta
                    </label>
                    <textarea
                      id="exam-answer"
                      value={answerText}
                      onChange={(event) => setAnswerText(event.target.value)}
                      className="mt-2 min-h-24 w-full rounded-[8px] border border-slate-300 px-3 py-2"
                    />
                    <button
                      type="submit"
                      disabled={!answerText.trim()}
                      className="mt-3 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                    >
                      Guardar respuesta
                    </button>
                  </form>
                </article>
              ) : (
                <div className="mt-5 rounded-[8px] bg-slate-100 p-4">
                  <p className="text-sm font-medium">Todas las respuestas fueron guardadas.</p>
                  <button
                    type="button"
                    onClick={() => void finalizeSession()}
                    className="mt-3 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
                  >
                    Finalizar ahora
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-600">Configura un tema y una duracion para iniciar.</p>
          )}
        </section>
      </div>
    </main>
  );
}
