import { describe, expect, it } from "vitest";
import { classifyGeminiError } from "@/lib/ai/gemini";

describe("classifyGeminiError (Principle V: Gemini failure taxonomy)", () => {
  it("classifies an AbortError (AbortController timeout) as 'timeout'", () => {
    const error = new DOMException("The operation was aborted", "AbortError");
    expect(classifyGeminiError(error)).toBe("timeout");
  });

  it("classifies a 429 status error as 'quota'", () => {
    const error = Object.assign(new Error("Too Many Requests"), { status: 429 });
    expect(classifyGeminiError(error)).toBe("quota");
  });

  it("classifies a RESOURCE_EXHAUSTED error as 'quota'", () => {
    const error = new Error("9 RESOURCE_EXHAUSTED: Quota exceeded");
    expect(classifyGeminiError(error)).toBe("quota");
  });

  it("classifies a fetch TypeError (network failure) as 'network'", () => {
    const error = new TypeError("fetch failed");
    expect(classifyGeminiError(error)).toBe("network");
  });

  it("classifies a malformed/unexpected error as 'invalid_response'", () => {
    expect(classifyGeminiError(new SyntaxError("Unexpected token in JSON"))).toBe("invalid_response");
    expect(classifyGeminiError("not even an error object")).toBe("invalid_response");
    expect(classifyGeminiError(undefined)).toBe("invalid_response");
  });
});
