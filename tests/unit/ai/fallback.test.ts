import { describe, expect, it, vi } from "vitest";
import { askWithFallback, nextChainState } from "@/lib/ai/fallback";
import { LocalEngineError } from "@/lib/ai/types";
import type { GeminiFailureClass, LocalFailureClass } from "@/lib/ai/types";

const GEMINI_FAILURE_CLASSES: GeminiFailureClass[] = ["timeout", "quota", "network", "invalid_response"];
const LOCAL_FAILURE_CLASSES: LocalFailureClass[] = ["unsupported", "oom", "not_cached", "inference_error"];

describe("nextChainState (pure reducer)", () => {
  it.each(GEMINI_FAILURE_CLASSES)("routes any Gemini failure class (%s) to try_local", (failureClass) => {
    expect(nextChainState({ type: "gemini_failure", failureClass })).toBe("try_local");
  });

  it.each(LOCAL_FAILURE_CLASSES)("routes any local failure class (%s) to unavailable", (failureClass) => {
    expect(nextChainState({ type: "local_failure", failureClass })).toBe("unavailable");
  });
});

describe("askWithFallback [FR-008, FR-030, US1-AC7, US1-AC8]", () => {
  it("returns the Gemini result and discloses engine:'gemini' when Gemini succeeds", async () => {
    const log = vi.fn();
    const gemini = vi.fn(async () => "gemini answer");
    const local = vi.fn(async () => "local answer");

    const result = await askWithFallback(gemini, local, log);

    expect(result).toEqual({ ok: true, value: "gemini answer", engine: "gemini" });
    expect(local).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ engine: "gemini", expectedDegradation: false }),
    );
  });

  it.each(GEMINI_FAILURE_CLASSES)(
    "falls back to local and discloses engine:'local' when Gemini fails with %s",
    async (failureClass) => {
      const log = vi.fn();
      const geminiError = Object.assign(new Error("boom"), { __failureClass: failureClass });
      const gemini = vi.fn(async () => {
        throw failureClass === "timeout"
          ? new DOMException("aborted", "AbortError")
          : failureClass === "quota"
            ? Object.assign(new Error("quota"), { status: 429 })
            : failureClass === "network"
              ? new TypeError("fetch failed")
              : geminiError;
      });
      const local = vi.fn(async () => "local answer");

      const result = await askWithFallback(gemini, local, log);

      expect(local).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ ok: true, value: "local answer", engine: "local" });
      expect(log).toHaveBeenCalledTimes(2);
      expect(log).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ engine: "gemini", failureClass, expectedDegradation: true }),
      );
      expect(log).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ engine: "local", expectedDegradation: true }),
      );
    },
  );

  it.each(LOCAL_FAILURE_CLASSES)(
    "returns {ok:false, state:'unavailable'} when Gemini and local both fail (local: %s)",
    async (localFailureClass) => {
      const log = vi.fn();
      const gemini = vi.fn(async () => {
        throw new TypeError("fetch failed");
      });
      const local = vi.fn(async () => {
        throw new LocalEngineError(localFailureClass);
      });

      const result = await askWithFallback(gemini, local, log);

      expect(result).toEqual({ ok: false, state: "unavailable" });
      expect(log).toHaveBeenCalledTimes(2);
      expect(log).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ engine: "local", failureClass: localFailureClass, expectedDegradation: false }),
      );
    },
  );

  it("never throws — double failure resolves, it does not reject", async () => {
    const gemini = vi.fn(async () => {
      throw new Error("network down");
    });
    const local = vi.fn(async () => {
      throw new LocalEngineError("oom");
    });

    await expect(askWithFallback(gemini, local, vi.fn())).resolves.toEqual({
      ok: false,
      state: "unavailable",
    });
  });
});
