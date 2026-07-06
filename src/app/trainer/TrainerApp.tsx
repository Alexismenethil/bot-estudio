"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { ReviewState } from "@/lib/engine/sm2";

export interface TrainerTopic {
  id: string;
  courseId: string;
  name: string;
  courseCode?: string;
}

export interface TrainerBankQuestion {
  id: string;
  topicId: string;
  prompt: string;
  correctAnswer: string;
  explanation: string;
}

export interface TrainerSession {
  id: string;
  scopeType: "topic" | "course";
  scopeId: string;
  questionIds: string[];
  currentIndex: number;
  status: "active" | "finished";
}

export interface TrainerAnswerPayload {
  sessionId: string;
  questionId: string;
  givenAnswer: string;
  today: string;
}

export interface TrainerAnswerResult {
  isCorrect: boolean;
  explanation: string;
  review: {
    state: ReviewState;
    scheduleChanged: boolean;
  };
}

interface QuestionDraft {
  prompt: string;
  correctAnswer: string;
  explanation: string;
}

const emptyDraft: QuestionDraft = {
  prompt: "",
  correctAnswer: "",
  explanation: "",
};

const storageKey = "bot-estudio:active-trainer-session";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function questionMatchesTopic(question: TrainerBankQuestion, topicId: string) {
  return question.topicId === topicId;
}

