import { pipeline } from "@huggingface/transformers";

// Single embedding model shared by every call site — server ingestion, server
// query embedding, and the client-side offline path (research.md R3). Must
// never be Gemini: retrieval must survive a Gemini outage (FR-008).
export const EMBEDDING_MODEL_ID = "intfloat/multilingual-e5-small";
export const EMBEDDING_DIMENSIONS = 384;

export type Embedder = (texts: string[]) => Promise<number[][]>;

const DEFAULT_BATCH_SIZE = 32;

export async function embedTexts(
  texts: string[],
  embedder: Embedder,
  batchSize: number = DEFAULT_BATCH_SIZE,
): Promise<number[][]> {
  const results: number[][] = [];

  for (let start = 0; start < texts.length; start += batchSize) {
    const batch = texts.slice(start, start + batchSize);
    const embeddings = await embedder(batch);

    for (const vector of embeddings) {
      if (vector.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(
          `Embedder returned a ${vector.length}-dim vector, expected ${EMBEDDING_DIMENSIONS}`,
        );
      }
    }

    results.push(...embeddings);
  }

  return results;
}

// Lazily loads the shared transformers.js pipeline (Node or browser — same
// package, same model id) so importing this module never triggers a model
// download by itself.
export function createTransformersEmbedder(): Embedder {
  let extractor: Awaited<ReturnType<typeof pipeline<"feature-extraction">>> | null = null;

  return async (texts: string[]) => {
    if (!extractor) {
      extractor = await pipeline("feature-extraction", EMBEDDING_MODEL_ID);
    }
    const output = await extractor(texts, { pooling: "mean", normalize: true });
    return output.tolist();
  };
}
