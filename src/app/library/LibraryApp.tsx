"use client";

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { AssistantOverlay, type AssistantMessage } from "@/components/AssistantOverlay";
import { PdfViewer, type LibraryDocument } from "@/components/PdfViewer";

type LibraryTab = "upload" | "viewer" | "assistant";

interface LibraryAppProps {
  initialDocument?: LibraryDocument;
  initialMessages?: AssistantMessage[];
}

const tabs: { id: LibraryTab; label: string; shortLabel: string }[] = [
  { id: "upload", label: "Subir Archivo", shortLabel: "Subir" },
  { id: "viewer", label: "Ver Contenido", shortLabel: "Ver" },
  { id: "assistant", label: "Hablar con Asistente", shortLabel: "Asistente" },
];

function apiUrl(path: string) {
  if (typeof window === "undefined") {
    return `http://localhost${path}`;
  }
  const base = window.location.origin === "null" ? "http://localhost" : window.location.origin;
  return new URL(path, base).toString();
}

export function LibraryApp({ initialDocument, initialMessages = [] }: LibraryAppProps) {
  const [document, setDocument] = useState<LibraryDocument | undefined>(initialDocument);
  const [activeTab, setActiveTab] = useState<LibraryTab>(initialDocument ? "viewer" : "upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const documentId = params.get("documentId");
    if (!documentId || initialDocument) {
      return;
    }

    let cancelled = false;
    async function loadDocument() {
      const response = await fetch(apiUrl(`/api/documents/${documentId}`)).catch(() => null);
      if (!response?.ok || cancelled) {
        return;
      }
      const loaded = (await response.json()) as {
        id: string;
        title: string;
        blobUrl: string;
        pageCount: number;
        status: LibraryDocument["status"];
      };
      setDocument(loaded);
      setActiveTab("viewer");
    }

    void loadDocument();
    return () => {
      cancelled = true;
    };
  }, [initialDocument]);

  const canUseDocument = document && document.status !== "failed";
  const assistantOpen = activeTab === "assistant" && Boolean(canUseDocument);

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.target.files?.[0] ?? null);
  }

  function openLocalDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile) {
      return;
    }

    setDocument({
      id: crypto.randomUUID(),
      title: selectedFile.name,
      blobUrl: URL.createObjectURL(selectedFile),
      pageCount: 10,
      status: "ready",
    });
    setPage(1);
    setActiveTab("viewer");
  }

  const tabPanelId = useMemo(() => `library-${activeTab}-panel`, [activeTab]);

  return (
    <main className="min-h-dvh bg-[#f7f4ef] px-4 py-6 pb-28 text-slate-950 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <div id={tabPanelId}>
          {canUseDocument ? (
            <div
              className={assistantOpen ? "blur-sm" : undefined}
              aria-hidden={assistantOpen ? "true" : undefined}
              inert={assistantOpen ? true : undefined}
            >
              <PdfViewer document={document} page={page} onPageChange={setPage} />
            </div>
          ) : (
            <section className="grid min-h-[calc(100dvh-8rem)] place-items-center rounded-[8px] bg-white px-6 text-center shadow-sm">
              <div className="w-full max-w-md">
                <p className="mx-auto grid size-12 place-items-center rounded-full bg-blue-50 text-sm font-semibold text-blue-700">
                  PDF
                </p>
                <h1 className="mt-5 text-2xl font-semibold text-slate-950">Biblioteca sin documentos</h1>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  Sube un PDF para abrir el visor y conversar con el asistente con citas por pagina.
                </p>
                <form onSubmit={openLocalDocument} className="mt-7 flex flex-col gap-4 text-left">
                  <label htmlFor="library-file" className="text-sm font-medium text-slate-700">
                    Selecciona un PDF
                  </label>
                  <input
                    id="library-file"
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={chooseFile}
                    className="rounded-[8px] border border-slate-200 px-3 py-2 text-sm"
                  />
                  <button
                    type="submit"
                    disabled={!selectedFile}
                    className="rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    Abrir visor
                  </button>
                </form>
              </div>
            </section>
          )}
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-5 z-30 flex justify-center px-3">
        <div role="tablist" aria-label="Biblioteca PDF" className="flex max-w-full gap-1 rounded-full border border-slate-100 bg-white/95 p-2 shadow-[0_18px_45px_rgba(15,23,42,0.16)] backdrop-blur">
          {tabs.map((tab) => {
            const selected = activeTab === tab.id;
            const disabled = tab.id !== "upload" && !canUseDocument;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected ? "true" : "false"}
                aria-controls={tabPanelId}
                disabled={disabled}
                onClick={() => setActiveTab(tab.id)}
                className={`min-h-12 rounded-full px-4 text-sm font-semibold transition sm:px-6 ${
                  selected
                    ? "bg-blue-100 text-blue-950 ring-1 ring-blue-200"
                    : "text-slate-800 hover:bg-slate-50 disabled:opacity-35"
                }`}
              >
                <span
                  className="hidden sm:inline"
                  style={{ color: "#020617", fontSize: "19px", fontWeight: 700, lineHeight: 1.2 }}
                >
                  {tab.label}
                </span>
                <span
                  className="sm:hidden"
                  style={{ color: "#020617", fontSize: "19px", fontWeight: 700, lineHeight: 1.2 }}
                >
                  {tab.shortLabel}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {canUseDocument && (
        <AssistantOverlay
          document={document}
          open={assistantOpen}
          initialMessages={initialMessages}
          onClose={() => setActiveTab("viewer")}
          onCitationSelect={(citationPage) => {
            setPage(citationPage);
            setActiveTab("assistant");
          }}
        />
      )}
    </main>
  );
}
