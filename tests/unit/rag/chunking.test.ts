import { describe, expect, it } from "vitest";
import { chunkDocument } from "@/lib/rag/chunking";

function words(count: number, prefix = "palabra"): string {
  return Array.from({ length: count }, (_, i) => `${prefix}${i}`).join(" ");
}

describe("chunkDocument (US1-AC1): page-aware, ~400-token chunking", () => {
  it("produces one chunk for a short page and preserves its page_number", () => {
    const chunks = chunkDocument([{ pageNumber: 3, text: "hola mundo" }], 300);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ pageNumber: 3, chunkIndex: 0, content: "hola mundo" });
  });

  it("splits a long page into multiple chunks, none exceeding the max word count", () => {
    const longPageText = words(700);
    const chunks = chunkDocument([{ pageNumber: 1, text: longPageText }], 300);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      const wordCount = chunk.content.split(/\s+/).filter(Boolean).length;
      expect(wordCount).toBeLessThanOrEqual(300);
    }
  });

  it("never lets a chunk span two pages", () => {
    const chunks = chunkDocument(
      [
        { pageNumber: 1, text: words(50, "p1w") },
        { pageNumber: 2, text: words(50, "p2w") },
      ],
      300,
    );

    for (const chunk of chunks) {
      const belongsToPageOne = chunk.content.includes("p1w0");
      const belongsToPageTwo = chunk.content.includes("p2w0");
      expect(belongsToPageOne && belongsToPageTwo).toBe(false);
    }
  });

  it("assigns sequential chunk_index across the whole document, not reset per page", () => {
    const chunks = chunkDocument(
      [
        { pageNumber: 1, text: words(700) },
        { pageNumber: 2, text: words(700) },
      ],
      300,
    );

    const indices = chunks.map((c) => c.chunkIndex);
    expect(indices).toEqual(indices.map((_, i) => i));
  });

  it("produces no chunks for a blank page", () => {
    const chunks = chunkDocument(
      [
        { pageNumber: 1, text: "   " },
        { pageNumber: 2, text: "contenido real" },
      ],
      300,
    );

    expect(chunks.every((c) => c.pageNumber !== 1)).toBe(true);
    expect(chunks).toHaveLength(1);
  });
});
