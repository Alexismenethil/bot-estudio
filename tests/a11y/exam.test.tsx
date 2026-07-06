import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { ExamApp } from "@/app/exam/ExamApp";

const topic = {
  id: "22222222-2222-4222-8222-222222222222",
  courseId: "11111111-1111-4111-8111-111111111111",
  name: "Examen",
  courseCode: "IS-481",
};

const questions = [
  {
    id: "33333333-3333-4333-8333-333333333333",
    topicId: topic.id,
    prompt: "Que verifica el rojo en TDD?",
    correctAnswer: "Que el comportamiento aun no existe.",
    explanation: "El rojo evita falsos positivos.",
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    topicId: topic.id,
    prompt: "Que hace el verde?",
    correctAnswer: "Implementa lo minimo.",
    explanation: "El verde satisface el test.",
  },
];

const activeSession = {
  id: "55555555-5555-4555-8555-555555555555",
  scopeType: "topic" as const,
  scopeId: topic.id,
  questionIds: questions.map((question) => question.id),
  durationSeconds: 120,
  startedAt: "2026-07-06T12:00:00.000Z",
  status: "active" as const,
  remainingMs: 90_000,
  answers: [],
};

const report = {
  totalQuestions: 2,
  answeredCount: 1,
  correctCount: 1,
  scorePct: 50,
  failed: [
    {
      questionId: questions[1].id,
      topicId: topic.id,
      prompt: questions[1].prompt,
      correctAnswer: questions[1].correctAnswer,
      explanation: questions[1].explanation,
    },
  ],
};

describe("US4 Exam UI [FR-019, FR-020, FR-021, FR-028, FR-029, US4-AC2..6]", () => {
  it("has no WCAG violations in the exam configuration surface", async () => {
    const { container } = render(<ExamApp initialTopics={[topic]} initialQuestions={questions} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("renders duration configuration controls", () => {
    render(<ExamApp initialTopics={[topic]} initialQuestions={questions} />);

    expect(screen.getByRole("heading", { name: /simulador de examen/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/tema/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/duracion/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /iniciar examen/i })).toBeInTheDocument();
  });

  it("renders a countdown from server-provided remainingMs", () => {
    render(<ExamApp initialTopics={[topic]} initialQuestions={questions} initialSession={activeSession} />);

    expect(screen.getByLabelText(/tiempo restante/i)).toHaveTextContent("01:30");
    expect(screen.getByText(questions[0].prompt)).toBeInTheDocument();
  });

  it("saves answers and keeps the countdown cosmetic", async () => {
    const submitAnswer = vi.fn().mockResolvedValue({ questionId: questions[0].id, isCorrect: true });
    render(
      <ExamApp
        initialTopics={[topic]}
        initialQuestions={questions}
        initialSession={activeSession}
        onSubmitAnswer={submitAnswer}
      />,
    );

    fireEvent.change(screen.getByLabelText(/tu respuesta/i), {
      target: { value: questions[0].correctAnswer },
    });
    fireEvent.click(screen.getByRole("button", { name: /guardar respuesta/i }));

    await waitFor(() => expect(submitAnswer).toHaveBeenCalled());
    expect(screen.getByLabelText(/tiempo restante/i)).toBeInTheDocument();
  });

  it("renders the score report with failed breakdown", () => {
    render(
      <ExamApp
        initialTopics={[topic]}
        initialQuestions={questions}
        initialSession={{ ...activeSession, status: "finished", remainingMs: 0 }}
        initialReport={report}
      />,
    );

    expect(screen.getByRole("heading", { name: /reporte de examen/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/puntaje/i)).toHaveTextContent("50%");
    expect(screen.getByText(questions[1].prompt)).toBeInTheDocument();
    expect(screen.getByText(/repaso prioritario/i)).toBeInTheDocument();
  });

  it("lets a student return to the configuration form to start a new exam", () => {
    render(
      <ExamApp
        initialTopics={[topic]}
        initialQuestions={questions}
        initialSession={{ ...activeSession, status: "finished", remainingMs: 0 }}
        initialReport={report}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /configurar nuevo examen/i }));

    expect(screen.getByRole("heading", { name: /simulador de examen/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /iniciar examen/i })).toBeEnabled();
    expect(screen.queryByRole("heading", { name: /reporte de examen/i })).not.toBeInTheDocument();
  });
});
