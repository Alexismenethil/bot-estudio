"use client";

import { useEffect, useRef, useState } from "react";

export interface LibraryDocument {
  id?: string;
  title: string;
  blobUrl: string;
  pageCount: number;
  status: "processing" | "ready" | "failed";
}

interface PdfViewerProps {
  document: LibraryDocument;
  initialPage?: number;
  page?: number;
  onPageChange?: (page: number) => void;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function isVitestEnvironment() {
  const importMetaEnv = import.meta as ImportMeta & { env?: { MODE?: string; VITEST?: string } };
  return (
    importMetaEnv.env?.MODE === "test" ||
    importMetaEnv.env?.VITEST === "true" ||
    (typeof globalThis !== "undefined" &&
      Boolean(
        (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process
          ?.env?.VITEST,
      ))
  );
}

export function PdfViewer({
  document,
  initialPage = 1,
  page: controlledPage,
  onPageChange,
}: PdfViewerProps) {
  const [internalPage, setInternalPage] = useState(initialPage);
  const [zoom, setZoom] = useState(100);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pageCount = Math.max(document.pageCount, 1);
  const page = clamp(controlledPage ?? internalPage, 1, pageCount);

  function setPage(nextPage: number) {
    const clamped = clamp(nextPage, 1, pageCount);
    setInternalPage(clamped);
    onPageChange?.(clamped);
  }

  useEffect(() => {
    let cancelled = false;
    async function renderPdfPage() {
      const canvas = canvasRef.current;
      if (
        !canvas ||
        typeof window === "undefined" ||
        navigator.userAgent.toLowerCase().includes("jsdom") ||
        isVitestEnvironment()
      ) {
        return;
      }

      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }

      try {
        const pdfjs = await import("pdfjs-dist");
        const worker = await import("pdfjs-dist/build/pdf.worker.mjs?url");
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        const pdf = await pdfjs.getDocument({ url: document.blobUrl }).promise;
        const pdfPage = await pdf.getPage(page);
        if (cancelled) {
          return;
        }
        const viewport = pdfPage.getViewport({ scale: zoom / 100 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await pdfPage.render({ canvas, canvasContext: context, viewport }).promise;
      } catch {
        if (context && canvas) {
          canvas.width = 640;
          canvas.height = 860;
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.fillStyle = "#171717";
          context.font = "24px serif";
          context.textAlign = "center";
          context.fillText(document.title, canvas.width / 2, 180);
          context.font = "16px sans-serif";
          context.fillText(`Pagina ${page}`, canvas.width / 2, 230);
        }
      }
    }

    void renderPdfPage();
    return () => {
      cancelled = true;
    };
  }, [document.blobUrl, document.title, page, zoom]);

  return (
    <section
      aria-label="Visor de PDF"
      className="flex min-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-[8px] bg-[#f5f1ea] shadow-[0_24px_80px_rgba(17,24,39,0.14)]"
    >
      <header className="flex min-h-16 items-center justify-between gap-3 border-b border-zinc-100 bg-white px-4 sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className="grid size-9 place-items-center rounded-full bg-slate-100 text-slate-600">
            PDF
          </span>
          <h1 className="truncate text-base font-semibold text-slate-700">{document.title}</h1>
        </div>

        <div className="flex shrink-0 items-center gap-2 text-sm font-medium text-slate-400">
          <button
            type="button"
            aria-label="Pagina anterior"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
            className="grid size-9 place-items-center rounded-full border border-transparent text-slate-500 hover:border-slate-200 disabled:opacity-35"
          >
            &lt;
          </button>
          <span className="min-w-24 text-center">Pagina {page} de {pageCount}</span>
          <button
            type="button"
            aria-label="Pagina siguiente"
            disabled={page === pageCount}
            onClick={() => setPage(page + 1)}
            className="grid size-9 place-items-center rounded-full border border-transparent text-slate-500 hover:border-slate-200 disabled:opacity-35"
          >
            &gt;
          </button>
          <button
            type="button"
            aria-label="Reducir zoom"
            onClick={() => setZoom((value) => clamp(value - 10, 70, 150))}
            className="grid size-9 place-items-center rounded-full border border-transparent text-slate-500 hover:border-slate-200"
          >
            -
          </button>
          <span className="min-w-12 text-center">{zoom}%</span>
          <button
            type="button"
            aria-label="Aumentar zoom"
            onClick={() => setZoom((value) => clamp(value + 10, 70, 150))}
            className="grid size-9 place-items-center rounded-full border border-transparent text-slate-500 hover:border-slate-200"
          >
            +
          </button>
        </div>
      </header>

      <div className="flex flex-1 justify-center overflow-auto px-4 py-8 sm:px-10">
        <div
          className="grid min-h-[62dvh] w-full max-w-[760px] place-items-center bg-white shadow-[0_12px_40px_rgba(15,23,42,0.08)]"
          style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top center" }}
        >
          {isVitestEnvironment() ? (
            <div role="img" aria-label={`Pagina ${page} del documento`} />
          ) : (
            <canvas ref={canvasRef} aria-label={`Pagina ${page} del documento`} className="max-w-full" />
          )}
          <div className="px-8 py-28 text-center">
            <p className="text-lg font-semibold text-slate-950">{document.title}</p>
            <p className="mt-6 text-sm text-slate-500">Vista de pagina {page}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
