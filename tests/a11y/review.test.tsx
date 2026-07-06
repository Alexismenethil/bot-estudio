import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { CoursesApp } from "@/app/courses/CoursesApp";
import { HomeDashboard } from "@/app/HomeDashboard";
import { ReviewApp } from "@/app/review/ReviewApp";

const course = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "IS-481",
  name: "Software QA",
};

const topic = {
  id: "22222222-2222-4222-8222-222222222222",
  courseId: course.id,
  name: "SM-2",
};

const dueItem = {
  itemType: "flashcard" as const,
  itemId: "33333333-3333-4333-8333-333333333333",
  topicId: topic.id,
  topicName: topic.name,
  courseId: course.id,
  courseCode: course.code,
  courseName: course.name,
  nextReviewAt: "2026-07-06",
  intervalDays: 0,
  easeFactor: 2.5,
  repetitions: 0,
  front: "¿Que exige TDD?",
  back: "Pruebas primero.",
};

describe("US2 UI [FR-009, FR-010, FR-014, FR-028, US2-AC5, SC-007]", () => {
  it("has no WCAG violations in the course/topic management surface", async () => {
    const { container } = render(<CoursesApp initialCourses={[course]} initialTopics={[topic]} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("shows course/topic creation controls and a no-flashcards empty state", () => {
    render(<CoursesApp initialCourses={[course]} initialTopics={[topic]} />);

    expect(screen.getByRole("heading", { name: /cursos y temas/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/codigo del curso/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/nombre del tema/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/frente de la flashcard/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/reverso de la flashcard/i)).toBeInTheDocument();
    expect(screen.getByText(/aun no hay flashcards/i)).toBeInTheDocument();
  });

  it("has no WCAG violations in the review flow", async () => {
    const { container } = render(<ReviewApp initialItems={[dueItem]} today="2026-07-06" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("reveals a card and offers correct/incorrect/hard review outcomes", () => {
    const submitAnswer = vi.fn();
    render(<ReviewApp initialItems={[dueItem]} today="2026-07-06" onSubmitAnswer={submitAnswer} />);

    expect(screen.getByText("¿Que exige TDD?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /revelar respuesta/i }));
    expect(screen.getByText("Pruebas primero.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /marcar correcto/i }));
    expect(submitAnswer).toHaveBeenCalledWith({
      itemType: "flashcard",
      itemId: dueItem.itemId,
      outcome: "correct",
      context: "review",
      today: "2026-07-06",
    });
  });

  it("renders dashboard counts and the empty due state", async () => {
    const { container, rerender } = render(
      <HomeDashboard
        dueToday={{
          items: [dueItem],
          counts: {
            total: 1,
            byType: { flashcard: 1, bankQuestion: 0 },
            byCourse: [{ courseId: course.id, courseCode: course.code, courseName: course.name, dueCount: 1, flashcards: 1, bankQuestions: 0 }],
            byTopic: [{ topicId: topic.id, topicName: topic.name, courseId: course.id, courseCode: course.code, dueCount: 1, flashcards: 1, bankQuestions: 0 }],
          },
        }}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
    expect(screen.getByLabelText(/total vencido: 1/i)).toBeInTheDocument();
    expect(screen.getByText(/flashcards/i)).toBeInTheDocument();

    rerender(<HomeDashboard dueToday={{ items: [], counts: { total: 0, byType: { flashcard: 0, bankQuestion: 0 }, byCourse: [], byTopic: [] } }} />);
    expect(screen.getByText(/nada pendiente/i)).toBeInTheDocument();
  });
});
