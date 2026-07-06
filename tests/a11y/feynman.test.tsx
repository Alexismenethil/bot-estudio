import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { FeynmanApp } from "@/app/feynman/FeynmanApp";

const topic = {
  id: "22222222-2222-4222-8222-222222222222",
  courseId: "11111111-1111-4111-8111-111111111111",
  name: "Feynman",
  courseCode: "IS-481",
};

const evaluation = {
  correctPoints: ["Identifica el objetivo del patron AAA."],
  missingPoints: ["Falta conectar la idea con un ejemplo propio."],
  wrongPoints: [],
  reviewSuggestions: ["Reescribe la explicacion con una analogia corta."],
  citations: [{ documentId: "33333333-3333-4333-8333-333333333333", page: 2 }],
};

describe("US5 Feynman UI [FR-022..FR-025, FR-030, FR-028, US5-AC1..5]", () => {
  it("has no WCAG violations in the explanation surface", async () => {
    const { container } = render(<FeynmanApp initialTopics={[topic]} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("renders topic selection, explanation editor, and a 20k character guard", () => {
    render(<FeynmanApp initialTopics={[topic]} />);

    expect(screen.getByRole("heading", { name: /modo feynman/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/tema/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tu explicacion/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/tu explicacion/i), { target: { value: "x".repeat(20_001) } });

    expect(screen.getByText(/maximo 20000 caracteres/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /evaluar explicacion/i })).toBeDisabled();
  });

  it("submits an explanation and renders structured feedback with engine disclosure", async () => {
    const submitExplanation = vi.fn().mockResolvedValue({ engine: "gemini", evaluation });
    render(<FeynmanApp initialTopics={[topic]} onSubmitExplanation={submitExplanation} />);

    fireEvent.change(screen.getByLabelText(/tu explicacion/i), {
      target: { value: "AAA separa preparar, ejecutar y verificar." },
    });
    fireEvent.click(screen.getByRole("button", { name: /evaluar explicacion/i }));

    await waitFor(() => expect(submitExplanation).toHaveBeenCalled());
    expect(await screen.findByText(/motor: gemini/i)).toBeInTheDocument();
    expect(screen.getByText(/identifica el objetivo/i)).toBeInTheDocument();
    expect(screen.getByText(/falta conectar/i)).toBeInTheDocument();
    expect(screen.getByText(/pag\. 2/i)).toBeInTheDocument();
  });

  it("preserves the explanation when double failure leaves the submission pending_retry", () => {
    render(
      <FeynmanApp
        initialTopics={[topic]}
        initialExplanation="Mi explicacion queda guardada para reintentar."
        initialStatus="unavailable"
      />,
    );

    expect(screen.getByLabelText(/tu explicacion/i)).toHaveValue(
      "Mi explicacion queda guardada para reintentar.",
    );
    expect(screen.getByRole("status")).toHaveTextContent(/intenta de nuevo mas tarde/i);
  });
});
