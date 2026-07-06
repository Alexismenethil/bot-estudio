import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { LibraryApp } from "@/app/library/LibraryApp";
import { PdfViewer } from "@/components/PdfViewer";

const readyDocument = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "tesis_anemia.pdf",
  blobUrl: "https://blob.example/tesis.pdf",
  pageCount: 3,
  status: "ready" as const,
};

describe("Library viewer UI [FR-002, US1-AC2, FR-028]", () => {
  it("has no WCAG violations for the TutorPDF-style viewer surface", async () => {
    const { container } = render(<LibraryApp initialDocument={readyDocument} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("shows an accessible empty state for a topic with no documents yet", () => {
    render(<LibraryApp />);

    expect(screen.getByRole("heading", { name: /biblioteca sin documentos/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/selecciona un pdf/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /abrir visor/i })).toBeDisabled();
  });

  it("renders the Subir/Ver/Asistente bottom tabs with the viewer tab selected", () => {
    render(<LibraryApp initialDocument={readyDocument} />);

    expect(screen.getByRole("tab", { name: /subir archivo/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /ver contenido/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /hablar con asistente/i })).toBeInTheDocument();
  });

  it("keeps page navigation and zoom controls keyboard-addressable", () => {
    render(<PdfViewer document={readyDocument} initialPage={2} />);

    expect(screen.getByText("Pagina 2 de 3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /pagina siguiente/i }));
    expect(screen.getByText("Pagina 3 de 3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /aumentar zoom/i }));
    expect(screen.getByText("110%")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /reducir zoom/i }));
    expect(screen.getByText("100%")).toBeInTheDocument();
  });
});
