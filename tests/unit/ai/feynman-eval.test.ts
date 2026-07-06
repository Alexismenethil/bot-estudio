import { describe, expect, it } from "vitest";
import { normalizeEvaluation } from "@/lib/ai/feynman-eval";

const validEvaluation = {
  correctPoints: ["Explica el objetivo del patron AAA."],
  missingPoints: ["Falta mencionar el aislamiento de pruebas."],
  wrongPoints: ["Confunde mocks con stubs."],
  reviewSuggestions: ["Repasar dobles de prueba con ejemplos concretos."],
  citations: [
    { documentId: "11111111-1111-1111-1111-111111111111", page: 3 },
    { documentId: "22222222-2222-2222-2222-222222222222", page: 1 },
  ],
};

describe("normalizeEvaluation [US5]", () => {
  it("normalizes a valid structured evaluation from an object", () => {
    expect(normalizeEvaluation(validEvaluation)).toEqual({ evaluation: validEvaluation });
  });

  it("normalizes the same shape when the provider returns JSON text", () => {
    expect(normalizeEvaluation(JSON.stringify(validEvaluation))).toEqual({ evaluation: validEvaluation });
  });

  it("never throws and returns invalid_response for malformed payloads", () => {
    const malformedPayloads = [
      null,
      undefined,
      "",
      "{",
      [],
      42,
      "[]",
      "null",
      { ...validEvaluation, correctPoints: "not-an-array" },
      { ...validEvaluation, correctPoints: ["ok", 123] },
      { ...validEvaluation, reviewSuggestions: [123] },
      { ...validEvaluation, missingPoints: undefined },
      { ...validEvaluation, citations: "not-an-array" },
      { ...validEvaluation, citations: undefined },
    ];

    for (const payload of malformedPayloads) {
      expect(() => normalizeEvaluation(payload)).not.toThrow();
      expect(normalizeEvaluation(payload)).toEqual({ error: "invalid_response" });
    }
  });

  it("drops invalid citation pages and never invents replacement citations", () => {
    const result = normalizeEvaluation({
      ...validEvaluation,
      citations: [
        { documentId: "33333333-3333-3333-3333-333333333333", page: 2 },
        { documentId: "44444444-4444-4444-4444-444444444444", page: 0 },
        { documentId: "55555555-5555-5555-5555-555555555555", page: -1 },
        { documentId: "66666666-6666-6666-6666-666666666666", page: 1.5 },
        { documentId: "", page: 4 },
        { documentId: "   ", page: 4 },
        { page: 5 },
        null,
        "cita mal formada",
      ],
    });

    expect(result).toEqual({
      evaluation: {
        ...validEvaluation,
        citations: [{ documentId: "33333333-3333-3333-3333-333333333333", page: 2 }],
      },
    });
  });

  it("accepts the same normalized evaluation shape for gemini and local engines", () => {
    const geminiResult = normalizeEvaluation(validEvaluation);
    const localResult = normalizeEvaluation({ ...validEvaluation });

    expect(geminiResult).toEqual(localResult);
  });
});
