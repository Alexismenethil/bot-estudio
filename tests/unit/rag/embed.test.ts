import { describe, expect, it, vi } from "vitest";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL_ID, embedTexts } from "@/lib/rag/embed";

function fakeVector(seed: number): number[] {
  return new Array(EMBEDDING_DIMENSIONS).fill(0).map((_, i) => (i === 0 ? seed : 0));
}

describe("embedTexts (research.md R3): embedding wrapper contract", () => {
  it("returns one 384-dim vector per input text, via the injected embedder", async () => {
    const stub = vi.fn(async (texts: string[]) => texts.map((_, i) => fakeVector(i)));

    const result = await embedTexts(["hola", "mundo"], stub);

    expect(result).toHaveLength(2);
    for (const vector of result) {
      expect(vector).toHaveLength(EMBEDDING_DIMENSIONS);
    }
  });

  it("batches calls to the injected embedder according to batchSize", async () => {
    const stub = vi.fn(async (texts: string[]) => texts.map((_, i) => fakeVector(i)));
    const texts = Array.from({ length: 10 }, (_, i) => `texto ${i}`);

    await embedTexts(texts, stub, 4);

    expect(stub).toHaveBeenCalledTimes(3);
    expect(stub.mock.calls[0]![0]).toHaveLength(4);
    expect(stub.mock.calls[1]![0]).toHaveLength(4);
    expect(stub.mock.calls[2]![0]).toHaveLength(2);
  });

  it("preserves input order across batches", async () => {
    const stub = vi.fn(async (texts: string[]) => texts.map((t) => fakeVector(t.length)));
    const texts = ["a", "bb", "ccc", "dddd", "e"];

    const result = await embedTexts(texts, stub, 2);

    expect(result.map((v) => v[0])).toEqual(texts.map((t) => t.length));
  });

  it("throws if the injected embedder returns a vector of the wrong dimensionality", async () => {
    const stub = vi.fn(async (texts: string[]) => texts.map(() => [1, 2, 3]));

    await expect(embedTexts(["hola"], stub)).rejects.toThrow();
  });

  it("exposes a single shared model id for both server and client entries", () => {
    expect(EMBEDDING_MODEL_ID).toBe("intfloat/multilingual-e5-small");
  });
});
