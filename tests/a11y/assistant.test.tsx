import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { axe } from "vitest-axe";
import { AssistantOverlay } from "@/components/AssistantOverlay";
import { LibraryApp } from "@/app/library/LibraryApp";

const readyDocument = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "tesis_anemia.pdf",
  blobUrl: "https://blob.example/tesis.pdf",
  pageCount: 3,
  status: "ready" as const,
};

const citedAssistantMessage = {
  id: "m1",
  role: "assistant" as const,
  content: "La respuesta esta en la pagina 2.",
  status: "ok" as const,
  engine: "gemini" as const,
  citations: [{ page: 2, chunkId: "22222222-2222-4222-8222-222222222222" }],
};

describe("Assistant overlay [US1-AC3, US1-AC5, US1-AC7, US1-AC8, FR-028]", () => {
  it("has no WCAG violations when open over the viewer", async () => {
    const { container } = render(
      <AssistantOverlay
        document={readyDocument}
        open
        initialMessages={[citedAssistantMessage]}
        onClose={() => undefined}
        onCitationSelect={() => undefined}
      />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });

  it("opens as a dialog over the viewer without replacing the viewer route", () => {
    render(<LibraryApp initialDocument={readyDocument} />);

    fireEvent.click(screen.getByRole("tab", { name: /hablar con asistente/i }));

    expect(screen.getByRole("dialog", { name: /tutorpdf/i })).toBeInTheDocument();
    expect(screen.getByText("Pagina 1 de 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cerrar asistente/i })).toBeInTheDocument();
  });

  it("jumps the viewer to the cited page when a citation chip is tapped", async () => {
    render(<LibraryApp initialDocument={readyDocument} initialMessages={[citedAssistantMessage]} />);

    fireEvent.click(screen.getByRole("tab", { name: /hablar con asistente/i }));
    fireEvent.click(screen.getByRole("button", { name: /ir a pagina 2/i }));

    await waitFor(() => expect(screen.getByText("Pagina 2 de 3")).toBeInTheDocument());
  });

  it("shows engine disclosure and a preserved retry state for FR-030", () => {
    const retry = vi.fn();

    render(
      <AssistantOverlay
        document={readyDocument}
        open
        initialMessages={[
          {
            id: "m2",
            role: "user",
            content: "pregunta sin responder",
            status: "pending_retry",
          },
        ]}
        onClose={() => undefined}
        onCitationSelect={() => undefined}
        onRetryPendingQuestion={retry}
      />,
    );

    expect(screen.getByText(/temporalmente no disponible/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /reintentar pregunta/i }));
    expect(retry).toHaveBeenCalledWith("pregunta sin responder");
  });
});
