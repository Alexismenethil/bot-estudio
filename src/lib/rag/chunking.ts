export interface DocumentPage {
  pageNumber: number;
  text: string;
}

export interface DocumentChunk {
  pageNumber: number;
  chunkIndex: number;
  content: string;
}

// ~400 tokens per chunk approximated as a word count (~0.75 words/token for
// Spanish/English prose) — never spans pages, since the page_number is the
// citation source of truth (research.md R5, data-model.md).
const DEFAULT_MAX_WORDS_PER_CHUNK = 300;

export function chunkDocument(
  pages: DocumentPage[],
  maxWordsPerChunk: number = DEFAULT_MAX_WORDS_PER_CHUNK,
): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  let chunkIndex = 0;

  for (const page of pages) {
    const words = page.text.split(/\s+/).filter((word) => word.length > 0);

    for (let start = 0; start < words.length; start += maxWordsPerChunk) {
      const content = words.slice(start, start + maxWordsPerChunk).join(" ");
      chunks.push({ pageNumber: page.pageNumber, chunkIndex, content });
      chunkIndex += 1;
    }
  }

  return chunks;
}
