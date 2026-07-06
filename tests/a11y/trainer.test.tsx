import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { TrainerApp } from "@/app/trainer/TrainerApp";

const topic = {
  id: "22222222-2222-4222-8222-222222222222",
  courseId: "11111111-1111-4111-8111-111111111111",
  name: "Entrenador",
  courseCode: "IS-481",
};

const question = {
  id: "33333333-3333-4333-8333-333333333333",
  topicId: topic.id,
  prompt: "¿Qué verifica el rojo en TDD?",
  correctAnswer: "Que el comportamiento no existe aun.",
  explanation: "Un test rojo evita falsos positivos antes de implementar.",
};

describe("US3 Trainer UI [FR-015, FR-017, FR-028, FR-031, US3-AC3, US3-AC4]", () => {
  it("has no WCAG violations in the bank-question authoring surface", async () => {
    const { container } = render(<TrainerApp initialTopics={[topic]} initialQuestions={[]} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("shows authoring controls and a topic-level empty state for no bank questions", () => {
    render(<TrainerApp initialTopics={[topic]} initialQuestions={[]} />);

    expect(screen.getByRole("heading", { name: /entrenador/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/tema/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/enunciado/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/respuesta correcta/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/explicacion/i)).toBeInTheDocument();
    expect(screen.getByText(/banco de preguntas vacio/i)).toBeInTheDocument();
  });

  it("lets a student edit a bank question manually", () => {
    render(<TrainerApp initialTopics={[topic]} initialQuestions={[question]} />);

    fireEvent.click(screen.getByRole("button", { name: /editar pregunta/i }));

    expect(screen.getByDisplayValue(question.prompt)).toBeInTheDocument();
    expect(screen.getByDisplayValue(question.correctAnswer)).toBeInTheDocument();
    expect(screen.getByDisplayValue(question.explanation)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /guardar cambios/i })).toBeInTheDocument();
  });

  it("shows immediate feedback and explanation before advancing, without timer controls", async () => {
    const submitAnswer = vi.fn().mockResolvedValue({
      isCorrect: false,
      explanation: question.explanation,
      review: {
        scheduleChanged: true,
        state: { nextReviewAt: "2026-07-07", intervalDays: 1, easeFactor: 2.3, repetitions: 0 },
      },
    });

    render(
      <TrainerApp
        initialTopics={[topic]}
        initialQuestions={[question]}
        initialSession={{
          id: "44444444-4444-4444-8444-444444444444",
          scopeType: "topic",
          scopeId: topic.id,
          questionIds: [question.id],
          currentIndex: 0,
          status: "active",
        }}
        onSubmitAnswer={submitAnswer}
      />,
    );

    expect(screen.queryByLabelText(/temporizador|cronometro/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(question.prompt)).toHaveLength(2);

    fireEvent.change(screen.getByLabelText(/tu respuesta/i), { target: { value: "Otra cosa" } });
    fireEvent.click(screen.getByRole("button", { name: /responder/i }));

    await waitFor(() => expect(submitAnswer).toHaveBeenCalled());
    expect(await screen.findByText(/incorrecto/i)).toBeInTheDocument();
    expect(screen.getByText(question.explanation)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continuar/i })).toBeInTheDocument();
  });
});
