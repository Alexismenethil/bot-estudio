import type { RetrievedChunk } from "@/lib/ai/types";

export interface CachedChunk {
  chunkId: string;
  pageNumber: number;
  content: string;
  embedding: number[];
}

export type LocalRetrievalResult =
  | { ok: true; chunks: RetrievedChunk[] }
  | { ok: false; reason: "insufficient_cache" };

const DEFAULT_TOP_K = 6;

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! ** 2;
    normB += b[i]! ** 2;
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// research.md R1-B: client-side cosine top-k over the IndexedDB-cached
// chunks of the currently open document — brute-force is fast enough at a
// few-thousand-chunk scale, no index needed. An empty cache (nothing warmed
// for this document yet) is a retrieval failure, not zero relevant results.
export function retrieveLocalChunks(
  cachedChunks: CachedChunk[],
  queryEmbedding: number[],
  topK: number = DEFAULT_TOP_K,
): LocalRetrievalResult {
  if (cachedChunks.length === 0) {
    return { ok: false, reason: "insufficient_cache" };
  }

  const chunks = cachedChunks
    .map((chunk) => ({ chunk, score: cosineSimilarity(chunk.embedding, queryEmbedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ chunk }) => ({
      chunkId: chunk.chunkId,
      pageNumber: chunk.pageNumber,
      content: chunk.content,
    }));

  return { ok: true, chunks };
}

const DB_NAME = "bot-estudio-chunk-cache";
const STORE_NAME = "chunks";

function openCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "chunkId" });
        store.createIndex("documentId", "documentId");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Fetches the document's chunks (with embeddings) from the server and
// caches them in IndexedDB, so Scenario B (no backend connectivity, research
// R1-B) can still retrieve over whichever documents were previously opened.
export async function warmChunkCache(documentId: string): Promise<void> {
  const response = await fetch(`/api/documents/${documentId}/chunks`);
  const { chunks } = (await response.json()) as {
    chunks: { id: string; pageNumber: number; content: string; embedding: number[] }[];
  };

  const db = await openCacheDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      for (const chunk of chunks) {
        store.put({
          chunkId: chunk.id,
          documentId,
          pageNumber: chunk.pageNumber,
          content: chunk.content,
          embedding: chunk.embedding,
        });
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function getCachedChunks(documentId: string): Promise<CachedChunk[]> {
  const db = await openCacheDb();
  try {
    return await new Promise<CachedChunk[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const index = tx.objectStore(STORE_NAME).index("documentId");
      const request = index.getAll(documentId);
      request.onsuccess = () => resolve(request.result as CachedChunk[]);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
