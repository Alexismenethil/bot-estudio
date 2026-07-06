export interface FeynmanCitation {
  documentId: string;
  page: number;
}

export interface FeynmanEvaluation {
  correctPoints: string[];
  missingPoints: string[];
  wrongPoints: string[];
  reviewSuggestions: string[];
  citations: FeynmanCitation[];
}

export interface FeynmanGroundingChunk {
  chunkId: string;
  documentId: string;
  pageNumber: number;
  content: string;
}

export type NormalizedFeynmanEvaluation =
  | { evaluation: FeynmanEvaluation }
  | { error: "invalid_response" };

type EvaluationRecord = Record<string, unknown>;

function parseRaw(raw: unknown): unknown {
  if (typeof raw !== "string") {
    return raw;
  }

  if (!raw.trim()) {
    return null;
  }

  return JSON.parse(raw) as unknown;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function normalizeCitations(value: unknown): FeynmanCitation[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.flatMap((citation) => {
    if (citation === null || typeof citation !== "object") {
      return [];
    }

    const entry = citation as EvaluationRecord;
    if (typeof entry.documentId !== "string" || entry.documentId.trim().length === 0) {
      return [];
    }

    const page = entry.page;
    if (!Number.isInteger(page) || typeof page !== "number" || page <= 0) {
      return [];
    }

    return [{ documentId: entry.documentId, page }];
  });
}

export function normalizeEvaluation(raw: unknown): NormalizedFeynmanEvaluation {
  try {
    const parsed = parseRaw(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { error: "invalid_response" };
    }

    const record = parsed as EvaluationRecord;
    const citations = normalizeCitations(record.citations);
    if (
      !isStringArray(record.correctPoints) ||
      !isStringArray(record.missingPoints) ||
      !isStringArray(record.wrongPoints) ||
      !isStringArray(record.reviewSuggestions) ||
      citations === null
    ) {
      return { error: "invalid_response" };
    }

    return {
      evaluation: {
        correctPoints: record.correctPoints,
        missingPoints: record.missingPoints,
        wrongPoints: record.wrongPoints,
        reviewSuggestions: record.reviewSuggestions,
        citations,
      },
    };
  } catch {
    return { error: "invalid_response" };
  }
}

export function filterEvaluationCitations(
  evaluation: FeynmanEvaluation,
  chunks: FeynmanGroundingChunk[],
): FeynmanEvaluation {
  const validCitations = new Set(chunks.map((chunk) => `${chunk.documentId}:${chunk.pageNumber}`));
  return {
    ...evaluation,
    citations: evaluation.citations.filter((citation) =>
      validCitations.has(`${citation.documentId}:${citation.page}`),
    ),
  };
}