export function TrainerApp({
  initialTopics = [],
  initialQuestions,
  initialSession,
  onCreateQuestion,
  onUpdateQuestion,
  onStartSession,
  onSubmitAnswer,
}: {
  initialTopics?: TrainerTopic[];
  initialQuestions?: TrainerBankQuestion[];
  initialSession?: TrainerSession;
  onCreateQuestion?: (draft: QuestionDraft & { topicId: string }) => Promise<TrainerBankQuestion>;
  onUpdateQuestion?: (id: string, draft: QuestionDraft) => Promise<TrainerBankQuestion>;
  onStartSession?: (scope: { scopeType: "topic"; scopeId: string }) => Promise<TrainerSession>;
  onSubmitAnswer?: (payload: TrainerAnswerPayload) => Promise<TrainerAnswerResult>;
}) {
  const [topics, setTopics] = useState(initialTopics);
  const [selectedTopicId, setSelectedTopicId] = useState(
    initialSession?.scopeId ?? initialTopics[0]?.id ?? "",
  );
  const [questions, setQuestions] = useState<TrainerBankQuestion[]>(initialQuestions ?? []);
  const [draft, setDraft] = useState<QuestionDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [session, setSession] = useState<TrainerSession | undefined>(initialSession);
  const [sessionError, setSessionError] = useState("");
  const [givenAnswer, setGivenAnswer] = useState("");
  const [feedback, setFeedback] = useState<TrainerAnswerResult | null>(null);

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
      const loaded = (await response.json()) as TrainerTopic[];
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
      const body = (await response.json()) as { bankQuestions: TrainerBankQuestion[] };
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
      const response = await fetch(`/api/trainer/sessions/${sessionId}`).catch(() => null);
      if (!response?.ok || cancelled) {
        return;
      }
      const loaded = (await response.json()) as TrainerSession;
      setSession(loaded);
      setSelectedTopicId(loaded.scopeId);
    }

    void resumeSession();
    return () => {
      cancelled = true;
    };
  }, [initialSession]);

  const topicQuestions = useMemo(
    () => questions.filter((question) => questionMatchesTopic(question, selectedTopicId)),
    [questions, selectedTopicId],
  );
  const currentQuestion = session
    ? questions.find((question) => question.id === session.questionIds[session.currentIndex])
    : undefined;

  async function saveQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTopicId) {
      return;
    }

    if (editingId) {
      const updated = onUpdateQuestion
        ? await onUpdateQuestion(editingId, draft)
        : await fetch(`/api/bank-questions/${editingId}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(draft),
          }).then((response) => response.json() as Promise<TrainerBankQuestion>);

      setQuestions((current) => current.map((question) => (question.id === updated.id ? updated : question)));
      setEditingId(null);
    } else {
      const created = onCreateQuestion
        ? await onCreateQuestion({ ...draft, topicId: selectedTopicId })
        : await fetch("/api/bank-questions", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...draft, topicId: selectedTopicId }),
          }).then((response) => response.json() as Promise<TrainerBankQuestion>);

      setQuestions((current) => [...current, created]);
    }

    setDraft(emptyDraft);
    setSessionError("");
  }

  function editQuestion(question: TrainerBankQuestion) {
    setEditingId(question.id);
    setDraft({
      prompt: question.prompt,
      correctAnswer: question.correctAnswer,
      explanation: question.explanation,
    });
  }

  async function startSession() {
    if (!selectedTopicId) {
      return;
    }
    setSessionError("");
    setFeedback(null);
    setGivenAnswer("");

    const nextSession = onStartSession
      ? await onStartSession({ scopeType: "topic", scopeId: selectedTopicId })
      : await fetch("/api/trainer/sessions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ scopeType: "topic", scopeId: selectedTopicId }),
        }).then(async (response) => {
          if (response.status === 422) {
            setSessionError("Banco de preguntas vacio.");
            return undefined;
          }
          return response.json() as Promise<TrainerSession>;
        });

    if (nextSession) {
      setSession(nextSession);
      if (typeof window !== "undefined" && typeof window.localStorage?.setItem === "function") {
        window.localStorage.setItem(storageKey, nextSession.id);
      }
    }
  }

  async function submitAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !currentQuestion || feedback) {
      return;
    }

    const payload = {
      sessionId: session.id,
      questionId: currentQuestion.id,
      givenAnswer,
      today: todayIso(),
    };
    const result = onSubmitAnswer
      ? await onSubmitAnswer(payload)
      : await fetch(`/api/trainer/sessions/${session.id}/answers`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ questionId: currentQuestion.id, givenAnswer }),
        }).then((response) => response.json() as Promise<TrainerAnswerResult>);

    setFeedback(result);
  }

  function continueSession() {
    if (!session) {
      return;
    }
    const nextIndex = session.currentIndex + 1;
    const finished = nextIndex >= session.questionIds.length;
    setSession({
      ...session,
      currentIndex: nextIndex,
      status: finished ? "finished" : "active",
    });
    setGivenAnswer("");
    setFeedback(null);
    if (finished && typeof window !== "undefined" && typeof window.localStorage?.removeItem === "function") {
      window.localStorage.removeItem(storageKey);
    }
  }

  const sessionFinished = session?.status === "finished" || Boolean(session && !currentQuestion);

  return (
    <main className="min-h-dvh bg-slate-50 px-4 py-6 pb-24 text-slate-950">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[360px_1fr]">
        <section>
          <p className="text-sm font-medium text-blue-700">US3</p>
          <h1 className="mt-1 text-3xl font-semibold">Entrenador</h1>
          <div className="mt-5">
            <label htmlFor="trainer-topic" className="block text-sm font-medium">
              Tema
            </label>
            <select
              id="trainer-topic"
              value={selectedTopicId}
              onChange={(event) => {
                setSelectedTopicId(event.target.value);
                setSession(undefined);
                setFeedback(null);
                if (typeof window !== "undefined" && typeof window.localStorage?.removeItem === "function") {
                  window.localStorage.removeItem(storageKey);
                }
              }}
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
          </div>

          <button
            type="button"
            onClick={startSession}
            disabled={!selectedTopicId || topicQuestions.length === 0}
            className="mt-4 w-full rounded-full bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            Iniciar practica
          </button>
          {sessionError && <p className="mt-3 text-sm font-medium text-red-700">{sessionError}</p>}
        </section>

        <section className="grid gap-5">
          <form onSubmit={saveQuestion} className="rounded-[8px] border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold">
              {editingId ? "Editar bank question" : "Nueva bank question"}
            </h2>
            <label htmlFor="bank-question-prompt" className="mt-4 block text-sm font-medium">
              Enunciado
            </label>
            <textarea
              id="bank-question-prompt"
              value={draft.prompt}
              onChange={(event) => setDraft((current) => ({ ...current, prompt: event.target.value }))}
              className="mt-2 min-h-24 w-full rounded-[8px] border border-slate-300 px-3 py-2"
            />
            <label htmlFor="bank-question-answer" className="mt-4 block text-sm font-medium">
              Respuesta correcta
            </label>
            <input
              id="bank-question-answer"
              value={draft.correctAnswer}
              onChange={(event) =>
                setDraft((current) => ({ ...current, correctAnswer: event.target.value }))
              }
              className="mt-2 w-full rounded-[8px] border border-slate-300 px-3 py-2"
            />
            <label htmlFor="bank-question-explanation" className="mt-4 block text-sm font-medium">
              Explicacion
            </label>
            <textarea
              id="bank-question-explanation"
              value={draft.explanation}
              onChange={(event) => setDraft((current) => ({ ...current, explanation: event.target.value }))}
              className="mt-2 min-h-24 w-full rounded-[8px] border border-slate-300 px-3 py-2"
            />
            <button
              type="submit"
              className="mt-4 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
            >
              {editingId ? "Guardar cambios" : "Crear pregunta"}
            </button>
          </form>

          <section className="rounded-[8px] border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold">Banco de preguntas</h2>
            {topicQuestions.length === 0 ? (
              <p className="mt-3 rounded-[8px] border border-dashed border-slate-300 p-4 text-sm text-slate-600">
                Banco de preguntas vacio.
              </p>
            ) : (
              <ul className="mt-3 grid gap-3">
                {topicQuestions.map((question) => (
                  <li key={question.id} className="rounded-[8px] border border-slate-100 p-3">
                    <p className="font-medium">{question.prompt}</p>
                    <p className="mt-2 text-sm text-slate-600">{question.correctAnswer}</p>
                    <button
                      type="button"
                      onClick={() => editQuestion(question)}
                      className="mt-3 rounded-full border border-slate-300 px-3 py-2 text-sm font-semibold"
                    >
                      Editar pregunta
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-[8px] border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold">Practica</h2>
            {!session ? (
              <p className="mt-3 text-sm text-slate-600">Selecciona un tema con preguntas para comenzar.</p>
            ) : sessionFinished ? (
              <p className="mt-3 rounded-[8px] bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
                Sesion finalizada.
              </p>
            ) : currentQuestion ? (
              <article className="mt-3">
                <p className="text-sm font-medium text-blue-700">
                  Pregunta {session.currentIndex + 1} de {session.questionIds.length}
                </p>
                <h3 className="mt-3 text-xl font-semibold">{currentQuestion.prompt}</h3>
                <form onSubmit={submitAnswer} className="mt-4">
                  <label htmlFor="trainer-answer" className="block text-sm font-medium">
                    Tu respuesta
                  </label>
                  <textarea
                    id="trainer-answer"
                    value={givenAnswer}
                    onChange={(event) => setGivenAnswer(event.target.value)}
                    disabled={Boolean(feedback)}
                    className="mt-2 min-h-24 w-full rounded-[8px] border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                  />
                  <button
                    type="submit"
                    disabled={!givenAnswer.trim() || Boolean(feedback)}
                    className="mt-3 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    Responder
                  </button>
                </form>

                {feedback && (
                  <div
                    role="status"
                    className={`mt-4 rounded-[8px] p-4 ${
                      feedback.isCorrect ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"
                    }`}
                  >
                    <p className="font-semibold">{feedback.isCorrect ? "Correcto" : "Incorrecto"}</p>
                    <p className="mt-2 text-sm leading-6">{feedback.explanation}</p>
                    {!feedback.isCorrect && feedback.review.scheduleChanged && (
                      <p className="mt-3 text-sm font-semibold">Repaso prioritario.</p>
                    )}
                    <button
                      type="button"
                      onClick={continueSession}
                      className="mt-4 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 ring-1 ring-slate-200"
                    >
                      Continuar
                    </button>
                  </div>
                )}
              </article>
            ) : null}
          </section>
        </section>
      </div>
    </main>
  );
}
