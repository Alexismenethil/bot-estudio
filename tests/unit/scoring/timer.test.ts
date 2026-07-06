import { describe, expect, it } from "vitest";
import { isExpired, remainingMs } from "@/lib/scoring/timer";

describe("exam timer examples [FR-020, FR-029, US4-AC5, US4-AC6]", () => {
  it("clamps remaining time at zero and treats the deadline as expired", () => {
    const startedAt = Date.UTC(2026, 6, 6, 12, 0, 0);

    expect(remainingMs(startedAt, 120, startedAt + 30_000)).toBe(90_000);
    expect(remainingMs(startedAt, 120, startedAt + 120_000)).toBe(0);
    expect(remainingMs(startedAt, 120, startedAt + 150_000)).toBe(0);
    expect(isExpired(startedAt, 120, startedAt + 119_999)).toBe(false);
    expect(isExpired(startedAt, 120, startedAt + 120_000)).toBe(true);
  });

  it("resume reflects real elapsed wall-clock time without a paused state", () => {
    const startedAt = Date.UTC(2026, 6, 6, 12, 0, 0);
    const reopenedAt = startedAt + 75_500;

    expect(remainingMs(startedAt, 120, reopenedAt)).toBe(44_500);
  });
});
