import { describe, expect, it } from "vitest";
import { retrieveLocalChunks } from "@/lib/rag/local-retrieve";
import type { CachedChunk } from "@/lib/rag/local-retrieve";

function chunk(chunkId: string, pageNumber: number, embedding: number[]): CachedChunk {
  return { chunkId, pageNumber, content: `contenido ${chunkId}`, embedding };
}

describe("retrieveLocalChunks (research.md R1-B): client-side cosine top-k", () => {
  it("ranks cached chunks by cosine similarity to the query embedding, best first", () => {
    const chunks: CachedChunk[] = [
      chunk("far", 1, [0, 1, 0]),
      chunk("exact", 2, [1, 0, 0]),
      chunk("close", 3, [0.9, 0.1, 0]),
    ];

    const result = retrieveLocalChunks(chunks, [1, 0, 0], 3);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.chunks.map((c) => c.chunkId)).toEqual(["exact", "close", "far"]);
    }
  });

  it("limits results to topK", () => {
    const chunks = Array.from({ length: 10 }, (_, i) => chunk(`c${i}`, i + 1, [1, i, 0]));
    const result = retrieveLocalChunks(chunks, [1, 0, 0], 6);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.chunks).toHaveLength(6);
    }
  });

  it("preserves pageNumber and content on returned chunks", () => {
    const chunks = [chunk("a", 4, [1, 0])];
    const result = retrieveLocalChunks(chunks, [1, 0], 6);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.chunks[0]).toMatchObject({ chunkId: "a", pageNumber: 4, content: "contenido a" });
    }
  });

  it("returns a retrieval-failure signal when the cache is empty (insufficient cache)", () => {
    const result = retrieveLocalChunks([], [1, 0, 0], 6);
    expect(result).toEqual({ ok: false, reason: "insufficient_cache" });
  });
});
