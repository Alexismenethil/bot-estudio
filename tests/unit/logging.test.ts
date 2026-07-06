import { afterEach, describe, expect, it, vi } from "vitest";
import { logEvent } from "@/lib/logging";

describe("logging: structured JSON logger (constitution Principle VIII)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits a single JSON line with boundary, expected_degradation and latency_ms", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    logEvent({
      boundary: "ai",
      message: "gemini call ok",
      expected_degradation: false,
      latency_ms: 120,
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(parsed.boundary).toBe("ai");
    expect(parsed.expected_degradation).toBe(false);
    expect(parsed.latency_ms).toBe(120);
    expect(typeof parsed.timestamp).toBe("string");
  });

  it("includes engine and failure_class for an expected AI fallback", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});

    logEvent({
      boundary: "ai",
      level: "warn",
      message: "gemini timeout, falling back to local",
      engine: "gemini",
      failure_class: "timeout",
      expected_degradation: true,
      latency_ms: 10000,
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(parsed.engine).toBe("gemini");
    expect(parsed.failure_class).toBe("timeout");
    expect(parsed.expected_degradation).toBe(true);
  });

  it("defaults to info level on console.log when level is omitted", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    logEvent({ boundary: "db", message: "query ok" });

    expect(spy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(parsed.level).toBe("info");
  });

  it("routes level='error' to console.error, distinct from expected_degradation warnings", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    logEvent({ boundary: "db", level: "error", message: "write failed" });

    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
