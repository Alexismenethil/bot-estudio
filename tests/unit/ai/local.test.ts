import { describe, expect, it, vi } from "vitest";
import { askLocal, selectModelId } from "@/lib/ai/local";
import { LocalEngineError } from "@/lib/ai/types";
import type { LocalEngineDeps } from "@/lib/ai/local";

function baseDeps(overrides: Partial<LocalEngineDeps> = {}): LocalEngineDeps {
  return {
    hasWebGPU: () => true,
    deviceMemoryGB: () => 8,
    isOnline: () => true,
    hasCachedWeights: vi.fn(async () => true),
    loadModel: vi.fn(async () => async (_prompt: string) => "fake output"),
    generate: vi.fn(async () => ({ answer: "respuesta local", citations: [] })),
    ...overrides,
  };
}

async function expectFailureClass(deps: LocalEngineDeps, failureClass: string) {
  try {
    await askLocal("pregunta", [], deps);
    throw new Error("expected askLocal to throw");
  } catch (error) {
    expect(error).toBeInstanceOf(LocalEngineError);
    expect((error as LocalEngineError).failureClass).toBe(failureClass);
  }
}

describe("askLocal (research.md R2, R4): WebGPU local engine failure taxonomy", () => {
  it("throws unsupported when navigator.gpu is absent", async () => {
    await expectFailureClass(baseDeps({ hasWebGPU: () => false }), "unsupported");
  });

  it("throws oom when model init runs out of memory", async () => {
    await expectFailureClass(
      baseDeps({
        loadModel: vi.fn(async () => {
          throw new Error("Out of memory allocating buffer");
        }),
      }),
      "oom",
    );
  });

  it("throws not_cached when offline and weights aren't in Cache Storage", async () => {
    await expectFailureClass(
      baseDeps({ isOnline: () => false, hasCachedWeights: vi.fn(async () => false) }),
      "not_cached",
    );
  });

  it("does not require cached weights when online", async () => {
    const hasCachedWeights = vi.fn(async () => false);
    const deps = baseDeps({ isOnline: () => true, hasCachedWeights });
    const result = await askLocal("pregunta", [], deps);
    expect(result.answer).toBe("respuesta local");
  });

  it("throws inference_error when generation crashes", async () => {
    await expectFailureClass(
      baseDeps({
        generate: vi.fn(async () => {
          throw new Error("something crashed");
        }),
      }),
      "inference_error",
    );
  });

  it("returns the generated answer on success", async () => {
    const deps = baseDeps();
    const result = await askLocal("pregunta", [], deps);
    expect(result).toEqual({ answer: "respuesta local", citations: [] });
  });
});

describe("selectModelId (research.md R4): two-profile model selection", () => {
  it("selects the high-memory profile when WebGPU is available and deviceMemory >= 6GB", () => {
    expect(selectModelId(true, 8)).toMatch(/phi-3-mini/i);
  });

  it("selects the low-memory profile when deviceMemory is below 6GB", () => {
    expect(selectModelId(true, 4)).toMatch(/qwen2\.5-1\.5b/i);
  });

  it("selects the low-memory profile when deviceMemory is unknown", () => {
    expect(selectModelId(true, undefined)).toMatch(/qwen2\.5-1\.5b/i);
  });
});
